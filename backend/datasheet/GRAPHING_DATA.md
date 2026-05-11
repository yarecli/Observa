# Data for graphs (sessions & entries)

All BCBA-style paper templates (Data Sheet, DRI, duration grids, and custom variants) ultimately persist as **`Session`** rows with nested **`DataEntry`** rows. A future graphs feature should read from these models (or the REST API that exposes them), not from the React form state.

## Where to query

| Model | Role |
|-------|------|
| `Session` | One row per submitted data-entry session: client, date, template, time window (`passage_of_time`), `custom_columns` snapshot, M2M `selected_behaviors`. |
| `DataEntry` | Many rows per session: one per behavior (and per trial/interval row when the client posts multiple entries). |
| `BehaviorDefinition` | Stable behavior names/definitions; `DataEntry.behavior` FK points here. |
| `DataSheetTemplate` | Column/row layout; `Session.template` FK links which sheet was used. |

## Fields most useful for charts

- **Session**: `client_id`, `date`, `session_number`, `passage_of_time`, `template_id`, `custom_columns` (JSON), `selected_behaviors`.
- **DataEntry**: `behavior_id`, `frequency_count`, `duration_seconds`, `duration_minutes`, `occurrence`, `trial_number`, `time_interval`, `row_label`, `custom_values` (JSON).

Join `DataEntry` → `BehaviorDefinition` for behavior names. Filter by `client_id` and date range for client-specific charts.

## `custom_columns` (session-level)

The client may store a single object describing the sheet context (see `DataEntry.tsx` submit payloads), for example:

- **Data Sheet (trial)**: `behavior_occurred`, behaviors list with labels/definitions.
- **DRI**: `target_behavior_definitions`, optional `dri_grid_mode`: `"system_fixed"` (seeded three-column layout) vs `"dynamic"` (user-saved template; extra targets may use keys like `dri_session_freq_<id>` in `custom_values` / grid state).

Use `custom_columns` to recover labels/definitions that are not stored on `BehaviorDefinition` alone.

## `custom_values` (entry-level)

JSON bag for cell-level or sheet-specific data: notes, response text, latency, per-sheet keys, etc. Graphing code should treat these as **optional** extensions keyed by template column keys (e.g. `session_number` / legacy `trial_number` on the Session/Response/Duration paper grid; `behavior_frequency`, `latency_from_snacktime`, etc. on the Behavior Frequency Sheet).

## API

- `GET/POST /api/datasheet/sessions/` — list/create sessions (with nested entries when creating).
- `GET /api/datasheet/templates/<id>/` — template metadata (`is_system_template`, columns, rows).

## Notes

- System templates (`is_system_template=True`) are unchanged in the database when users edit a session; only **saved-as-new** templates are user-owned.
- `custom_columns` / `custom_values` are intentionally flexible so new paper layouts can be added without schema migrations; graphing features should key off `template_id` + `custom_columns` shape when needed.
