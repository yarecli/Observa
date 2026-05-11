"""
Canonical template layouts for `manage.py seed_example_templates`.

Keep column *keys* aligned with `cs499-project/src/pages/DataEntry.tsx`:
- Duration grid: `trial_key` (legacy UI still accepts `minute`)
- Behavior Frequency Sheet: `behavior_frequency`, `behavior_2_frequency`, `behavior_3_frequency`, `latency_from_snacktime` (legacy: `sib_*`, `latency_from_snacktime_to_sib`, `chewy_frequency`, `mouthing_frequency`)
- Paper session grid: `session_number`, `response`, `duration` (legacy: `trial_number`; see `paperTrialColumnRoles`)

Edit this file when you change default layouts — the seed command imports from here only.
"""

from __future__ import annotations

from typing import TypedDict


class SeedColumn(TypedDict, total=False):
    key: str
    label: str
    field_type: str
    required: bool
    order: int


class SeedTemplate(TypedDict):
    name: str
    description: str
    columns: list[SeedColumn]
    rows: list[str]


SEED_TEMPLATES: list[SeedTemplate] = [
    {
        "name": "Duration Frequency Session",
        "description": "Per-trial duration and frequency collection (trial column, behavior, counts, duration, occurrence).",
        "columns": [
            {"key": "trial_key", "label": "Trial", "field_type": "number", "required": True},
            {"key": "behavior", "label": "Behavior", "field_type": "text", "required": True},
            {"key": "frequency_count", "label": "Frequency Count", "field_type": "number", "required": False},
            {"key": "duration_minutes", "label": "Duration (Minutes)", "field_type": "duration", "required": False},
            {"key": "occurrence", "label": "Occurrence (Yes/No)", "field_type": "boolean", "required": False},
            {"key": "passage_of_time", "label": "Passage of Time", "field_type": "text", "required": False},
        ],
        "rows": [f"Trial {i}" for i in range(1, 9)],
    },
    {
        "name": "Behavior Frequency Sheet",
        "description": "Time + behavior / latency / Behavior 2 & Behavior 3 frequency columns (system DRI layout).",
        "columns": [
            {"key": "time", "label": "Time", "field_type": "text", "required": False},
            {"key": "behavior_frequency", "label": "Behavior Frequency", "field_type": "number"},
            {
                "key": "latency_from_snacktime",
                "label": "Latency from snacktime",
                "field_type": "number",
            },
            {"key": "behavior_2_frequency", "label": "Behavior 2 Frequency", "field_type": "number"},
            {"key": "behavior_3_frequency", "label": "Behavior 3 Frequency", "field_type": "number"},
        ],
        "rows": [str(i) for i in range(1, 13)],
    },
    {
        "name": "Session/Response/Duration",
        "description": "Paper grid: session number, response, and duration per row (canonical keys for graphing).",
        "columns": [
            {"key": "session_number", "label": "Session", "field_type": "number", "required": True},
            {"key": "response", "label": "Response", "field_type": "text", "required": False},
            {"key": "duration", "label": "Duration", "field_type": "number", "required": False},
        ],
        "rows": [str(i) for i in range(1, 11)],
    },
]

# Template names to hide from the active list (historical / retired layouts).
RETIRE_TEMPLATE_NAMES: tuple[str, ...] = (
    "Data Sheet",
    "Maladaptive Behavior Data Sheet",
    "Interval Behavior Tracking",
    "ABC Event Tracking",
)
