from django.db import migrations, models
import django.db.models.deletion
import uuid


def seed_default_templates(apps, schema_editor):
    DataSheetTemplate = apps.get_model("datasheet", "DataSheetTemplate")
    DataSheetTemplateColumn = apps.get_model("datasheet", "DataSheetTemplateColumn")
    DataSheetTemplateRow = apps.get_model("datasheet", "DataSheetTemplateRow")

    interval_template = DataSheetTemplate.objects.create(
        name="Interval Behavior Tracking",
        description="Session/trial based interval sheet with yes/no occurrence and count.",
        is_system_template=True,
    )
    interval_columns = [
        ("behavior", "Behavior", "text", True),
        ("frequency_count", "Frequency Count", "number", False),
        ("duration_seconds", "Duration (Seconds)", "duration", False),
        ("behavior_occurrence_note", "Behavior Occurred (Yes/No)", "boolean", True),
        ("trial_number", "Trial Number", "number", True),
        ("day_number", "Day Number", "number", False),
    ]
    for index, (key, label, field_type, required) in enumerate(interval_columns):
        DataSheetTemplateColumn.objects.create(
            template=interval_template,
            key=key,
            label=label,
            field_type=field_type,
            order=index,
            required=required,
        )
    for i in range(1, 11):
        DataSheetTemplateRow.objects.create(
            template=interval_template, row_label=f"Trial {i}", order=i
        )

    duration_template = DataSheetTemplate.objects.create(
        name="Duration and Frequency Session",
        description="Minute-by-minute duration/frequency collection sheet.",
        is_system_template=True,
    )
    duration_columns = [
        ("minute", "Minute", "number", True),
        ("behavior", "Behavior", "text", True),
        ("frequency_count", "Frequency Count", "number", False),
        ("duration_minutes", "Duration (Minutes)", "duration", False),
        ("occurrence", "Occurrence (Yes/No)", "boolean", False),
        ("passage_of_time", "Passage of Time", "text", False),
    ]
    for index, (key, label, field_type, required) in enumerate(duration_columns):
        DataSheetTemplateColumn.objects.create(
            template=duration_template,
            key=key,
            label=label,
            field_type=field_type,
            order=index,
            required=required,
        )
    for i in range(1, 9):
        DataSheetTemplateRow.objects.create(
            template=duration_template, row_label=f"Block {i}", order=i
        )

    abc_template = DataSheetTemplate.objects.create(
        name="ABC Event Tracking",
        description="Generic customizable event data sheet with behavior definitions.",
        is_system_template=True,
    )
    abc_columns = [
        ("date", "Date", "datetime", True),
        ("data_collector", "Data Collector", "text", True),
        ("session_number", "Session Number", "number", False),
        ("behavior", "Behavior Label", "text", True),
        ("custom_note", "Custom Note", "text", False),
        ("frequency_count", "Frequency", "number", False),
    ]
    for index, (key, label, field_type, required) in enumerate(abc_columns):
        DataSheetTemplateColumn.objects.create(
            template=abc_template,
            key=key,
            label=label,
            field_type=field_type,
            order=index,
            required=required,
        )


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="BehaviorDefinition",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("client_id", models.UUIDField()),
                ("name", models.CharField(max_length=100)),
                ("operational_definition", models.TextField()),
                (
                    "tracking_type",
                    models.CharField(
                        choices=[("FREQ", "Frequency"), ("DUR", "Duration"), ("PIR", "Partial Interval"), ("WIR", "Whole Interval")],
                        max_length=4,
                    ),
                ),
                ("created_by_id", models.UUIDField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
            ],
        ),
        migrations.CreateModel(
            name="DataSheetTemplate",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=100, unique=True)),
                ("description", models.TextField(blank=True, null=True)),
                ("is_system_template", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("created_by_id", models.UUIDField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="DataSheetTemplateColumn",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("key", models.CharField(max_length=100)),
                ("label", models.CharField(max_length=100)),
                (
                    "field_type",
                    models.CharField(
                        choices=[
                            ("text", "Text"),
                            ("number", "Number"),
                            ("boolean", "Boolean"),
                            ("duration", "Duration"),
                            ("datetime", "DateTime"),
                            ("choice", "Choice"),
                        ],
                        default="text",
                        max_length=20,
                    ),
                ),
                ("order", models.PositiveIntegerField(default=0)),
                ("required", models.BooleanField(default=False)),
                (
                    "template",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="columns", to="datasheet.datasheettemplate"),
                ),
            ],
            options={"ordering": ["order", "label"], "unique_together": {("template", "key")}},
        ),
        migrations.CreateModel(
            name="DataSheetTemplateRow",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("row_label", models.CharField(max_length=100)),
                ("order", models.PositiveIntegerField(default=0)),
                (
                    "template",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="rows", to="datasheet.datasheettemplate"),
                ),
            ],
            options={"ordering": ["order", "row_label"]},
        ),
        migrations.CreateModel(
            name="Session",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("client_id", models.UUIDField()),
                ("data_collector_id", models.UUIDField()),
                ("date", models.DateTimeField()),
                ("session_identifier", models.CharField(max_length=100)),
                ("session_number", models.PositiveIntegerField(blank=True, null=True)),
                ("trial_number", models.PositiveIntegerField(blank=True, null=True)),
                ("day_number", models.PositiveIntegerField(blank=True, null=True)),
                ("month", models.PositiveIntegerField(blank=True, null=True)),
                ("day", models.PositiveIntegerField(blank=True, null=True)),
                ("minute", models.PositiveIntegerField(blank=True, null=True)),
                ("passage_of_time", models.CharField(blank=True, max_length=100, null=True)),
                ("custom_columns", models.JSONField(blank=True, default=list)),
                ("custom_rows", models.JSONField(blank=True, default=list)),
                ("condition", models.CharField(blank=True, max_length=100, null=True)),
                ("stimulus", models.CharField(blank=True, max_length=100, null=True)),
                (
                    "template",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sessions", to="datasheet.datasheettemplate"),
                ),
                ("selected_behaviors", models.ManyToManyField(blank=True, to="datasheet.behaviordefinition")),
            ],
        ),
        migrations.CreateModel(
            name="DataEntry",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("time_interval", models.CharField(blank=True, max_length=50, null=True)),
                ("frequency_count", models.IntegerField(default=0)),
                ("duration_seconds", models.IntegerField(blank=True, null=True)),
                ("duration_minutes", models.IntegerField(blank=True, null=True)),
                ("occurrence", models.BooleanField(blank=True, null=True)),
                ("behavior_occurrence_note", models.BooleanField(blank=True, null=True)),
                ("trial_number", models.PositiveIntegerField(blank=True, null=True)),
                ("day_number", models.PositiveIntegerField(blank=True, null=True)),
                ("session_day_number", models.PositiveIntegerField(blank=True, null=True)),
                ("row_label", models.CharField(blank=True, max_length=100, null=True)),
                ("custom_values", models.JSONField(blank=True, default=dict)),
                ("behavior", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="datasheet.behaviordefinition")),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="entries", to="datasheet.session")),
            ],
        ),
        migrations.RunPython(seed_default_templates, migrations.RunPython.noop),
    ]
