# backend/clients/admin.py
"""
Django admin registration for Client and Caseload.

Superusers/staff use /admin/ to create or fix data without the REST API.
Ensure users.User is registered with search_fields if you use autocomplete_fields
on Caseload (staff FK).
"""

from django.contrib import admin

from .models import Caseload, Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    """
    List/search/filter configuration for the Client changelist.

    list_display: columns on the grid view.
    search_fields: OR search across these fields from the admin search box.
    list_filter: right sidebar filters (useful for active vs archived).
    """

    list_display = (
        "first_name",
        "last_name",
        "date_of_birth",
        "service_region",
        "site_code",
        "is_active",
        "created_at",
    )
    search_fields = (
        "first_name",
        "last_name",
        "medical_record_number",
        "service_region",
        "site_code",
    )
    list_filter = ("is_active", "service_region", "site_code")


@admin.register(Caseload)
class CaseloadAdmin(admin.ModelAdmin):
    """
    Manage which staff user is linked to which client.

    autocomplete_fields: type-ahead for client and staff (requires ModelAdmin
    search_fields on the related models).
    """

    list_display = ("client", "staff", "assigned_date")
    search_fields = (
        "client__first_name",
        "client__last_name",
        "staff__email",
        "staff__first_name",
        "staff__last_name",
    )
    list_filter = ("assigned_date",)
    autocomplete_fields = ("client", "staff")