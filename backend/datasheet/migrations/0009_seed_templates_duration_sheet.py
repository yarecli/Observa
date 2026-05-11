"""Re-run seed (idempotent) to add Duration and Frequency Session and updated rules."""

from django.core.management import call_command
from django.db import migrations


def run_seed(apps, schema_editor):
    call_command("seed_example_templates")


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("datasheet", "0008_seed_paper_templates_and_retire_legacy"),
    ]

    operations = [
        migrations.RunPython(run_seed, noop_reverse),
    ]
