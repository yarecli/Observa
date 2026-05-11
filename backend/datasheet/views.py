# backend/datasheet/views.py

from typing import Optional

from django.db.utils import DatabaseError
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from users.permissions import isAnyRole, isBCBAOrReadOnly
from .models import BehaviorDefinition, DataEntry, DataSheetTemplate, Intervention, Session
from .serializers import (
    BehaviorDefinitionSerializer,
    DataEntrySerializer,
    DataSheetTemplateListSerializer,
    DataSheetTemplateSerializer,
    InterventionSerializer,
    SessionSerializer,
)


def _intervention_missing_table_response(exc: Exception) -> Optional[Response]:
    """If the intervention migration was not applied, return JSON instead of a generic 500 HTML page."""
    msg = str(exc).lower()
    if (
        "datasheet_intervention" in msg
        or ("no such table" in msg and "intervention" in msg)
        or ('relation "' in msg and "does not exist" in msg and "intervention" in msg)
    ):
        return Response(
            {
                "detail": (
                    "The intervention table is missing. From the backend folder run: "
                    "python manage.py migrate"
                )
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return None


class BehaviorDefinitionViewSet(viewsets.ModelViewSet):
    """
    Handles fetching, creating, updating, and deleting Behavior Definitions.
    """
    queryset = BehaviorDefinition.objects.all()
    serializer_class = BehaviorDefinitionSerializer
    permission_classes = [isAnyRole]


class DataSheetTemplateViewSet(viewsets.ModelViewSet):
    """
    List/retrieve: any authenticated role (DSP/RBT need templates for data entry).
    Create/update/destroy: BCBA only (custom templates / sheet layout edits).
    Destroy: custom templates only — system templates cannot be deleted.
    List: only active templates (legacy interval/ABC sheets stay in DB for old sessions but are hidden).
    """
    queryset = DataSheetTemplate.objects.all()
    serializer_class = DataSheetTemplateSerializer
    permission_classes = [isBCBAOrReadOnly]

    def get_serializer_class(self):
        if getattr(self, "action", None) == "list":
            return DataSheetTemplateListSerializer
        return DataSheetTemplateSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self, "action", None) == "list":
            return qs.filter(is_active=True).order_by("name")
        # Retrieve / update / partial_update: one query for columns + one for rows (not per-template N+1).
        return qs.prefetch_related("columns", "rows")

    def perform_destroy(self, instance):
        if instance.is_system_template:
            raise PermissionDenied(
                detail="System templates cannot be deleted. Only custom templates may be removed."
            )
        super().perform_destroy(instance)


class SessionViewSet(viewsets.ModelViewSet):
    """
    Handles saving full data sheets. When a POST request hits this view,
    it uses the custom 'create' method in SessionSerializer.
    """
    queryset = Session.objects.all()
    serializer_class = SessionSerializer
    permission_classes = [isAnyRole]


class InterventionViewSet(viewsets.ModelViewSet):
    queryset = Intervention.objects.select_related("precedes_session")
    serializer_class = InterventionSerializer
    permission_classes = [isAnyRole]

    def handle_exception(self, exc):
        if isinstance(exc, DatabaseError):
            r = _intervention_missing_table_response(exc)
            if r is not None:
                return r
        return super().handle_exception(exc)

    def get_queryset(self):
        qs = super().get_queryset()
        client_id = self.request.query_params.get("client_id")
        if client_id:
            qs = qs.filter(client_id=client_id)
        return qs.order_by("created_at")


class DataEntryViewSet(viewsets.ModelViewSet):
    """
    Allows querying individual data entries if needed (e.g., getting all target behavior occurrences across all sessions).
    """
    queryset = DataEntry.objects.all()
    serializer_class = DataEntrySerializer
    permission_classes = [isAnyRole]
