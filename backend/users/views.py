# a view is a function that receives a request, does something, and sends back a response
# this is where the logic will go - for example, this could be where user logins are handled

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.core.mail import send_mail
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.conf import settings
from datetime import timedelta
from users.models import User
from users.permissions import isBCBA, isAnyRole
from audit.models import AuditLog
import random
import uuid

# generates a random 6 digit code
def generate_code():
    return str(random.randint(100000, 999999))

# emails the code to the user
def send_mfa_code(user, code):
    send_mail(
        subject="Your Login Code",
        message=f"Your verification code is: {code}\n\nThis code expires in 10 minutes. Do not share with anyone.",
        from_email=None,
        recipient_list=[user.email],
        fail_silently=False,
    )

# checks if the code is older than 10 minutes
def is_code_expired(created_at):
    return timezone.now() > created_at + timedelta(minutes=10)

# step 1 - user submits email and password
# if correct, generates and emails a code instead of returning a token
@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    email = request.data.get("email")
    password = request.data.get("password")

    user = authenticate(username=email, password=password)

    if user is None:
        # log failed login attempt
        AuditLog.objects.create(
            user=None,
            action="login",
            resource="user",
            resource_id=None,
            ip_address=request.META.get("REMOTE_ADDR"),
            notes=f"Failed login attempt for email: {email}"
        )
        return Response(
            {"error": "Invalid credentials"},
            status=status.HTTP_401_UNAUTHORIZED
        )

    # DEV/TEST: optionally bypass MFA completely (do not enable in production).
    if getattr(settings, "DISABLE_MFA", False):
        AuditLog.objects.create(
            user=user,
            action="login",
            resource="user",
            resource_id=user.id,
            ip_address=request.META.get("REMOTE_ADDR"),
            notes="Successful login (MFA bypass enabled)"
        )
        refresh = RefreshToken.for_user(user)
        return Response({
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "role": user.role,
            "id": user.id,
            "first_name": user.first_name,
            "last_name": user.last_name,
        }, status=status.HTTP_200_OK)

    code = generate_code()
    user.mfa_code = code
    user.mfa_code_created_at = timezone.now()
    user.save()

    try:
        send_mfa_code(user, code)
    except Exception as e:
        AuditLog.objects.create(
            user=user,
            action="login",
            resource="user",
            resource_id=user.id,
            ip_address=request.META.get("REMOTE_ADDR"),
            notes=f"MFA email failed to send: {type(e).__name__}"
        )
        return Response(
            {"error": "Unable to send verification code. Please contact an admin or enable dev MFA bypass."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    # log successful credential verification
    AuditLog.objects.create(
        user=user,
        action="login",
        resource="user",
        resource_id=user.id,
        ip_address=request.META.get("REMOTE_ADDR"),
        notes="Credentials verified, MFA code sent"
    )


    return Response(
        {"message": "Code sent to your email"},
        status=status.HTTP_200_OK
    )

# step 2 - user submits the code they received
# if correct and not expired, returns JWT tokens
@api_view(["POST"])
@permission_classes([AllowAny])
def verify_code(request):
    email = request.data.get("email")
    code = request.data.get("code")

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response(
            {"error": "User not found"},
            status=status.HTTP_404_NOT_FOUND
        )

    # DEV/TEST: allow a fixed bypass code (still requires a 2-step flow).
    bypass_code = getattr(settings, "DEV_MFA_BYPASS_CODE", "")
    if bypass_code and code == bypass_code:
        user.mfa_code = None
        user.mfa_code_created_at = None
        user.save()
        AuditLog.objects.create(
            user=user,
            action="login",
            resource="user",
            resource_id=user.id,
            ip_address=request.META.get("REMOTE_ADDR"),
            notes="Successful login (dev bypass code used)"
        )
        refresh = RefreshToken.for_user(user)
        return Response({
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "role": user.role,
            "id": user.id,
            "first_name": user.first_name,
            "last_name": user.last_name,
        })

    if user.mfa_code != code:
        # log failed MFA attempt
        AuditLog.objects.create(
            user=user,
            action="login",
            resource="user",
            resource_id=user.id,
            ip_address=request.META.get("REMOTE_ADDR"),
            notes="Failed MFA attempt - invalid code"
        )
        return Response(
            {"error": "Invalid code"},
            status=status.HTTP_401_UNAUTHORIZED
        )

    if is_code_expired(user.mfa_code_created_at):
        # log failed MFA attempt
        AuditLog.objects.create(
            user=user,
            action="login",
            resource="user",
            resource_id=user.id,
            ip_address=request.META.get("REMOTE_ADDR"),
            notes="Failed MFA attempt - code expired"
        )
        return Response(
            {"error": "Code has expired"},
            status=status.HTTP_401_UNAUTHORIZED
        )

    # clear the code so it cant be used again
    user.mfa_code = None
    user.mfa_code_created_at = None
    user.save()

    # log successful login
    AuditLog.objects.create(
        user=user,
        action="login",
        resource="user",
        resource_id=user.id,
        ip_address=request.META.get("REMOTE_ADDR"),
        notes="Successful login"
    )

    # generate and return JWT tokens
    refresh = RefreshToken.for_user(user)
    return Response({
        "refresh": str(refresh),
        "access": str(refresh.access_token),
        "role": user.role,
        "id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
    })

# returns the current logged in user's info
@api_view(["GET"])
@permission_classes([isAnyRole])
def get_current_user(request):
    user = request.user
    return Response({
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
    })

# set password endpoint - handles both initial setup and password reset
@api_view(["POST"])
@permission_classes([AllowAny])
def set_password(request):
    token = request.data.get("token")
    password = request.data.get("password")
    token_type = request.data.get("token_type")  # "invitation" or "reset"

    try:
        if token_type == "invitation":
            user = User.objects.get(invitation_token=token)

            # check if token is expired (24 hours)
            if timezone.now() > user.invitation_token_created_at + timedelta(hours=24):
                return Response(
                    {"error": "Invitation link has expired"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # validate password strength before setting it
            try:
                validate_password(password, user)
            except ValidationError as e:
                return Response(
                    {"error": list(e.messages)},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # set password and activate account
            user.set_password(password)
            user.is_activated = True
            user.invitation_token = None
            user.invitation_token_created_at = None
            user.save()

            # log account activation
            from audit.models import AuditLog
            AuditLog.objects.create(
                user=user,
                action="create",
                resource="user",
                resource_id=user.id,
                ip_address=request.META.get("REMOTE_ADDR"),
                notes="Account activated via invitation link"
            )

            return Response({"message": "Password set successfully, account activated"})

        elif token_type == "reset":
            user = User.objects.get(reset_token=token)

            # check if token is expired (30 minutes)
            if timezone.now() > user.reset_token_created_at + timedelta(minutes=30):
                return Response(
                    {"error": "Reset link has expired"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # validate password strength before setting it
            try:
                validate_password(password, user)
            except ValidationError as e:
                return Response(
                    {"error": list(e.messages)},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # set new password
            user.set_password(password)
            user.reset_token = None
            user.reset_token_created_at = None
            user.save()

            # log password reset
            from audit.models import AuditLog
            AuditLog.objects.create(
                user=user,
                action="update",
                resource="user",
                resource_id=user.id,
                ip_address=request.META.get("REMOTE_ADDR"),
                notes="Password reset successfully"
            )

            return Response({"message": "Password reset successfully"})

        return Response(
            {"error": "token_type must be 'invitation' or 'reset'"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    except User.DoesNotExist:
        return Response(
            {"error": "Invalid token"},
            status=status.HTTP_400_BAD_REQUEST
        )

# forgot password endpoint
@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    email = request.data.get("email")

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        # return success even if email not found to prevent email enumeration
        return Response({"message": "If that email exists you will receive a reset link"})

    # generate reset token
    user.reset_token = uuid.uuid4()
    user.reset_token_created_at = timezone.now()
    user.save()

    # send reset email
    reset_link = f"http://localhost:5173/reset-password?token={user.reset_token}"
    send_mail(
        subject="Password Reset Request",
        message=f"Hello {user.first_name},\n\nClick the link below to reset your password.\n\n{reset_link}\n\nThis link expires in 30 minutes.\n\nIf you did not request this, ignore this email.",
        from_email=None,
        recipient_list=[user.email],
        fail_silently=False,
    )

    # log password reset request
    from audit.models import AuditLog
    AuditLog.objects.create(
        user=user,
        action="update",
        resource="user",
        resource_id=user.id,
        ip_address=request.META.get("REMOTE_ADDR"),
        notes="Password reset requested"
    )

    return Response({"message": "If that email exists you will receive a reset link"})