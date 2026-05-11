# backend/clients/serializers.py
"""
DRF serializers: convert Client / Caseload models to JSON and back.

Used by ClientViewSet and CaseloadViewSet. Nested read-only serializers avoid N+1
queries when the viewset uses select_related on Caseload.
"""

from rest_framework import serializers
from users.models import User

from .models import Caseload, Client


class StaffSummarySerializer(serializers.ModelSerializer):
    """
    Small public view of a staff user for nested JSON on caseload responses.

    Read-only in practice when embedded under CaseloadSerializer; exposes id,
    email, name, and clinical role (bcba/rbt/dsp) without password or tokens.
    """

    class Meta:  # type: ignore[misc]
        model = User
        fields = ("id", "email", "first_name", "last_name", "role")


class ClientSerializer(serializers.ModelSerializer):
    """Maps all Client model fields for create/update/list/detail."""

    class Meta:  # type: ignore[misc]
        model = Client
        fields = "__all__"


class CaseloadSerializer(serializers.ModelSerializer):
    """
    Caseload with optional nested snapshots for UIs that need names without extra GETs.

    - client, staff: write with PK (UUID) on create/update.
    - client_details, staff_details: read-only nested objects from the FKs.
    """

    client_details = ClientSerializer(source="client", read_only=True)
    staff_details = StaffSummarySerializer(source="staff", read_only=True)

    class Meta:  # type: ignore[misc]
        model = Caseload
        fields = (
            "id",
            "client",
            "staff",
            "assigned_date",
            "client_details",
            "staff_details",
        )
