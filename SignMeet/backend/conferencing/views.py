from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.shortcuts import redirect, render
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from agora_token_builder import RtcTokenBuilder
from .models import ActivityLog, Participant, Room
import time
import random
import json
from urllib.parse import urlparse, parse_qs

# Home Page View
def home(request):
    context = {
        'active_panel': 'signup',
        'signup_username': '',
        'login_username': '',
        'signup_error': '',
        'login_error': '',
    }

    if request.method == 'POST':
        action = request.POST.get('action')

        if action == 'signup':
            username = request.POST.get('signup_username', '').strip()
            password = request.POST.get('signup_password', '')
            confirm_password = request.POST.get('signup_confirm_password', '')

            context.update({
                'active_panel': 'signup',
                'signup_username': username,
            })

            if not username or not password or not confirm_password:
                context['signup_error'] = 'Please fill in all sign-up fields.'
            elif User.objects.filter(username=username).exists():
                context['signup_error'] = 'That username already exists. Please choose another one.'
            elif password != confirm_password:
                context['signup_error'] = 'Passwords do not match.'
            else:
                user = User.objects.create_user(username=username, password=password)
                login(request, user)
                return redirect('home')

        elif action == 'login':
            username = request.POST.get('login_username', '').strip()
            password = request.POST.get('login_password', '')

            context.update({
                'active_panel': 'login',
                'login_username': username,
            })

            user = authenticate(request, username=username, password=password)
            if user is None:
                context['login_error'] = 'Invalid username or password.'
            else:
                login(request, user)
                return redirect('home')

    return render(request, 'conferencing/home.html', context)


def logout_view(request):
    if request.method == 'POST':
        logout(request)
    return redirect('home')


def _get_request_payload(request):
    if request.content_type == 'application/json':
        try:
            return json.loads(request.body.decode('utf-8') or '{}')
        except json.JSONDecodeError:
            return {}
    return request.POST


def _resolve_user(identifier):
    identifier = (identifier or '').strip()
    if not identifier:
        return None

    if '@' in identifier:
        return User.objects.filter(email__iexact=identifier).first()

    return User.objects.filter(username__iexact=identifier).first()


def _log_activity(user, event_type, room=None, details=None):
    if not user or not getattr(user, 'is_authenticated', False):
        return

    ActivityLog.objects.create(
        user=user,
        room=room,
        event_type=event_type,
        details=details or {},
    )


def _resolve_room_from_payload(payload):
    meeting_id = (payload.get('meetingId') or payload.get('meeting_id') or '').strip()
    room_name = (payload.get('roomName') or payload.get('room_name') or '').strip()

    if meeting_id:
        room = Room.objects.filter(meeting_id__iexact=meeting_id).first()
        if room:
            return room

    if room_name:
        return Room.objects.filter(name__iexact=room_name).first()

    return None


def _get_room_link(request, room):
    origin = request.headers.get('Origin') or 'http://localhost:5173'
    return f'{origin.rstrip("/")}/translate/session/{room.meeting_id}'


def _extract_meeting_id_or_name(raw_value):
    value = (raw_value or '').strip()
    if not value:
        return '', ''

    if value.startswith('http://') or value.startswith('https://'):
        parsed = urlparse(value)
        query = parse_qs(parsed.query)

        for key in ('meetingId', 'meeting_id', 'room', 'id'):
            if query.get(key):
                return query[key][0].strip(), ''

        path_parts = [part for part in parsed.path.split('/') if part]
        if path_parts:
            return path_parts[-1].strip(), ''

    return value, value


@require_GET
def session_view(request):
    if request.user.is_authenticated:
        return JsonResponse({
            'authenticated': True,
            'username': request.user.username,
            'email': request.user.email,
        })

    return JsonResponse({
        'authenticated': False,
        'username': '',
        'email': '',
    })


@login_required
@require_GET
def profile_view(request):
    recent_logs = list(
        request.user.activity_logs.select_related('room').values(
            'event_type',
            'created_at',
            'details',
            'room__name',
            'room__meeting_id',
        )[:20]
    )

    return JsonResponse({
        'username': request.user.username,
        'email': request.user.email,
        'logs': recent_logs,
    })


@csrf_exempt
@require_POST
def api_login(request):
    payload = _get_request_payload(request)
    identifier = payload.get('identifier', '').strip()
    password = payload.get('password', '')

    if not identifier or not password:
        return JsonResponse({'error': 'Identifier and password are required.'}, status=400)

    user_record = _resolve_user(identifier)
    username = user_record.username if user_record else identifier
    user = authenticate(request, username=username, password=password)

    if user is None:
        return JsonResponse({'error': 'Invalid credentials.'}, status=400)

    login(request, user)
    _log_activity(user, 'login', details={'identifier': identifier})
    return JsonResponse({
        'message': 'Login successful.',
        'username': user.username,
        'email': user.email,
    })


@csrf_exempt
@require_POST
def api_signup(request):
    payload = _get_request_payload(request)
    email = payload.get('email', '').strip().lower()
    password = payload.get('password', '')
    confirm_password = payload.get('confirmPassword', '')

    if not email or not password or not confirm_password:
        return JsonResponse({'error': 'Email, password, and confirm password are required.'}, status=400)

    if password != confirm_password:
        return JsonResponse({'error': 'Passwords do not match.'}, status=400)

    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({'error': 'That email is already in use.'}, status=400)

    base_username = email.split('@')[0] or 'signmeet-user'
    username = base_username
    suffix = 1

    while User.objects.filter(username__iexact=username).exists():
        suffix += 1
        username = f'{base_username}{suffix}'

    user = User.objects.create_user(username=username, email=email, password=password)
    login(request, user)
    _log_activity(user, 'signup', details={'email': email})

    return JsonResponse({
        'message': 'Signup successful.',
        'username': user.username,
        'email': user.email,
    }, status=201)


