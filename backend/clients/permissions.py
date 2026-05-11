"""
DRF permission classes for the clients app (client profiles + caseload).

These complement users.permissions (isAnyRole, isBCBA, etc.). Viewsets pick
permissions per action in clients/views.py get_permissions().

Org admin  = Django ``is_staff`` or ``is_superuser`` on users.User.
BCBA       = ``user.role == "bcba"`` (see users.models.User.ROLE_CHOICES).
"""

from rest_framework.permissions import BasePermission

from users.models import User


def _as_user(user):
    """
    Narrow ``request.user`` to our concrete User model for role/flag checks.

    Returns None if the principal is anonymous or not a users.User instance
    (e.g. wrong auth backend), so callers treat it as no access.
    """
    return user if isinstance(user, User) else None


class isOrgAdmin(BasePermission):
    """
    True for Django staff or superuser.

    Used for destructive/sensitive actions (e.g. soft-delete client) that should
    not be available to clinical roles alone.
    """

    def has_permission(self, request, view):
        u = _as_user(request.user)
        return u is not None and bool(u.is_staff or u.is_superuser)


class isBCBAOrOrgAdmin(BasePermission):
    """
    True for org admin OR user with role bcba.

    Used for creating/editing clients and for managing caseload assignments
    (RBT/DSP cannot assign others via API with this gate).
    """

    def has_permission(self, request, view):
        u = _as_user(request.user)
        if u is None:
            return False
        return bool(u.is_staff or u.is_superuser or u.role == "bcba")
