"""
Local-only settings: same as core.settings but DATABASES points at backend/db.sqlite3.

Does not modify settings.py — MySQL credentials in .env stay as-is for when you switch back.

From the backend/ directory (where manage.py lives):

  source ../venv/bin/activate   # or your venv path
  export DJANGO_SETTINGS_MODULE=core.settings_sqlite
  python manage.py migrate
  python manage.py seed_example_templates
  python manage.py runserver

Undo local DB: delete backend/db.sqlite3
"""

from .settings import *  # noqa: F401,F403

import os
from pathlib import Path

# The main settings.py in this project does not define BASE_DIR,
# so we define it here for sqlite path building.
# settings_sqlite.py lives in backend/core/, so BASE_DIR should be backend/
BASE_DIR = Path(__file__).resolve().parent.parent

# Use a local sqlite file inside backend/
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": str(BASE_DIR / "db.sqlite3"),
    }
}

