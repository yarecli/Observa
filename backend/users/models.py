# this file defines what the users database table looks like, i.e. the attributes for any user
from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager
import uuid

# custom manager needed when removing username from AbstractUser
# handles creating regular users and superusers using email instead
class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save()
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)

# AbstractUser is a class that comes pre configured with fields for hashed passwords, permissions, etc.
class User(AbstractUser):
    # remove username entirely, email is used instead
    username = None

    ROLE_CHOICES = [
        ("bcba", "BCBA"),
        ("rbt", "RBT"),
        ("dsp", "DSP"),
    ]

    # role attribute, default is the lowest role (dsp)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="dsp")

    # first and last name are required when adding a user
    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)

    # email is the unique identifier used for login instead of username
    email = models.EmailField(unique=True)

    # temporary fields to store the code for MFA, should not allow multiple at a time for one user
    mfa_code = models.CharField(max_length=6, null=True, blank=True)
    mfa_code_created_at = models.DateTimeField(null=True, blank=True)

    # invitation token fields
    # uuid generates a unique random string for each token
    invitation_token = models.UUIDField(default=uuid.uuid4, null=True, blank=True)
    invitation_token_created_at = models.DateTimeField(null=True, blank=True)
    is_activated = models.BooleanField(default=False)  # false until user sets their password

    # password reset token fields
    reset_token = models.UUIDField(null=True, blank=True)
    reset_token_created_at = models.DateTimeField(null=True, blank=True)

    # tells Django to use email as the login field instead of username
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    # use our custom manager
    objects = UserManager()

    # return name neatly
    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.email})"
