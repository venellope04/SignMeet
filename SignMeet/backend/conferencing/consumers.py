# SignMeet/conferencing/consumers.py
import sys
import os
import json
from channels.generic.websocket import AsyncWebsocketConsumer

# Add the signmeet directory to the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

detect_signs_from_bytes = None
model_load_error = None


def get_detector():
    global detect_signs_from_bytes, model_load_error

    if detect_signs_from_bytes is not None:
        return detect_signs_from_bytes

    if model_load_error is not None:
        raise model_load_error

    try:
        from ml_models.asl_detection.wlasl_detection import detect_signs_from_bytes as detector
        detect_signs_from_bytes = detector
        return detect_signs_from_bytes
    except Exception as exc:
        model_load_error = exc
        raise

class SignDetectionConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.meeting_id = self.scope['url_route']['kwargs']['meeting_id']
        self.room_group_name = f"sign_room_{self.meeting_id}"
        self.participant = self.scope['query_string'].decode('utf-8')
        participant_name = 'Guest User'

        if self.participant:
            try:
                from urllib.parse import parse_qs
                participant_name = parse_qs(self.participant).get('participant', [participant_name])[0] or participant_name
            except Exception:
                participant_name = 'Guest User'

        self.participant_name = participant_name[:80]
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        print("WebSocket connected for sign detection")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        print("WebSocket disconnected")

    async def receive(self, text_data=None, bytes_data=None):
        if bytes_data:
            try:
                detector = get_detector()
                print(f"Received bytes data length: {len(bytes_data)}")
                translation = detector(bytes_data)
                payload = {
                    'type': 'translation',
                    'translation': translation,
                    'participant': self.participant_name,
                }

                await self.send(text_data=json.dumps({**payload, 'origin': 'self'}))
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'broadcast_translation',
                        'translation': translation,
                        'participant': self.participant_name,
                        'sender_channel_name': self.channel_name,
                    }
                )
                print(f"Predicted sign: {translation}")
            except Exception as e:
                print(f"Error in SignDetectionConsumer: {e}")
                await self.send(text_data=json.dumps({
                    'type': 'translation',
                    'translation': '[Error]',
                    'participant': self.participant_name,
                    'origin': 'self',
                }))

    async def broadcast_translation(self, event):
        if event.get('sender_channel_name') == self.channel_name:
            return

        await self.send(text_data=json.dumps({
            'type': 'translation',
            'translation': event['translation'],
            'participant': event['participant'],
            'origin': 'remote',
        }))
