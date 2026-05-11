"""Rename Duration and Frequency Session → Duration Frequency Session."""

from django.db import migrations

OLD_NAME = "Duration and Frequency Session"
NEW_NAME = "Duration Frequency Session"


def forward(apps, schema_editor):
    DataSheetTemplate = apps.get_model("datasheet", "DataSheetTemplate")
    tpl = DataSheetTemplate.objects.filter(name=OLD_NAME).first()
    if tpl and not DataSheetTemplate.objects.filter(name=NEW_NAME).exclude(pk=tpl.pk).exists():
        tpl.name = NEW_NAME
        tpl.save(update_fields=["name"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("datasheet", "0011_rename_behavior_sheet_keys_and_session_template"),
    ]

    operations = [
        migrations.RunPython(forward, noop_reverse),
    ]
