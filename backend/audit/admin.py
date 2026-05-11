from django.contrib import admin
from .models import AuditLog

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("user", "action", "resource", "resource_id", "timestamp", "ip_address")
    list_filter = ("action", "resource")
    search_fields = ("user__username", "resource")
    readonly_fields = ("user", "action", "resource", "resource_id", "timestamp", "ip_address", "notes")
