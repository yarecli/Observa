# backend/datasheet/models.py

from django.db import models
import uuid


class DataSheetTemplate(models.Model):
    """
    Reusable sheet structures that authorized personnel can select from.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    is_system_template = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_by_id = models.UUIDField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class DataSheetTemplateColumn(models.Model):
    """
    Defines customizable, user-labeled columns for a template.
    """
    FIELD_TYPE_CHOICES = [
        ("text", "Text"),
        ("number", "Number"),
        ("boolean", "Boolean"),
        ("duration", "Duration"),
        ("datetime", "DateTime"),
        ("choice", "Choice"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        DataSheetTemplate, related_name="columns", on_delete=models.CASCADE
    )
    key = models.CharField(max_length=100)
    label = models.CharField(max_length=100)
    field_type = models.CharField(max_length=20, choices=FIELD_TYPE_CHOICES, default="text")
    order = models.PositiveIntegerField(default=0)
    required = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "label"]
        unique_together = ("template", "key")

    def __str__(self):
        return f"{self.template.name} - {self.label}"


class DataSheetTemplateRow(models.Model):
    """
    Optional default rows/trials for templates.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        DataSheetTemplate, related_name="rows", on_delete=models.CASCADE
    )
    row_label = models.CharField(max_length=100)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "row_label"]

    def __str__(self):
        return f"{self.template.name} - {self.row_label}"


class BehaviorDefinition(models.Model):
    """
    Stores the behaviors defined by the BCBA. 
    Kept separate so behaviors can be updated or archived without losing past data.
    """
    TRACKING_CHOICES = [
        ('FREQ', 'Frequency'),
        ('DUR', 'Duration'),
        ('PIR', 'Partial Interval'),
        ('WIR', 'Whole Interval'),
    ]

    # Uses a UUID instead of a standard 1, 2, 3 ID for better security and scaling
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_id = models.UUIDField() # Links to the specific client
    name = models.CharField(max_length=100) # e.g., "Hand flapping", "Mouthing"
    operational_definition = models.TextField() # Detailed description of the behavior
    tracking_type = models.CharField(max_length=4, choices=TRACKING_CHOICES)
    created_by_id = models.UUIDField(blank=True, null=True)
    
    # Allows a behavior to be hidden from new data sheets without deleting historical records
    is_active = models.BooleanField(default=True) 

    def __str__(self):
        return self.name


class Session(models.Model):
    """
    Captures the metadata for a specific observation period (the top of the paper data sheet).

    Graphing / analytics: see GRAPHING_DATA.md for how session + entries relate to templates
    (Data Sheet, DRI, duration grids, etc.) and which fields to query for charts.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_id = models.UUIDField()
    data_collector_id = models.IntegerField() # ID of the staff/RBT collecting data
    date = models.DateTimeField() # When the session happened
    session_identifier = models.CharField(max_length=100) # e.g., "Session 1", "Morning Shift"
    session_number = models.PositiveIntegerField(blank=True, null=True)
    trial_number = models.PositiveIntegerField(blank=True, null=True)
    day_number = models.PositiveIntegerField(blank=True, null=True)
    month = models.PositiveIntegerField(blank=True, null=True)
    day = models.PositiveIntegerField(blank=True, null=True)
    minute = models.PositiveIntegerField(blank=True, null=True)
    passage_of_time = models.CharField(max_length=100, blank=True, null=True)
    template = models.ForeignKey(
        DataSheetTemplate, related_name="sessions", on_delete=models.SET_NULL,
        blank=True, null=True
    )
    selected_behaviors = models.ManyToManyField(BehaviorDefinition, blank=True)
    custom_columns = models.JSONField(default=list, blank=True)
    custom_rows = models.JSONField(default=list, blank=True)
    
    # Optional fields for specific environmental setups
    condition = models.CharField(max_length=100, blank=True, null=True)
    stimulus = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return f"Session {self.session_identifier} on {self.date.strftime('%Y-%m-%d')}"


class Intervention(models.Model):
    """
    Marks a treatment change on the client timeline. Shown on session graphs as a vertical
    line at the session that follows the intervention (between the prior session and this one).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client_id = models.UUIDField()
    precedes_session = models.ForeignKey(
        Session,
        on_delete=models.CASCADE,
        related_name="interventions_before",
    )
    label = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Intervention {self.label} (before session {self.precedes_session_id})"


class DataEntry(models.Model):
    """
    The actual data points recorded. Links a specific behavior to a specific session.

    Graphing: numeric series typically use frequency_count, duration_*, trial_number, time_interval,
    and behavior_id; sheet-specific cells may appear in custom_values. See GRAPHING_DATA.md.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Links back to the Session. 'related_name' allows us to easily fetch all entries for a session.
    session = models.ForeignKey(Session, related_name='entries', on_delete=models.CASCADE)
    
    # Links to the Behavior. on_delete=models.PROTECT prevents accidentally deleting a behavior that has data attached.
    behavior = models.ForeignKey(BehaviorDefinition, on_delete=models.PROTECT)
    
    # Optional fields depending on the tracking_type
    time_interval = models.CharField(max_length=50, blank=True, null=True) # e.g., "9:00-9:15"
    frequency_count = models.IntegerField(default=0)
    duration_seconds = models.IntegerField(blank=True, null=True)
    duration_minutes = models.IntegerField(blank=True, null=True)
    occurrence = models.BooleanField(blank=True, null=True) # Used for Yes/No interval tracking (PIR/WIR)
    behavior_occurrence_note = models.BooleanField(blank=True, null=True)
    trial_number = models.PositiveIntegerField(blank=True, null=True)
    day_number = models.PositiveIntegerField(blank=True, null=True)
    session_day_number = models.PositiveIntegerField(blank=True, null=True)
    row_label = models.CharField(max_length=100, blank=True, null=True)
    custom_values = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"{self.behavior.name} - {self.time_interval}"