# backend/datasheet/apps.py

from django.apps import AppConfig

class DatasheetConfig(AppConfig):
    # Specifies the default type of primary key to use for models (standard for Django 3.2+)
    default_auto_field = 'django.db.models.BigAutoField'
    
    # The name of the app as Django recognizes it
    name = 'datasheet'