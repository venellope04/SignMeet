import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';

const demoTranslations = [
  'Waiting for backend prediction...',
  'Receiving ASL frames...',
  'Model is processing the current gesture...'
];

const remoteIdleMessage = 'Remote participant translation will appear here.';
const remoteListeningMessage = 'Listening for the other participant...';
const stoppedMessage = 'Detection stopped. Start again to continue translating.';

function SessionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { meetingId } = useParams();
  const { session } = useOutletContext();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const socketRef = useRef(null);
  const intentionalCloseRef = useRef(false);
  const spokenTranslationsRef = useRef({ self: '', remote: '' });

  const displayName = location.state?.displayName || session.username || 'Guest User';
  const [roomName, setRoomName] = useState(location.state?.roomName || '');
  const [isStarting, setIsStarting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [hasVideoPreview, setHasVideoPreview] = useState(false);
  const [roomStatus, setRoomStatus] = useState('Loading room...');
  const [translatedText, setTranslatedText] = useState('Waiting to start translation...');
  const [localTranslatedText, setLocalTranslatedText] = useState('Waiting to start translation...');
  const [remoteTranslatedText, setRemoteTranslatedText] = useState(remoteIdleMessage);
  const [remoteParticipantName, setRemoteParticipantName] = useState('Other participant');
  const [permissionError, setPermissionError] = useState('');
  const [remoteParticipantIds, setRemoteParticipantIds] = useState([]);
  const [participantNames, setParticipantNames] = useState({});
  const [notifications, setNotifications] = useState([]);
  const agoraClientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });
  const localUidRef = useRef(null);
  const remoteTracksRef = useRef({});
  const remoteVideoRefs = useRef({});
  const isJoiningRef = useRef(false);
  const isMountedRef = useRef(true);

  const navigateToThankYou = (reason = 'left') => {
    navigate('/thank-you', {
      replace: true,
      state: {
        reason,
        roomName: roomName || `Meeting ${meetingId}`,
        meetingId,
      }
    });
  };

  const fetchAgoraToken = async (roomName) => {
    const response = await fetch(`/get_token/?channelName=${encodeURIComponent(roomName)}`, {
      credentials: 'include'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Agora token request failed');
    return data;
  };

  const addNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type, timestamp: new Date() }]);
    // Auto-remove notification after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const handleRemoteUserPublished = async (user, mediaType) => {
    const userId = String(user.uid);
    console.log('Remote user published:', user.uid, mediaType, 'local uid:', localUidRef.current, 'type of user.uid:', typeof user.uid, 'type of local:', typeof localUidRef.current);
    if (userId === String(localUidRef.current)) {
      console.log('Skipping self-subscription for uid', user.uid);
      return;
    }

    const isNewUser = !remoteParticipantIds.includes(userId);
    if (isNewUser) {
      // Add notification for new user joining
      addNotification(`New participant joined the meeting`, 'success');
      // Set a default name that can be updated via WebSocket
      setParticipantNames(prev => ({ ...prev, [userId]: `Participant ${userId}` }));
    }

    setRemoteParticipantIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    remoteTracksRef.current[userId] = remoteTracksRef.current[userId] || {};

    const client = agoraClientRef.current;
    if (!client) return;
    try {
      await client.subscribe(user, mediaType);
      console.log('Subscribed to remote user:', user.uid, mediaType);
    } catch (err) {
      console.warn('Failed to subscribe to remote user:', user.uid, mediaType, err);
      return;
    }

    if (mediaType === 'video' && user.videoTrack) {
      remoteTracksRef.current[userId].videoTrack = user.videoTrack;
      console.log('Stored remote video track for uid', userId, 'track:', user.videoTrack);
    }

    if (mediaType === 'audio' && user.audioTrack) {
      remoteTracksRef.current[userId].audioTrack = user.audioTrack;
      console.log('Stored remote audio track for uid', userId, 'track:', user.audioTrack);
      try {
        await user.audioTrack.play();
        console.log('Playing remote audio for uid', userId);
      } catch (err) {
        console.warn('Failed to play remote audio for uid', userId, err);
      }
    }
  };

  const handleRemoteUserUnpublished = async (user, mediaType) => {
    const userId = String(user.uid);
    if (userId === String(localUidRef.current)) return;

    const remoteTracks = remoteTracksRef.current[userId];
    if (!remoteTracks) return;

    if (mediaType === 'left') {
      // User left, stop all tracks
      const userName = participantNames[userId] || `Participant ${userId}`;
      addNotification(`${userName} left the meeting`, 'info');

      if (remoteTracks.audioTrack) {
        try {
          await agoraClientRef.current?.unsubscribe(user, 'audio');
          remoteTracks.audioTrack.stop();
        } catch (err) {
          console.warn('Failed to stop remote audio on leave:', err);
        }
      }
      if (remoteTracks.videoTrack) {
        try {
          await agoraClientRef.current?.unsubscribe(user, 'video');
          remoteTracks.videoTrack.stop();
        } catch (err) {
          console.warn('Failed to stop remote video on leave:', err);
        }
      }
      setRemoteParticipantIds((prev) => prev.filter((id) => id !== userId));
      setParticipantNames((prev) => {
        const newNames = { ...prev };
        delete newNames[userId];
        return newNames;
      });
      delete remoteTracksRef.current[userId];
    } else {
      // User unpublished a specific media type
      if (mediaType === 'audio' && remoteTracks.audioTrack) {
        try {
          await agoraClientRef.current?.unsubscribe(user, mediaType);
          remoteTracks.audioTrack.stop();
        } catch (err) {
          console.warn('Failed to stop remote audio:', err);
        }
        delete remoteTracks.audioTrack;
      }
      if (mediaType === 'video' && remoteTracks.videoTrack) {
        try {
          await agoraClientRef.current?.unsubscribe(user, mediaType);
          remoteTracks.videoTrack.stop();
        } catch (err) {
          console.warn('Failed to stop remote video:', err);
        }
        delete remoteTracks.videoTrack;
      }
      const remainingTracks = remoteTracks.audioTrack || remoteTracks.videoTrack;
      if (!remainingTracks) {
        setRemoteParticipantIds((prev) => prev.filter((id) => id !== userId));
        setParticipantNames((prev) => {
          const newNames = { ...prev };
          delete newNames[userId];
          return newNames;
        });
        delete remoteTracksRef.current[userId];
      }
    }
  };

  const cleanupAgora = async () => {
    if (isJoiningRef.current) {
      // Don't interrupt an in-progress join
      return;
    }
    
    if (localTracksRef.current.videoTrack) {
      localTracksRef.current.videoTrack.stop();
      localTracksRef.current.videoTrack.close();
    }
    if (localTracksRef.current.audioTrack) {
      localTracksRef.current.audioTrack.stop();
      localTracksRef.current.audioTrack.close();
    }
    if (agoraClientRef.current) {
      await agoraClientRef.current.leave();
      agoraClientRef.current = null;
    }
    localUidRef.current = null;
    remoteTracksRef.current = {};
    if (isMountedRef.current) {
      setRemoteParticipantIds([]);
      setParticipantNames({});
      setNotifications([]);
      setIsJoined(false);
    }
  };

  useEffect(() => {
    if (!remoteParticipantIds.length) return;

    const playRemoteVideos = async () => {
      for (const uid of remoteParticipantIds) {
        const player = remoteVideoRefs.current[uid];
        const track = remoteTracksRef.current[uid]?.videoTrack;
        
        console.log('Attempting to play remote video for uid', uid, {
          playerExists: !!player,
          trackExists: !!track,
          playerType: player?.constructor?.name,
          trackType: track?.constructor?.name
        });

        if (player && track) {
          try {
            await track.play(player);
            console.log('✓ Successfully playing remote video for uid', uid);
          } catch (err) {
            console.warn('✗ Failed to play remote video for uid', uid, err.message);
          }
        } else {
          console.log('⚠ Missing player or track for uid', uid, 'player:', !!player, 'track:', !!track);
        }
      }
    };

    // Try immediately
    playRemoteVideos();

    // Retry after delays to handle timing issues
    const timeout1 = setTimeout(playRemoteVideos, 300);
    const timeout2 = setTimeout(playRemoteVideos, 800);
    const timeout3 = setTimeout(playRemoteVideos, 1500);

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
    };
  }, [remoteParticipantIds]);

  const startAgoraCall = async () => {
    console.log('startAgoraCall called, roomName:', roomName, 'isJoining:', isJoiningRef.current);
    if (!roomName || isJoiningRef.current) {
      console.log('startAgoraCall returning early: roomName empty?', !roomName, 'already joining?', isJoiningRef.current);
      return;
    }
    
    if (typeof AgoraRTC === 'undefined') {
      console.error('AgoraRTC SDK not loaded');
      if (isMountedRef.current) {
        setPermissionError('AgoraRTC SDK failed to load. Please refresh the page.');
      }
      return;
    }
    
    isJoiningRef.current = true;
    console.log('Starting Agora join process for room:', roomName);
    try {
      const appId = '71fbf1e2263a49869725faa8404523ec';
      console.log('Fetching token for room:', roomName);
      const { token, uid } = await fetchAgoraToken(roomName);
      console.log('Token fetched:', { token: token ? 'yes' : 'no', uid });
      
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      client.on('user-published', handleRemoteUserPublished);
      client.on('user-unpublished', handleRemoteUserUnpublished);
      client.on('user-left', (user) => handleRemoteUserUnpublished(user, 'left'));

      await cleanupAgora();
      
      localUidRef.current = String(uid);
      agoraClientRef.current = client;
      console.log('Joining channel:', roomName, 'with uid:', uid);
      await client.join(appId, roomName, token, uid);
      console.log('Successfully joined Agora channel');
      
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      console.log('Created tracks:', { audioTrack: !!audioTrack, videoTrack: !!videoTrack });
      localTracksRef.current = { audioTrack, videoTrack };
      if (audioTrack) audioTrack.setEnabled(isMicOn);
      if (videoTrack) videoTrack.setEnabled(true);

      if (videoRef.current && videoTrack) {
        videoTrack.play(videoRef.current);
        setHasVideoPreview(true);
      }

      const publishPromises = [];
      if (audioTrack) {
        console.log('Publishing audio track');
        publishPromises.push(
          client.publish(audioTrack).then(() => console.log('Audio track published')).catch((err) => {
            console.warn('Audio track publish failed:', err);
          })
        );
      } else {
        console.warn('No audio track to publish');
      }

      if (videoTrack) {
        console.log('Publishing video track');
        publishPromises.push(
          client.publish(videoTrack).then(() => console.log('Video track published')).catch((err) => {
            console.warn('Video track publish failed:', err);
          })
        );
      } else {
        console.warn('No video track to publish');
      }

      await Promise.all(publishPromises);
      
      console.log('Setting isJoined to true');
      setIsJoined(true);
      setRoomStatus(`Joined Agora room ${roomName} as ${displayName}`);
    } catch (err) {
      console.error('Agora join failed:', err);
      if (isMountedRef.current) {
        setPermissionError('Unable to connect to Agora video room. Please verify camera permissions and retry.');
      }
    } finally {
      isJoiningRef.current = false;
    }
  };

  const speakTranslation = (translation, participantLabel, origin) => {
    const cleanedTranslation = (translation || '').trim();
    if (
      !cleanedTranslation ||
      cleanedTranslation === '[Error]' ||
      cleanedTranslation === stoppedMessage ||
      cleanedTranslation === remoteIdleMessage ||
      cleanedTranslation === remoteListeningMessage ||
      demoTranslations.includes(cleanedTranslation) ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window)
    ) {
      return;
    }

    if (spokenTranslationsRef.current[origin] === cleanedTranslation) {
      return;
    }

    spokenTranslationsRef.current[origin] = cleanedTranslation;

    const utterance = new SpeechSynthesisUtterance(
      origin === 'remote' ? `${participantLabel} signed ${cleanedTranslation}` : cleanedTranslation
    );
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const getBackendWebSocketUrls = () => {
    const configuredBackend = import.meta.env.VITE_BACKEND_HTTP_URL;
    const urls = [];
    const queryString = new URLSearchParams({ participant: displayName }).toString();
    const currentProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    urls.push(`${currentProtocol}//${window.location.host}/ws/sign_detection/${meetingId}/?${queryString}`);
    urls.push(`ws://localhost:8000/ws/sign_detection/${meetingId}/?${queryString}`);
    urls.push(`ws://127.0.0.1:8000/ws/sign_detection/${meetingId}/?${queryString}`);

    if (configuredBackend) {
      try {
        const backendUrl = new URL(configuredBackend);
        backendUrl.protocol = backendUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        backendUrl.pathname = `/ws/sign_detection/${meetingId}/`;
        backendUrl.search = queryString;
        urls.push(backendUrl.toString());
      } catch (error) {
        console.warn('Invalid VITE_BACKEND_HTTP_URL, skipping direct backend WebSocket candidate:', configuredBackend, error);
      }
    }

    return [...new Set(urls)];
  };

  const connectToBackendWebSocket = () =>
    new Promise((resolve, reject) => {
      const candidates = getBackendWebSocketUrls();
      let candidateIndex = 0;

      console.log('Attempting backend WebSocket endpoints:', candidates);

      const tryNext = () => {
        if (candidateIndex >= candidates.length) {
          reject(new Error('No backend WebSocket endpoint responded.'));
          return;
        }

        const url = candidates[candidateIndex];
        console.log('Trying WebSocket endpoint:', url);
        const socket = new WebSocket(url);
        candidateIndex += 1;
        let opened = false;

        socket.onopen = () => {
          opened = true;
          console.log('WebSocket connected to:', url);
          resolve(socket);
        };

        socket.onerror = (event) => {
          console.warn('WebSocket error for:', url, event);
          if (!opened) {
            socket.close();
          }
        };

        socket.onclose = (event) => {
          if (!opened) {
            console.warn('WebSocket closed before open for:', url, event);
            tryNext();
          } else {
            console.log('WebSocket closed after open for:', url, event);
          }
        };
      };

      tryNext();
    });

  useEffect(() => {
    if (!session.loading && !session.authenticated) {
      navigate('/login', { replace: true });
      return;
    }

    if (!meetingId) {
      navigate('/translate', { replace: true });
      return;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (socketRef.current) {
        intentionalCloseRef.current = true;
        socketRef.current.close();
      }

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [meetingId, navigate, session.authenticated, session.loading]);

  useEffect(() => {
    if (!session.authenticated || !meetingId) {
      return;
    }

    let active = true;

    const loadRoom = async () => {
      try {
        console.log('Loading room details for meetingId:', meetingId);
        const response = await fetch(`/api/rooms/${meetingId}/`, {
          credentials: 'include'
        });
        console.log('Room API response status:', response.status, response.ok);
        const data = await response.json();
        console.log('Room data:', data);

        if (!response.ok) {
          throw new Error(data.error || 'Room not found.');
        }

        if (!active) {
          return;
        }

        console.log('Setting roomName to:', data.roomName);
        setRoomName(data.roomName);
        setRoomStatus(`Joined room "${data.roomName}" as ${displayName}`);
      } catch (error) {
        console.error('Error loading room:', error);
        if (active) {
          setPermissionError(error.message || 'Unable to load room details.');
        }
      }
    };

    loadRoom();

    return () => {
      active = false;
    };
  }, [displayName, meetingId, session.authenticated]);

  useEffect(() => {
    if (!meetingId || !isCameraOn) {
      return;
    }

    ensureCameraPreview().catch(() => {
      setPermissionError('Camera access was denied. Please allow webcam access and try again.');
    });
  }, [meetingId, isCameraOn]);

  useEffect(() => {
    console.log('Agora login effect running:', {
      authenticated: session.authenticated,
      meetingId: !!meetingId,
      roomName: !!roomName,
      allConditionsMet: session.authenticated && meetingId && roomName
    });
    
    if (!session.authenticated || !meetingId || !roomName) {
      console.log('Effect early return - missing dependencies');
      return;
    }

    console.log('Calling startAgoraCall from effect');
    startAgoraCall();

    return () => {
      cleanupAgora();
    };
  }, [meetingId, roomName, session.authenticated]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const stopLocalPreview = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setHasVideoPreview(false);
  };

  const ensureCameraPreview = async () => {
    if (streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
      setHasVideoPreview(true);
      return streamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }

    setHasVideoPreview(true);
    return stream;
  };

  const stopDetection = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (socketRef.current) {
      intentionalCloseRef.current = true;
      socketRef.current.close();
      socketRef.current = null;
    }

    setIsDetecting(false);
    setTranslatedText(stoppedMessage);
    setLocalTranslatedText(stoppedMessage);
    setRoomStatus(`Joined room "${roomName}" as ${displayName}`);
  };

  const startDetection = async () => {
    setPermissionError('');
    setIsStarting(true);
    spokenTranslationsRef.current = { self: '', remote: '' };

    try {
      await ensureCameraPreview();

      const socket = await connectToBackendWebSocket();
      intentionalCloseRef.current = false;
      socketRef.current = socket;

      setRoomStatus(`Connected to ${roomName}`);
      setIsDetecting(true);
      setTranslatedText(demoTranslations[0]);
      setLocalTranslatedText(demoTranslations[0]);
      setRemoteTranslatedText(remoteListeningMessage);

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');

          if (payload.type === 'participant_joined') {
            addNotification(`${payload.participant_name} joined the meeting`, 'success');
            return;
          }

          if (payload.type === 'participant_left') {
            addNotification(`${payload.participant_name} left the meeting`, 'info');
            return;
          }

          const nextValue = (payload.translation || '').trim() || demoTranslations[0];
          const participant = payload.participant || 'Other participant';

          if (payload.origin === 'remote') {
            setRemoteParticipantName(participant);
            setRemoteTranslatedText(nextValue);
            setTranslatedText(`${participant}: ${nextValue}`);
            speakTranslation(nextValue, participant, 'remote');
            return;
          }

          setLocalTranslatedText(nextValue);
          setTranslatedText(nextValue);
          speakTranslation(nextValue, displayName, 'self');
        } catch {
          const nextValue = (event.data || '').trim() || demoTranslations[0];
          setLocalTranslatedText(nextValue);
          setTranslatedText(nextValue);
          speakTranslation(nextValue, displayName, 'self');
        }
      };

      socket.onerror = () => {
        setPermissionError('The backend WebSocket could not be reached. Make sure Django is running.');
      };

      socket.onclose = () => {
        if (!intentionalCloseRef.current) {
          setPermissionError('The backend WebSocket connection was closed.');
          setIsDetecting(false);
          navigateToThankYou('meeting-ended');
        }
      };

      intervalRef.current = window.setInterval(() => {
        const socketInstance = socketRef.current;
        const videoElement = videoRef.current;

        if (!socketInstance || socketInstance.readyState !== WebSocket.OPEN || !videoElement) {
          return;
        }

        if (videoElement.readyState < 2) {
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 229;
        canvas.height = 229;
        const context = canvas.getContext('2d');

        if (!context) {
          return;
        }

        context.drawImage(videoElement, 0, 0, 229, 229);
        const imageData = context.getImageData(0, 0, 229, 229).data;
        const rgbData = new Uint8Array(229 * 229 * 3);

        for (let sourceIndex = 0, targetIndex = 0; sourceIndex < imageData.length; sourceIndex += 4, targetIndex += 3) {
          rgbData[targetIndex] = imageData[sourceIndex];
          rgbData[targetIndex + 1] = imageData[sourceIndex + 1];
          rgbData[targetIndex + 2] = imageData[sourceIndex + 2];
        }

        socketInstance.send(rgbData);
      }, 700);
    } catch (error) {
      setPermissionError('Camera access was denied. Please allow webcam access and try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const leaveRoom = async () => {
    stopDetection();
    stopLocalPreview();
    await cleanupAgora();
    navigateToThankYou('left');
  };

  const toggleCamera = async () => {
    const nextValue = !isCameraOn;
    setIsCameraOn(nextValue);
    const videoTrack = localTracksRef.current.videoTrack;

    if (!videoTrack) {
      if (!nextValue) return;
      try {
        const newVideoTrack = await AgoraRTC.createCameraVideoTrack();
        localTracksRef.current.videoTrack = newVideoTrack;
        if (videoRef.current) {
          newVideoTrack.play(videoRef.current);
          setHasVideoPreview(true);
        }
        if (agoraClientRef.current) {
          await agoraClientRef.current.publish(newVideoTrack);
        }
      } catch (err) {
        setPermissionError('Camera access was denied. Please allow webcam access and try again.');
        setIsCameraOn(false);
      }
      return;
    }

    videoTrack.setEnabled(nextValue);
    if (videoRef.current) {
      if (nextValue) {
        videoTrack.play(videoRef.current);
        setHasVideoPreview(true);
      } else {
        videoRef.current.pause();
        setHasVideoPreview(false);
      }
    }

    if (!nextValue && isDetecting) {
      stopDetection();
    }
  };
  const toggleMic = async () => {
    console.log('Toggling mic, current isMicOn:', isMicOn, 'isJoined:', isJoined);
    if (!isJoined) {
      console.log('Cannot toggle mic: not joined to Agora channel (isJoined=', isJoined, ')');
      return;
    }
    console.log('Proceeding with mic toggle');
    const audioTrack = localTracksRef.current.audioTrack;
    if (!audioTrack) {
      console.log('No audio track found');
      setIsMicOn(false);
      return;
    }

    const nextValue = !isMicOn;
    console.log('Setting mic enabled to:', nextValue);
    audioTrack.setEnabled(nextValue);
    setIsMicOn(nextValue);

    // Note: We keep the track published but muted/unmuted for better UX
    // Remote users will hear silence when muted, but the track remains active
  };

  if (session.loading) {
    return (
      <div className="meet-page">
        <div className="meet-loading">
          <div className="meet-loading-ring" />
          <span>Preparing room…</span>
        </div>
      </div>
    );
  }

  if (!session.authenticated) {
    return null;
  }

  const hasRemote = remoteParticipantIds.length > 0;

  return (
    <div className="meet-page">

      {/* ── Top bar ── */}
      <header className="meet-topbar">
        <div className="meet-topbar-left">
          <span className="meet-room-name">{roomName || `Meeting ${meetingId}`}</span>
          <span className="meet-room-id">{meetingId}</span>
        </div>
        <div className="meet-topbar-right">
          {isDetecting && <span className="meet-live-badge">● Live</span>}
          <span className="meet-status-text">{roomStatus}</span>
        </div>
      </header>

      {/* ── Video grid ── */}
      <main className={`meet-grid ${hasRemote ? 'meet-grid--split' : 'meet-grid--solo'}`}>

        {/* Local tile */}
        <div className="meet-tile meet-tile--local">
          {hasVideoPreview && isCameraOn
            ? <video ref={videoRef} autoPlay playsInline muted className="meet-video" />
            : (
              <div className="meet-cam-off">
                <div className="meet-cam-avatar">{displayName.charAt(0).toUpperCase()}</div>
                <span>{isCameraOn ? 'Starting camera…' : 'Camera off'}</span>
              </div>
            )
          }

          {/* Name tag */}
          <div className="meet-name-tag">
            <span className="meet-name-tag-name">{displayName}</span>
            {!isMicOn && (
              <span className="meet-name-tag-muted" title="Muted">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 11c0 1.19-.34 2.3-.9 3.28l-1.23-1.23c.27-.62.43-1.31.43-2.05H19zm-4 .16L9 5.18V5a3 3 0 016 0v6.16zm-7.72-7L20 16.88 18.88 18l-1.17-1.17A6.99 6.99 0 015 11H7c0 1.38.56 2.63 1.46 3.54L7 16c-1.87-1.11-3-3.12-3-5H2c0 3.53 2.61 6.43 6 6.92V21h4v-2.08c.95-.12 1.85-.43 2.64-.9L21.88 21 23 19.88 4.28 1.16 7.28 4.16zM17 11h-2.17l-3-3H12a3 3 0 013 3h2z"/>
                </svg>
              </span>
            )}
          </div>

          {/* Caption overlay — local */}
          {isDetecting && localTranslatedText && !['Waiting to start translation...', 'Detection stopped. Start again to continue translating.'].includes(localTranslatedText) && (
            <div className="meet-caption meet-caption--local">
              <span className="meet-caption-who">You</span>
              <p className="meet-caption-text">{localTranslatedText}</p>
            </div>
          )}
        </div>

        {/* Remote tiles */}
        {remoteParticipantIds.map((uid) => (
          <div key={uid} id={`remote-video-container-${uid}`} className="meet-tile meet-tile--remote">
            <video
              id={`remote-video-${uid}`}
              className="meet-video"
              ref={(el) => {
                if (el) remoteVideoRefs.current[uid] = el;
                else delete remoteVideoRefs.current[uid];
              }}
              autoPlay
              playsInline
              muted={false}
            />

            <div className="meet-name-tag">
              <span className="meet-name-tag-name">{participantNames[uid] || `Participant ${uid}`}</span>
            </div>

            {/* Caption overlay — remote */}
            {isDetecting && remoteTranslatedText && remoteTranslatedText !== 'Remote participant translation will appear here.' && remoteTranslatedText !== 'Listening for the other participant...' && (
              <div className="meet-caption meet-caption--remote">
                <span className="meet-caption-who">{remoteParticipantName}</span>
                <p className="meet-caption-text">{remoteTranslatedText}</p>
              </div>
            )}
          </div>
        ))}

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="meet-notifications">
            {notifications.map((n) => (
              <div key={n.id} className={`meet-notif meet-notif--${n.type}`}>{n.message}</div>
            ))}
          </div>
        )}

        {/* Permission error */}
        {permissionError && (
          <div className="meet-error-banner">{permissionError}</div>
        )}
      </main>

      {/* ── Controls dock ── */}
      <footer className="meet-dock">
        {/* Mic */}
        <button
          type="button"
          className={`meet-dock-btn ${isMicOn ? '' : 'meet-dock-btn--off'}`}
          onClick={toggleMic}
          title={isMicOn ? 'Mute mic' : 'Unmute mic'}
        >
          {isMicOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9v-2.08A7.01 7.01 0 005.07 11H7a5 5 0 0010 0h1.93A7.01 7.01 0 0012 17.92V20h3v2H9v-2h3z"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11c0 1.19-.34 2.3-.9 3.28l-1.23-1.23c.27-.62.43-1.31.43-2.05H19zm-4 .16L9 5.18V5a3 3 0 016 0v6.16zm-7.72-7L20 16.88 18.88 18l-1.17-1.17A6.99 6.99 0 015 11H7c0 1.38.56 2.63 1.46 3.54L7 16c-1.87-1.11-3-3.12-3-5H2c0 3.53 2.61 6.43 6 6.92V21h4v-2.08c.95-.12 1.85-.43 2.64-.9L21.88 21 23 19.88 4.28 1.16 7.28 4.16z"/></svg>
          )}
          <span>{isMicOn ? 'Mute' : 'Unmute'}</span>
        </button>

        {/* Camera */}
        <button
          type="button"
          className={`meet-dock-btn ${isCameraOn ? '' : 'meet-dock-btn--off'}`}
          onClick={toggleCamera}
          disabled={!isJoined}
          title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15 8v8H5V8h10m1-2H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4V7a1 1 0 00-1-1z"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6.5l-4 4V7a1 1 0 00-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4a1 1 0 00-1 1v10a1 1 0 001 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/></svg>
          )}
          <span>{isCameraOn ? 'Stop video' : 'Start video'}</span>
        </button>

        {/* ASL translate */}
        <button
          type="button"
          className={`meet-dock-btn meet-dock-btn--translate ${isDetecting ? 'meet-dock-btn--active' : ''}`}
          onClick={isDetecting ? stopDetection : startDetection}
          disabled={isStarting}
          title={isDetecting ? 'Stop ASL translation' : 'Start ASL translation'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>
          <span>{isStarting ? 'Starting…' : isDetecting ? 'Stop ASL' : 'ASL On'}</span>
          {isDetecting && <span className="meet-dock-live-dot" />}
        </button>

        {/* Leave */}
        <button
          type="button"
          className="meet-dock-btn meet-dock-btn--leave"
          onClick={leaveRoom}
          title="Leave call"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.67 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 01-.28-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.7 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28a12.47 12.47 0 00-2.67-1.85.993.993 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
          <span>Leave</span>
        </button>
      </footer>

    </div>
  );
}

export default SessionPage;