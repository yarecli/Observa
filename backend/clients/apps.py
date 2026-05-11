# backend/clients/apps.py
"""
AppConfig entry point for Django's application registry.

``INSTALLED_APPS`` should list ``clients.apps.ClientsConfig`` (or ``clients``).
``name`` must match the Python package so migrations and models resolve correctly.
"""

from django.apps import AppConfig


class ClientsConfig(AppConfig):
    """Configuration for the clients application."""

    default_auto_field = "django.db.models.BigAutoField"  # type: ignore[assignment]
    name = "clients"
