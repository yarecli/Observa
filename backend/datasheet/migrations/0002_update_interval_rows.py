from django.db import migrations


def update_interval_template_rows(apps, schema_editor):
    DataSheetTemplate = apps.get_model("datasheet", "DataSheetTemplate")
    DataSheetTemplateRow = apps.get_model("datasheet", "DataSheetTemplateRow")

    template = DataSheetTemplate.objects.filter(name="Interval Behavior Tracking").first()
    if not template:
        return

    interval_row_labels = [
        "9:00-9:15",
        "9:16-9:30",
        "9:31-9:45",
        "9:46-10:00",
        "10:01-10:15",
        "10:16-10:30",
        "10:31-10:45",
        "10:46-11:00",
        "11:01-11:15",
        "11:16-11:30",
        "11:31-11:45",
        "11:46-12:00",
    ]

    # Replace rows so the UI table shows the real paper-like intervals.
    DataSheetTemplateRow.objects.filter(template=template).delete()
    for idx, label in enumerate(interval_row_labels):
        DataSheetTemplateRow.objects.create(template=template, row_label=label, order=idx)


class Migration(migrations.Migration):
    dependencies = [
        ("datasheet", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(update_interval_template_rows, migrations.RunPython.noop),
    ]

