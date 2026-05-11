# backend/datasheet/serializers.py

from rest_framework import serializers
from .models import (
    BehaviorDefinition,
    DataEntry,
    DataSheetTemplate,
    DataSheetTemplateColumn,
    DataSheetTemplateRow,
    Intervention,
    Session,
)


class BehaviorDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = BehaviorDefinition
        fields = "__all__"


class DataSheetTemplateColumnSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSheetTemplateColumn
        fields = ["id", "key", "label", "field_type", "order", "required"]


class DataSheetTemplateRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSheetTemplateRow
        fields = ["id", "row_label", "order"]


class DataSheetTemplateListSerializer(serializers.ModelSerializer):
    """
    Lightweight list payload — no nested columns/rows.
    Used for GET /templates/ so Dashboard / Data Entry do not pull full layouts (N+1 queries + large JSON).
    """

    class Meta:
        model = DataSheetTemplate
        fields = [
            "id",
            "name",
            "description",
            "is_system_template",
            "is_active",
        ]


class DataSheetTemplateSerializer(serializers.ModelSerializer):
    columns = DataSheetTemplateColumnSerializer(many=True)
    rows = DataSheetTemplateRowSerializer(many=True, required=False)

    class Meta:
        model = DataSheetTemplate
        fields = [
            "id",
            "name",
            "description",
            "is_system_template",
            "is_active",
            "created_by_id",
            "columns",
            "rows",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        columns_data = validated_data.pop("columns", [])
        rows_data = validated_data.pop("rows", [])
        template = DataSheetTemplate.objects.create(**validated_data)

        for column_data in columns_data:
            DataSheetTemplateColumn.objects.create(template=template, **column_data)
        for row_data in rows_data:
            DataSheetTemplateRow.objects.create(template=template, **row_data)
        return template

    def update(self, instance, validated_data):
        columns_data = validated_data.pop("columns", None)
        rows_data = validated_data.pop("rows", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if columns_data is not None:
            instance.columns.all().delete()
            for column_data in columns_data:
                DataSheetTemplateColumn.objects.create(template=instance, **column_data)

        if rows_data is not None:
            instance.rows.all().delete()
            for row_data in rows_data:
                DataSheetTemplateRow.objects.create(template=instance, **row_data)

        return instance


class DataEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = DataEntry
        fields = [
            "id",
            "behavior",
            "time_interval",
            "frequency_count",
            "duration_seconds",
            "duration_minutes",
            "occurrence",
            "behavior_occurrence_note",
            "trial_number",
            "day_number",
            "session_day_number",
            "row_label",
            "custom_values",
        ]


class InterventionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Intervention
        fields = ["id", "client_id", "precedes_session", "label", "description", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        """
        Always set client_id from the chosen session so POST cannot mismatch client vs session
        (DRF list responses use string UUIDs; comparing user-selected client to session is fragile).
        """
        precedes = attrs.get("precedes_session")
        if self.instance is not None:
            if precedes is None:
                precedes = self.instance.precedes_session
            attrs["client_id"] = precedes.client_id
        else:
            if precedes is None:
                raise serializers.ValidationError(
                    {"precedes_session": ["Select which session this intervention comes before."]}
                )
            attrs["client_id"] = precedes.client_id
        return attrs


class SessionSerializer(serializers.ModelSerializer):
    entries = DataEntrySerializer(many=True)
    selected_behaviors = serializers.PrimaryKeyRelatedField(
        many=True, queryset=BehaviorDefinition.objects.all(), required=False
    )
    data_collector_name = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = [
            "id",
            "client_id",
            "data_collector_id",
            "data_collector_name",
            "date",
            "session_identifier",
            "session_number",
            "trial_number",
            "day_number",
            "month",
            "day",
            "minute",
            "passage_of_time",
            "template",
            "selected_behaviors",
            "custom_columns",
            "custom_rows",
            "condition",
            "stimulus",
            "entries",
        ]

    def get_data_collector_name(self, obj):
        from users.models import User
        try:
            user = User.objects.get(id=obj.data_collector_id)
            return f"{user.first_name} {user.last_name}"
        except User.DoesNotExist:
            return "Unknown Collector"

    def create(self, validated_data):
        entries_data = validated_data.pop("entries")
        selected_behaviors = validated_data.pop("selected_behaviors", [])
        session = Session.objects.create(**validated_data)

        if selected_behaviors:
            session.selected_behaviors.set(selected_behaviors)

        for entry_data in entries_data:
            DataEntry.objects.create(session=session, **entry_data)
        return session

    def update(self, instance, validated_data):
        entries_data = validated_data.pop("entries", None)
        selected_behaviors = validated_data.pop("selected_behaviors", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if selected_behaviors is not None:
            instance.selected_behaviors.set(selected_behaviors)

        if entries_data is not None:
            instance.entries.all().delete()
            for entry_data in entries_data:
                DataEntry.objects.create(session=instance, **entry_data)

        return instance