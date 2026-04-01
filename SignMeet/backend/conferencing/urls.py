from django.urls import path
from . import views
from django.shortcuts import redirect


def redirect_to_home(request):
    return redirect('/')
urlpatterns = [
    path('', views.home, name='home'),
    path('logout/', views.logout_view, name='logout'),
    path('video-call/<str:room_name>/', views.video_call, name='video_call'),
    path('get_token/', views.get_agora_token, name='get_agora_token'),
    path('api/auth/session/', views.session_view, name='api_session'),
    path('api/auth/profile/', views.profile_view, name='api_profile'),
    path('api/auth/login/', views.api_login, name='api_login'),
    path('api/auth/signup/', views.api_signup, name='api_signup'),
    path('api/auth/logout/', views.api_logout, name='api_logout'),
    path('api/activity/log/', views.api_activity_log, name='api_activity_log'),
    path('api/rooms/join/', views.api_join_room, name='api_join_room'),
    path('api/rooms/<str:meeting_id>/', views.room_detail_view, name='api_room_detail'),
]
