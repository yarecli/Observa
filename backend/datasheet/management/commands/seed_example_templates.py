from django.core.management.base import BaseCommand

from datasheet.seed_template_definitions import RETIRE_TEMPLATE_NAMES, SEED_TEMPLATES


class Command(BaseCommand):
    help = "Seed/overwrite templates defined in datasheet/seed_template_definitions.py"

    def handle(self, *args, **options):
        from datasheet.models import DataSheetTemplate, DataSheetTemplateColumn, DataSheetTemplateRow

        def upsert_template(name: str, description: str):
            tpl, _created = DataSheetTemplate.objects.get_or_create(
                name=name,
                defaults={
                    "description": description,
                    "is_system_template": True,
                    "is_active": True,
                },
            )
            tpl.description = description
            tpl.is_system_template = True
            tpl.is_active = True
            tpl.save()
            return tpl

        def replace_columns(tpl, columns):
            DataSheetTemplateColumn.objects.filter(template=tpl).delete()
            for idx, col in enumerate(columns):
                DataSheetTemplateColumn.objects.create(
                    template=tpl,
                    key=col["key"],
                    label=col["label"],
                    field_type=col.get("field_type", "text"),
                    order=col.get("order", idx),
                    required=col.get("required", False),
                )

        def replace_rows(tpl, row_labels):
            DataSheetTemplateRow.objects.filter(template=tpl).delete()
            for idx, label in enumerate(row_labels):
                DataSheetTemplateRow.objects.create(template=tpl, row_label=label, order=idx)

        # Rename legacy template rows so get_or_create matches SEED_TEMPLATES names (before upsert).
        for old_name, new_name in (
            ("SIB Frequency sheet", "Behavior Frequency Sheet"),
            ("Behavior Frequency sheet", "Behavior Frequency Sheet"),
            ("Trial/Response/Duration", "Session/Response/Duration"),
            ("Duration and Frequency Session", "Duration Frequency Session"),
        ):
            legacy_tpl = DataSheetTemplate.objects.filter(name=old_name).first()
            if legacy_tpl:
                taken = DataSheetTemplate.objects.filter(name=new_name).exclude(pk=legacy_tpl.pk).exists()
                if not taken:
                    legacy_tpl.name = new_name
                    legacy_tpl.save(update_fields=["name"])

        for name in RETIRE_TEMPLATE_NAMES:
            DataSheetTemplate.objects.filter(name=name).update(is_active=False)

        for spec in SEED_TEMPLATES:
            tpl = upsert_template(spec["name"], spec["description"])
            replace_columns(tpl, spec["columns"])
            replace_rows(tpl, spec["rows"])

        names = ", ".join(s["name"] for s in SEED_TEMPLATES)
        retired = ", ".join(RETIRE_TEMPLATE_NAMES)
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded/updated: {names}. "
                f"Set is_active=False for: {retired}."
            )
        )
