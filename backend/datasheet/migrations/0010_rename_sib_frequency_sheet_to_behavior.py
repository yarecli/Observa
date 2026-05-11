"""Rename SIB Frequency sheet → Behavior Frequency sheet; refresh default column labels (keys unchanged)."""

from django.db import migrations


OLD_NAME = "SIB Frequency sheet"
NEW_NAME = "Behavior Frequency sheet"
NEW_DESCRIPTION = (
    "Time + behavior / latency / Behavior 2 & Behavior 3 frequency columns (system DRI layout)."
)
COLUMN_LABELS = {
    "sib_frequency": "Behavior Frequency",
    "sib2_frequency": "Behavior 2 Frequency",
    "sib3_frequency": "Behavior 3 Frequency",
    "latency_from_snacktime_to_sib": "Latency from snacktime to Behavior",
}


def forward(apps, schema_editor):
    DataSheetTemplate = apps.get_model("datasheet", "DataSheetTemplate")
    DataSheetTemplateColumn = apps.get_model("datasheet", "DataSheetTemplateColumn")

    legacy = DataSheetTemplate.objects.filter(name=OLD_NAME).first()
    if legacy:
        conflict = DataSheetTemplate.objects.filter(name=NEW_NAME).exclude(pk=legacy.pk).exists()
        if not conflict:
            legacy.name = NEW_NAME
            legacy.description = NEW_DESCRIPTION
            legacy.save(update_fields=["name", "description"])

    for col in DataSheetTemplateColumn.objects.filter(
        template__is_system_template=True,
        key__in=COLUMN_LABELS,
    ):
        col.label = COLUMN_LABELS[col.key]
        col.save(update_fields=["label"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("datasheet", "0009_seed_templates_duration_sheet"),
    ]

    operations = [
        migrations.RunPython(forward, noop_reverse),
    ]
