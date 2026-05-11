# Datasheet app

Django app for **data sheet templates**, **sessions** (submitted observations), and related models. The API is consumed by the React **Data Entry** and **Dashboard** flows.

Production-style setups use **MySQL** (e.g. Amazon RDS). Configure `DB_*` variables in **`backend/.env`**; `core.settings` loads them via `python-dotenv`.

---

## Prerequisites

- Python 3.12+ and dependencies from **`backend/requirements.txt`** (virtual environment recommended).
- **`backend/.env`** with at least `SECRET_KEY` and database settings (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`). Do **not** commit `.env` (it is listed in the repo root `.gitignore`).

---

## One-time or fresh database setup

Run from the **`backend`** directory:

```bash
cd backend
source ../venv/bin/activate   # or your venv path
python manage.py migrate
python manage.py seed_example_templates
python manage.py createsuperuser   # email-based login for the frontend
python manage.py runserver
```

Default API base: **http://127.0.0.1:8000/**

### Seeded templates

Template layouts are defined in **`seed_template_definitions.py`**. The management command **`seed_example_templates`** upserts those templates **by name** (replaces columns and rows for each listed template) and sets **`is_active=False`** for retired template names defined in the same file.

Safe to re-run when you update `seed_template_definitions.py`; it does **not** delete sessions or arbitrary custom templates that use **different** names.

---

## Quick command reference

| Task | Command |
|------|---------|
| Apply migrations | `python manage.py migrate` |
| Seed / refresh canonical templates | `python manage.py seed_example_templates` |
| Django shell | `python manage.py shell` |
| Run API | `python manage.py runserver` |

---

## API notes

- **`GET /api/datasheet/templates/`** returns a **lightweight list** (no nested columns/rows) for speed. **`GET /api/datasheet/templates/<uuid>/`** returns the full layout for Data Entry.
- **`CONN_MAX_AGE`** in `core.settings` helps reuse connections to remote MySQL (optional override: `DB_CONN_MAX_AGE` in `.env`).

---

## Frontend

1. Run the Django API (`runserver`).
2. In **`cs499-project`**, configure the API URL (e.g. `http://localhost:8000/api` — see `authFetch` / env in the Vite app).
3. `npm run dev`, then log in with a user from **`createsuperuser`**.

If templates fail to load with **401**, tokens may be expired — sign out and sign in again (especially after switching databases).

---

## Related docs

- **`GRAPHING_DATA.md`** — how `Session`, `DataEntry`, and `custom_values` are shaped for analytics/graphs.
