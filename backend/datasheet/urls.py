# backend/datasheet/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BehaviorDefinitionViewSet,
    DataEntryViewSet,
    DataSheetTemplateViewSet,
    InterventionViewSet,
    SessionViewSet,
)

# A DefaultRouter automatically creates the standard RESTful routes (GET, POST, etc.) for your ViewSets
router = DefaultRouter()
router.register(r'behaviors', BehaviorDefinitionViewSet, basename='behavior')
router.register(r"templates", DataSheetTemplateViewSet, basename="datasheet-template")
router.register(r'sessions', SessionViewSet, basename='session')
router.register(r'interventions', InterventionViewSet, basename='intervention')
router.register(r'entries', DataEntryViewSet, basename='entry')

# The urlpatterns list makes these routes available to the main Django project
urlpatterns = [
    path('', include(router.urls)),
]