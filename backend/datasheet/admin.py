# backend/datasheet/admin.py
#check

from django.contrib import admin
from .models import (
    BehaviorDefinition,
    DataEntry,
    DataSheetTemplate,
    DataSheetTemplateColumn,
    DataSheetTemplateRow,
    Session,
)

# Registering the models so they appear in the Django admin dashboard
admin.site.register(BehaviorDefinition)
admin.site.register(DataSheetTemplate)
admin.site.register(DataSheetTemplateColumn)
admin.site.register(DataSheetTemplateRow)

# We can customize how the Session looks in the admin panel
@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ('session_identifier', 'date', 'client_id', 'data_collector_id')
    search_fields = ('session_identifier', 'client_id')

@admin.register(DataEntry)
class DataEntryAdmin(admin.ModelAdmin):
    list_display = ('behavior', 'session', 'frequency_count', 'time_interval')
    list_filter = ('behavior', 'occurrence')