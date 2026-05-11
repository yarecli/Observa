# backend/clients/urls.py
"""
URL routing for the clients REST API.

Included from core/urls.py as path("api/clients/", include("clients.urls")).

DefaultRouter generates (typical patterns):
  GET/POST     /api/clients/profiles/
  GET/PUT/PATCH/DELETE /api/clients/profiles/{uuid}/
  GET/POST     /api/clients/caseloads/
  GET/PUT/PATCH/DELETE /api/clients/caseloads/{uuid}/

basename is only for DRF reverse URL names; it does not change the path.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ClientViewSet, CaseloadViewSet

router = DefaultRouter()
router.register(r"profiles", ClientViewSet, basename="client")
router.register(r"caseloads", CaseloadViewSet, basename="caseload")

urlpatterns = [
    path("", include(router.urls)),
]
