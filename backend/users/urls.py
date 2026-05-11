# when a request comes in from the frontend, this file is what directs it to the correct function in views.py
from django.urls import path
from . import views

urlpatterns = [
    # will update with any necessary urls
    path("login/", views.login),
    path("verify/", views.verify_code),
    path("me/", views.get_current_user),
    path("set-password/", views.set_password),
    path("request-reset/", views.forgot_password),
    path("reset-password/", views.set_password),
]