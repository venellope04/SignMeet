# models.py
import uuid
from django.conf import settings
from django.db import models


class Room(models.Model):
    name = models.CharField(max_length=255, unique=True)
    meeting_id = models.CharField(max_length=32, unique=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_rooms',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.meeting_id:
            self.meeting_id = uuid.uuid4().hex[:10]
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class ActivityLog(models.Model):
    EVENT_CHOICES = [
        ('signup', 'Signup'),
        ('login', 'Login'),
        ('logout', 'Logout'),
        ('join_room', 'Join Room'),
        ('click_action', 'Click Action'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='activity_logs',
    )
    room = models.ForeignKey(
        Room,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activity_logs',
    )
    event_type = models.CharField(max_length=32, choices=EVENT_CHOICES)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user} - {self.event_type}'
