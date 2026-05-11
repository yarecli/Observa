# Generated manually for Intervention model

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("datasheet", "0013_alter_session_data_collector_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="Intervention",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("client_id", models.UUIDField()),
                ("label", models.CharField(max_length=120)),
                ("description", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "precedes_session",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="interventions_before",
                        to="datasheet.session",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
    ]
