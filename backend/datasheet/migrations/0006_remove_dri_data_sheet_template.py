from django.db import migrations


def remove_dri_template(apps, schema_editor):
    """Remove system 'DRI Data Sheet'; user-saved copies (e.g. 'SIB Frequency sheet') stay."""
    DataSheetTemplate = apps.get_model("datasheet", "DataSheetTemplate")
    DataSheetTemplate.objects.filter(name="DRI Data Sheet").delete()


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("datasheet", "0005_reapply_restore_original_system_templates"),
    ]

    operations = [
        migrations.RunPython(remove_dri_template, noop_reverse),
    ]
