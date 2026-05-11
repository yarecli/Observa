# backend/clients/models.py
"""
Database models for individuals receiving services and their assignment to staff.

- Client: one row per person served; holds demographics and routing/placement text.
- Caseload: many-to-many-style link table (client + staff user). API list filtering
  for non-admins uses this table to decide which Client rows a user may see.

Primary keys are UUIDs so IDs are safe to expose in APIs and URLs without leaking
sequential counts.
"""

from django.conf import settings
from django.db import models
import uuid


class Client(models.Model):
    """
    Person receiving services (ABA/clinical context in this project).

    Staff logins and roles live in ``users.User``. This model does not FK to staff
    directly for “who works with this client”; use ``Caseload`` for that.

    ``is_active`` supports soft-archive: discharged clients stay in the DB for
    history but are hidden from normal lists (see ClientViewSet queryset).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    diagnosis = models.CharField(max_length=255, blank=True, null=True)

    gender = models.CharField(max_length=50, blank=True)
    preferred_language = models.CharField(max_length=50, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    street_address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=50, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)

    medical_record_number = models.CharField(max_length=64, blank=True)
    # Broader org / geography bucket (reporting, routing).
    service_region = models.CharField(
        max_length=100,
        blank=True,
        help_text="Organizational region used for routing and reporting.",
    )
    # Specific clinic, campus, or program site code.
    site_code = models.CharField(
        max_length=100,
        blank=True,
        help_text="Clinic, campus, or site identifier for routing.",
    )
    # Residential / day-program label (e.g. "Group Home 1", "2nd Ave").
    placement = models.CharField(
        max_length=255,
        blank=True,
        help_text="Group home, residential site, or address label (e.g. Group Home 1, 2nd Ave).",
    )

    is_active = models.BooleanField(default=True)  # type: ignore[arg-type]
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name}"


class Caseload(models.Model):
    """
    Assigns one staff ``User`` to one ``Client`` (personal caseload / team roster).

    - ``related_name='assigned_staff'`` on Client: ``client.assigned_staff`` → Caseload rows.
    - ``related_name='caseloads'`` on User: ``user.caseloads`` → Caseload rows.

    UniqueConstraint on (client, staff): the same person cannot be linked twice
    to the same client. Deleting a Client CASCADE-deletes its Caseload rows.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name="assigned_staff"
    )
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="caseloads",
    )
    assigned_date = models.DateField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["client", "staff"],
                name="clients_caseload_unique_client_staff",
            )
        ]

    def __str__(self) -> str:
        try:
            staff_name = self.staff.get_full_name() or self.staff.email
        except (AttributeError, TypeError):
            staff_name = "Unknown Staff"
        return f"{staff_name} → {self.client.first_name} {self.client.last_name}"
