from django.db import migrations


def _replace_template_columns(apps, template, columns):
    DataSheetTemplateColumn = apps.get_model("datasheet", "DataSheetTemplateColumn")
    DataSheetTemplateColumn.objects.filter(template=template).delete()
    for idx, col in enumerate(columns):
        DataSheetTemplateColumn.objects.create(
            template=template,
            key=col["key"],
            label=col["label"],
            field_type=col.get("field_type", "text"),
            order=col.get("order", idx),
            required=col.get("required", False),
        )


def _replace_template_rows(apps, template, row_labels):
    DataSheetTemplateRow = apps.get_model("datasheet", "DataSheetTemplateRow")
    DataSheetTemplateRow.objects.filter(template=template).delete()
    for idx, label in enumerate(row_labels):
        DataSheetTemplateRow.objects.create(template=template, row_label=label, order=idx)


def restore_original_system_templates_again(apps, schema_editor):
    """
    Re-run the restore logic even if a prior restore migration was already applied.
    Django migrations are one-shot; this migration exists to force applying the restore
    to the live DB after code was undone/redone.
    """
    DataSheetTemplate = apps.get_model("datasheet", "DataSheetTemplate")

    # A) Interval Behavior Tracking (rows updated by 0002)
    interval_template = DataSheetTemplate.objects.filter(name__in=["Interval Behavior Tracking", "DRI Data Sheet"]).first()
    if interval_template:
        interval_template.name = "Interval Behavior Tracking"
        interval_template.description = "Session/trial based interval sheet with yes/no occurrence and count."
        interval_template.is_system_template = True
        interval_template.is_active = True
        interval_template.save()

        interval_columns = [
            {"key": "behavior", "label": "Behavior", "field_type": "text", "required": True},
            {"key": "frequency_count", "label": "Frequency Count", "field_type": "number", "required": False},
            {"key": "duration_seconds", "label": "Duration (Seconds)", "field_type": "duration", "required": False},
            {"key": "behavior_occurrence_note", "label": "Behavior Occurred (Yes/No)", "field_type": "boolean", "required": True},
            {"key": "trial_number", "label": "Trial Number", "field_type": "number", "required": True},
            {"key": "day_number", "label": "Day Number", "field_type": "number", "required": False},
        ]
        _replace_template_columns(apps, interval_template, interval_columns)

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
        _replace_template_rows(apps, interval_template, interval_row_labels)

    # B) Duration and Frequency Session
    duration_template = DataSheetTemplate.objects.filter(name__in=["Duration and Frequency Session", "Data Sheet"]).first()
    if duration_template:
        duration_template.name = "Duration and Frequency Session"
        duration_template.description = "Minute-by-minute duration/frequency collection sheet."
        duration_template.is_system_template = True
        duration_template.is_active = True
        duration_template.save()

        duration_columns = [
            {"key": "minute", "label": "Minute", "field_type": "number", "required": True},
            {"key": "behavior", "label": "Behavior", "field_type": "text", "required": True},
            {"key": "frequency_count", "label": "Frequency Count", "field_type": "number", "required": False},
            {"key": "duration_minutes", "label": "Duration (Minutes)", "field_type": "duration", "required": False},
            {"key": "occurrence", "label": "Occurrence (Yes/No)", "field_type": "boolean", "required": False},
            {"key": "passage_of_time", "label": "Passage of Time", "field_type": "text", "required": False},
        ]
        _replace_template_columns(apps, duration_template, duration_columns)
        _replace_template_rows(apps, duration_template, [f"Block {i}" for i in range(1, 9)])

    # C) ABC Event Tracking
    abc_template = DataSheetTemplate.objects.filter(name__in=["ABC Event Tracking", "Maladaptive Behavior Data Sheet"]).first()
    if abc_template:
        abc_template.name = "ABC Event Tracking"
        abc_template.description = "Generic customizable event data sheet with behavior definitions."
        abc_template.is_system_template = True
        abc_template.is_active = True
        abc_template.save()

        abc_columns = [
            {"key": "date", "label": "Date", "field_type": "datetime", "required": True},
            {"key": "data_collector", "label": "Data Collector", "field_type": "text", "required": True},
            {"key": "session_number", "label": "Session Number", "field_type": "number", "required": False},
            {"key": "behavior", "label": "Behavior Label", "field_type": "text", "required": True},
            {"key": "custom_note", "label": "Custom Note", "field_type": "text", "required": False},
            {"key": "frequency_count", "label": "Frequency", "field_type": "number", "required": False},
        ]
        _replace_template_columns(apps, abc_template, abc_columns)
        _replace_template_rows(apps, abc_template, [])


class Migration(migrations.Migration):
    dependencies = [
        ("datasheet", "0002_update_interval_rows"),
    ]

    operations = [
        migrations.RunPython(restore_original_system_templates_again, migrations.RunPython.noop),
    ]