@csrf_exempt
@require_POST
def api_logout(request):
    if request.user.is_authenticated:
        _log_activity(request.user, 'logout')
    logout(request)
    return JsonResponse({'message': 'Logged out successfully.'})


@csrf_exempt
@login_required
@require_POST
def api_activity_log(request):
    payload = _get_request_payload(request)
    action = (payload.get('action') or payload.get('label') or '').strip()

    if not action:
        return JsonResponse({'error': 'Action is required.'}, status=400)

    details = {
        'action': action[:120],
        'element': (payload.get('element') or '').strip()[:40],
        'text': (payload.get('text') or '').strip()[:200],
        'path': (payload.get('path') or '').strip()[:200],
        'href': (payload.get('href') or '').strip()[:300],
        'component': (payload.get('component') or '').strip()[:120],
        'metadata': payload.get('metadata') if isinstance(payload.get('metadata'), dict) else {},
    }

    _log_activity(
        request.user,
        'click_action',
        room=_resolve_room_from_payload(payload),
        details=details,
    )

    return JsonResponse({'message': 'Activity logged.'}, status=201)


@csrf_exempt
@login_required
@require_POST
def api_join_room(request):
    payload = _get_request_payload(request)
    display_name = payload.get('displayName', '').strip()
    room_input = payload.get('meetingIdOrLink', '').strip()

    if not display_name or not room_input:
        return JsonResponse({'error': 'Display name and room details are required.'}, status=400)

    meeting_id_candidate, room_name_candidate = _extract_meeting_id_or_name(room_input)

    room = Room.objects.filter(meeting_id__iexact=meeting_id_candidate).first()

    if room is None:
        normalized_name = room_name_candidate or meeting_id_candidate
        if not normalized_name:
            return JsonResponse({'error': 'A valid meeting ID, room name, or invite link is required.'}, status=400)

        room = Room.objects.filter(name__iexact=normalized_name).first()

        if room is None:
            room = Room.objects.create(
                name=normalized_name,
                created_by=request.user,
            )

    _log_activity(
        request.user,
        'join_room',
        room=room,
        details={
            'display_name': display_name,
            'meeting_input': room_input,
        },
    )

    Participant.objects.filter(
        room=room,
        user=request.user,
        is_active=True,
        left_at__isnull=True,
    ).update(
        is_active=False,
        left_at=timezone.now(),
    )

    Participant.objects.create(
        room=room,
        user=request.user,
        display_name=display_name,
    )

    return JsonResponse({
        'roomName': room.name,
        'meetingId': room.meeting_id,
        'meetingLink': _get_room_link(request, room),
        'displayName': display_name,
        'activeParticipants': room.participants.filter(is_active=True, left_at__isnull=True).count(),
    })


@login_required
@require_GET
def room_detail_view(request, meeting_id):
    room = Room.objects.filter(meeting_id__iexact=meeting_id).first()

    if room is None:
        return JsonResponse({'error': 'Room not found.'}, status=404)

    return JsonResponse({
        'roomName': room.name,
        'meetingId': room.meeting_id,
        'meetingLink': _get_room_link(request, room),
        'activeParticipants': room.participants.filter(is_active=True, left_at__isnull=True).count(),
    })


@csrf_exempt
@login_required
@require_POST
def api_leave_room(request, meeting_id):
    room = Room.objects.filter(meeting_id__iexact=meeting_id).first()

    if room is None:
        return JsonResponse({'error': 'Room not found.'}, status=404)

    now = timezone.now()
    updated = Participant.objects.filter(
        room=room,
        user=request.user,
        is_active=True,
        left_at__isnull=True,
    ).update(
        is_active=False,
        left_at=now,
    )

    _log_activity(
        request.user,
        'leave_room',
        room=room,
        details={'participants_marked_left': updated},
    )

    return JsonResponse({
        'message': 'Left room successfully.',
        'activeParticipants': room.participants.filter(is_active=True, left_at__isnull=True).count(),
    })

# Video Call Room View
@login_required
def video_call(request, room_name):
    uid = request.GET.get('uid', '')
    return render(request, 'conferencing/room.html', {
        'room_name': room_name,
        'uid': uid
    })

# Agora Token Generation View
@login_required
def get_agora_token(request):
    app_id = '71fbf1e2263a49869725faa8404523ec'  # Replace with your Agora App ID
    app_certificate = 'c30096eedb10445fb0990cb0d0a4f15b'   # Replace with your Agora App Certificate
    channel_name = request.GET.get('channelName')

    if not channel_name:
        return JsonResponse({'error': 'Missing channelName'}, status=400)

    uid = random.randint(1, 230)  # Unique ID for each user
    role = 1  # 1 for publisher
    expire_time = 3600  # Token expiry in seconds

    current_time = int(time.time())
    privilege_expired_ts = current_time + expire_time

    try:
        token = RtcTokenBuilder.buildTokenWithUid(
            app_id, app_certificate, channel_name, uid, role, privilege_expired_ts
        )
        return JsonResponse({'token': token, 'uid': uid})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
