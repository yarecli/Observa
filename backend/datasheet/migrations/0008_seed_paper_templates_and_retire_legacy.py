"""
Apply current paper templates and retire 0001_initial legacy layouts.

Runs the same logic as `manage.py seed_example_templates` (idempotent).
"""

from django.core.management import call_command
from django.db import migrations


def run_seed(apps, schema_editor):
    call_command("seed_example_templates")


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("datasheet", "0007_dedupe_custom_sib_frequency_templates"),
    ]

    operations = [
        migrations.RunPython(run_seed, noop_reverse),
    ]
