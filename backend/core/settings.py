# main configuration file

# load environment variables into the application
from dotenv import load_dotenv
import os

from datetime import timedelta

load_dotenv()

# key used by Django to encrypt sessions and tokens
SECRET_KEY = os.getenv("SECRET_KEY")

DEBUG = True
ALLOWED_HOSTS = ["*"] # controls what hostnames can access the app, will need to set this to the actual domain

# DEV/TEST toggles (keep defaults secure)
DISABLE_MFA = os.getenv("DISABLE_MFA", "false").lower() == "true"
DEV_MFA_BYPASS_CODE = os.getenv("DEV_MFA_BYPASS_CODE", "").strip()  # e.g. "000000"

# these are the apps Django needs to know about
INSTALLED_APPS = [
    "django.contrib.admin", # admin panel at /admin
    "django.contrib.auth", # built in authentication system
    "django.contrib.contenttypes", 
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "users.apps.UsersConfig", # custom users app, every app we make will need a line like this
    "clients.apps.ClientsConfig", # clients app for caseload/client records
    "audit.apps.AuditConfig", # used for audit logging
    "datasheet.apps.DatasheetConfig",
]

# middleware is the layer between the web server and our application
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls" 
WSGI_APPLICATION = "core.wsgi.application"

# only allows requests from our React server
# needs to be set to the actual doman
CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]

# configuration for the database
DATABASES = { 
    "default": {
        "ENGINE": "mysql.connector.django", # driver for MySQL
        "NAME": os.getenv("DB_NAME"),
        "USER": os.getenv("DB_USER"),
        "PASSWORD": os.getenv("DB_PASSWORD"),
        "HOST": os.getenv("DB_HOST"),
        "PORT": os.getenv("DB_PORT"),
        # Reuse TCP connections to RDS — avoids a full handshake on every request (helps local dev + API).
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
        "OPTIONS": {
            "sql_mode": "STRICT_TRANS_TABLES",
        }
    }
}

AUTH_USER_MODEL = "users.User" # uses our custom user model

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {
            "min_length": 12,
        }
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# JWT tokens will be used for authentication
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    # Require a valid JWT unless a view explicitly allows anonymous access (e.g. login, token refresh).
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
}

# template configuration for rendering HTML
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True, # Django will look for templates in each app's template folder
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# time limit for tokens
SIMPLE_JWT = {
    # Longer access lifetime + frontend refresh (SessionRefresh + authFetch) avoids losing a data sheet mid-entry.
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

# admin session expires after 30 minutes of inactivity
SESSION_COOKIE_AGE = 1800  # 30 minutes in seconds
SESSION_SAVE_EVERY_REQUEST = True  # resets the timer on every request

# info for email MFA
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")

STATIC_URL = "/static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"