from django.db import models
from users.models import User

class AuditLog(models.Model):
    ACTION_CHOICES = [
        ("create", "Create"),
        ("read", "Read"),
        ("update", "Update"),
        ("delete", "Delete"),
        ("login", "Login"),
        ("logout", "Logout"),
    ]
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    resource = models.CharField(max_length=100)
    resource_id = models.IntegerField(null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.user} - {self.action} - {self.resource} - {self.timestamp}"
