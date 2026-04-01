# Generated manually for SignMeet room identity and user activity logs

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


def populate_room_meeting_ids(apps, schema_editor):
    Room = apps.get_model('conferencing', 'Room')

    for room in Room.objects.all():
        if not room.meeting_id:
            room.meeting_id = uuid.uuid4().hex[:10]
            room.save(update_fields=['meeting_id'])


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('conferencing', '0003_auto_20250224_2028'),
    ]

    operations = [
        migrations.AddField(
            model_name='room',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_rooms', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='room',
            name='meeting_id',
            field=models.CharField(blank=True, max_length=32, null=True, unique=True),
        ),
        migrations.RunPython(populate_room_meeting_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='room',
            name='meeting_id',
            field=models.CharField(blank=True, max_length=32, unique=True),
        ),
        migrations.CreateModel(
            name='ActivityLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(choices=[('signup', 'Signup'), ('login', 'Login'), ('logout', 'Logout'), ('join_room', 'Join Room')], max_length=32)),
                ('details', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('room', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='activity_logs', to='conferencing.room')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='activity_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
