# Generated manually — removes extra custom SIB-frequency duplicate (keeps oldest).

from django.db import migrations


def dedupe_sib_custom_templates(apps, schema_editor):
    DataSheetTemplate = apps.get_model("datasheet", "DataSheetTemplate")
    # Non-system templates whose name suggests SIB frequency (case-insensitive)
    qs = (
        DataSheetTemplate.objects.filter(is_system_template=False)
        .filter(name__icontains="sib")
        .filter(name__icontains="frequency")
        .order_by("created_at")
    )
    pks = list(qs.values_list("pk", flat=True))
    if len(pks) <= 1:
        return
    # Keep oldest; remove newer duplicates
    for pk in pks[1:]:
        DataSheetTemplate.objects.filter(pk=pk).delete()


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("datasheet", "0006_remove_dri_data_sheet_template"),
    ]

    operations = [
        migrations.RunPython(dedupe_sib_custom_templates, noop_reverse),
    ]
