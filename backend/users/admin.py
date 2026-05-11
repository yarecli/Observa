# this file allows us to edit users from the admin panel
# admin.py may not be needed for every app, only if you want to be able to access it from the admin panel

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.core.mail import send_mail
from django.utils import timezone
from .models import User
import uuid

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    model = User
    list_display = ("email", "first_name", "last_name", "role", "is_activated", "is_active")
    list_filter = ("role", "is_activated", "is_active")
    fieldsets = (
        (None, {"fields": ("password",)}),
        ("Personal Info", {"fields": ("first_name", "last_name", "email")}),
        ("Role", {"fields": ("role",)}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser")}),
        ("Status", {"fields": ("is_activated",)}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "first_name", "last_name", "role", "password1", "password2"),
        }),
)
    search_fields = ("email", "first_name", "last_name")
    ordering = ("email",)

    def save_model(self, request, obj, form, change):
        is_new = obj.pk is None

        if is_new:
            obj.set_unusable_password()
            obj.invitation_token = uuid.uuid4()
            obj.invitation_token_created_at = timezone.now()
            obj.is_activated = False

        super().save_model(request, obj, form, change)

        if is_new:
            invitation_link = f"http://localhost:5173/set-password?token={obj.invitation_token}"
            send_mail(
                subject="You have been invited to Observa",
                message=f"Hello {obj.first_name},\n\nYou have been invited to Observa. Click the link below to set your password and activate your account.\n\n{invitation_link}\n\nThis link expires in 24 hours.",
                from_email=None,
                recipient_list=[obj.email],
                fail_silently=False,
            )