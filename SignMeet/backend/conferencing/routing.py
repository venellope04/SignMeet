# backend/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/sign_detection/(?P<meeting_id>[\w-]+)/$', consumers.SignDetectionConsumer.as_asgi()),
]
