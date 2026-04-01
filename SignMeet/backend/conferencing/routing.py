# backend/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/sign_detection/', consumers.SignDetectionConsumer.as_asgi()),
]

