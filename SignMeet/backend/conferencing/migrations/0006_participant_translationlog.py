from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('conferencing', '0005_activitylog_click_action'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='TranslationLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('participant_name', models.CharField(blank=True, max_length=120)),
                ('translated_text', models.CharField(max_length=255)),
                ('confidence', models.FloatField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('room', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='translation_logs', to='conferencing.room')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='translation_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='Participant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('display_name', models.CharField(max_length=120)),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('left_at', models.DateTimeField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('room', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='participants', to='conferencing.room')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='meeting_participations', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-joined_at'],
            },
        ),
        migrations.AlterField(
            model_name='activitylog',
            name='event_type',
            field=models.CharField(choices=[('signup', 'Signup'), ('login', 'Login'), ('logout', 'Logout'), ('join_room', 'Join Room'), ('leave_room', 'Leave Room'), ('click_action', 'Click Action')], max_length=32),
        ),
    ]
