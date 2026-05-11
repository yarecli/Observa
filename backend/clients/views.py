# backend/clients/views.py
"""
DRF viewsets exposed under /api/clients/ (see urls.py).

ClientViewSet
    - list/retrieve: any authenticated user, but queryset is filtered by caseload
      unless the user is Django staff/superuser (see get_queryset).
    - create, update, partial_update: BCBA or org admin only.
    - destroy: org admin only; implemented as soft-delete (is_active=False).

CaseloadViewSet
    - list/retrieve: same queryset scoping idea (admins see all; others see rows
      tied to clients on their caseload).
    - create, update, partial_update, destroy: BCBA or org admin only.

JWT auth is configured globally in REST_FRAMEWORK settings; request.user is users.User.
"""

from rest_framework import viewsets

from users.models import User
from users.permissions import isAnyRole

from .models import Caseload, Client
from .permissions import isBCBAOrOrgAdmin, isOrgAdmin
from .serializers import CaseloadSerializer, ClientSerializer


class ClientViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for ``Client`` rows at ``/api/clients/profiles/``.

    Permissions vary by HTTP verb / action (get_permissions). Data visibility for
    list/retrieve is enforced in get_queryset, not only in the frontend.
    """

    serializer_class = ClientSerializer

    def get_permissions(self):
        """
        Map Django REST Framework (DRF) actions to permission classes.

        - create / update / partial_update → isBCBAOrOrgAdmin
        - destroy → isOrgAdmin (archive only; see perform_destroy)
        - list / retrieve → isAnyRole (queryset still restricts rows)
        """
        if self.action in ("create", "update", "partial_update"):
            return [isBCBAOrOrgAdmin()]
        if self.action == "destroy":
            return [isOrgAdmin()]
        return [isAnyRole()]

    def get_queryset(self):
        """
        Return clients the current user is allowed to see.

        - Anonymous or non-User: empty queryset.
        - Staff/superuser: all active clients.
        - Otherwise: clients that have a Caseload row with staff=self.request.user.
        """
        user = self.request.user
        if not user.is_authenticated or not isinstance(user, User):
            return Client.objects.none()

        if user.is_staff or user.is_superuser:
            return Client.objects.filter(is_active=True)

        assigned_client_ids = Caseload.objects.filter(staff=user).values_list(
            "client_id", flat=True
        )
        return Client.objects.filter(id__in=assigned_client_ids, is_active=True)

    def perform_destroy(self, instance):
        """
        Soft-delete: keep the row for history, hide from normal API lists.

        Does not remove Caseload rows; they remain unless you delete the Client
        with a hard delete elsewhere (not used by this viewset).
        """
        instance.is_active = False
        instance.save()


class CaseloadViewSet(viewsets.ModelViewSet):
    """
    CRUD for ``Caseload`` at ``/api/clients/caseloads/``.

    Use this to attach staff users to clients (and to read who is on a team).
    """

    serializer_class = CaseloadSerializer

    def get_permissions(self):
        """Writes require BCBA or org admin; safe methods allow any authenticated user."""
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [isBCBAOrOrgAdmin()]
        return [isAnyRole()]

    def get_queryset(self):
        """
        Caseload rows visible to this user.

        - Admins: all rows (with select_related for client/staff).
        - Others: rows whose client_id appears in that user's personal caseload
          (same rule as ClientViewSet: must already be assigned to see team rows).
        """
        user = self.request.user
        if not user.is_authenticated or not isinstance(user, User):
            return Caseload.objects.none()

        if user.is_staff or user.is_superuser:
            return Caseload.objects.select_related("client", "staff")

        assigned_client_ids = Caseload.objects.filter(staff=user).values_list(
            "client_id", flat=True
        )
        return Caseload.objects.filter(client_id__in=assigned_client_ids).select_related(
            "client", "staff"
        )
