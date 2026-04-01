from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('conferencing', '0004_room_meeting_id_activitylog'),
    ]

    operations = [
        migrations.AlterField(
            model_name='activitylog',
            name='event_type',
            field=models.CharField(
                choices=[
                    ('signup', 'Signup'),
                    ('login', 'Login'),
                    ('logout', 'Logout'),
                    ('join_room', 'Join Room'),
                    ('click_action', 'Click Action'),
                ],
                max_length=32,
            ),
        ),
    ]
