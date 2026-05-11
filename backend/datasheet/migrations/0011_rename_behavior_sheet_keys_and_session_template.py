"""
Rename DRI column keys (behavior_* + latency_from_snacktime), paper grid trial_number → session_number,
and template titles (Behavior Frequency Sheet, Session/Response/Duration).
"""

from django.db import migrations

TEMPLATE_RENAMES = [
    ("SIB Frequency sheet", "Behavior Frequency Sheet"),
    ("Behavior Frequency sheet", "Behavior Frequency Sheet"),
    ("Trial/Response/Duration", "Session/Response/Duration"),
]

DRI_KEY_MAP = {
    "sib_frequency": "behavior_frequency",
    "sib2_frequency": "behavior_2_frequency",
    "sib3_frequency": "behavior_3_frequency",
    "latency_from_snacktime_to_sib": "latency_from_snacktime",
}


def forward(apps, schema_editor):
    DataSheetTemplate = apps.get_model("datasheet", "DataSheetTemplate")
    Col = apps.get_model("datasheet", "DataSheetTemplateColumn")

    for old_name, new_name in TEMPLATE_RENAMES:
        tpl = DataSheetTemplate.objects.filter(name=old_name).first()
        if tpl and not DataSheetTemplate.objects.filter(name=new_name).exclude(pk=tpl.pk).exists():
            tpl.name = new_name
            tpl.save(update_fields=["name"])

    for old_key, new_key in DRI_KEY_MAP.items():
        for col in Col.objects.filter(key=old_key):
            if Col.objects.filter(template=col.template, key=new_key).exists():
                continue
            col.key = new_key
            if old_key == "latency_from_snacktime_to_sib":
                col.label = "Latency from snacktime"
            col.save(update_fields=["key", "label"])

    for col in Col.objects.filter(key="trial_number"):
        tpl = col.template
        keys = set(Col.objects.filter(template=tpl).values_list("key", flat=True))
        if not keys >= {"trial_number", "response", "duration"}:
            continue
        if Col.objects.filter(template=tpl, key="session_number").exists():
            continue
        col.key = "session_number"
        col.label = "Session"
        col.save(update_fields=["key", "label"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("datasheet", "0010_rename_sib_frequency_sheet_to_behavior"),
    ]

    operations = [
        migrations.RunPython(forward, noop_reverse),
    ]
