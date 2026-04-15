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
  const [isMicOn, setIsMicOn] = useState(true);
  const [hasVideoPreview, setHasVideoPreview] = useState(false);
  const [roomStatus, setRoomStatus] = useState('Loading room...');
  const [translatedText, setTranslatedText] = useState('Waiting to start translation...');
  const [localTranslatedText, setLocalTranslatedText] = useState('Waiting to start translation...');
  const [remoteTranslatedText, setRemoteTranslatedText] = useState(remoteIdleMessage);
  const [remoteParticipantName, setRemoteParticipantName] = useState('Other participant');
  const [permissionError, setPermissionError] = useState('');

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

    if (configuredBackend) {
      const backendUrl = new URL(configuredBackend);
      backendUrl.protocol = backendUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      backendUrl.pathname = `/ws/sign_detection/${meetingId}/`;
      backendUrl.search = queryString;
      urls.push(backendUrl.toString());
    }

    const currentProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    urls.push(`${currentProtocol}//${window.location.host}/ws/sign_detection/${meetingId}/?${queryString}`);
    urls.push(`ws://localhost:8000/ws/sign_detection/${meetingId}/?${queryString}`);
    urls.push(`ws://127.0.0.1:8000/ws/sign_detection/${meetingId}/?${queryString}`);

    return [...new Set(urls)];
  };

  const connectToBackendWebSocket = () =>
    new Promise((resolve, reject) => {
      const candidates = getBackendWebSocketUrls();
      let candidateIndex = 0;

      const tryNext = () => {
        if (candidateIndex >= candidates.length) {
          reject(new Error('No backend WebSocket endpoint responded.'));
          return;
        }

        const socket = new WebSocket(candidates[candidateIndex]);
        candidateIndex += 1;
        let opened = false;

        socket.onopen = () => {
          opened = true;
          resolve(socket);
        };

        socket.onerror = () => {
          if (!opened) {
            socket.close();
          }
        };

        socket.onclose = () => {
          if (!opened) {
            tryNext();
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
        const response = await fetch(`/api/rooms/${meetingId}/`, {
          credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Room not found.');
        }

        if (!active) {
          return;
        }

        setRoomName(data.roomName);
        setRoomStatus(`Joined room "${data.roomName}" as ${displayName}`);
      } catch (error) {
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
    await fetch(`/api/rooms/${meetingId}/leave/`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});
    navigateToThankYou('left');
  };

  const toggleCamera = () => {
    const nextValue = !isCameraOn;
    setIsCameraOn(nextValue);

    if (!nextValue) {
      if (isDetecting) {
        stopDetection();
      }
      stopLocalPreview();
      return;
    }

    ensureCameraPreview().catch(() => {
      setPermissionError('Camera access was denied. Please allow webcam access and try again.');
    });
  };

  const toggleMic = () => {
    setIsMicOn((value) => !value);
  };

  if (session.loading) {
    return (
      <div className="room-page">
        <section className="room-topbar glass-panel">
          <div>
            <div className="eyebrow-pill">Checking Access</div>
            <h1>Preparing Room</h1>
          </div>
        </section>
      </div>
    );
  }

  if (!session.authenticated) {
    return null;
  }

  return (
    <div className="room-page">
      <section className="room-topbar glass-panel">
        <div>
          <div className="eyebrow-pill">Live Meeting Room</div>
          <h1>{roomName || `Meeting ${meetingId}`}</h1>
        </div>
        <div className="room-topbar-meta">
          <div className="room-chip">
            <span>Participant</span>
            <strong>{displayName}</strong>
          </div>
          <div className="room-chip">
            <span>Meeting ID</span>
            <strong>{meetingId}</strong>
          </div>
          <div className="room-chip">
            <span>Status</span>
            <strong>{roomStatus}</strong>
          </div>
        </div>
      </section>

      <section className="room-layout">
        <div className="room-stage-panel glass-panel">
          <div className="room-stage-head">
            <div>
              <p className="card-kicker">Meeting Stage</p>
              <h2>Your camera feed</h2>
            </div>
            <span className={`status-badge ${isDetecting ? 'is-live' : ''}`}>
              {isDetecting ? 'Translating Live' : 'In Room'}
            </span>
          </div>

          <div className="room-video-stage">
            {hasVideoPreview && isCameraOn ? <video ref={videoRef} autoPlay playsInline muted className="camera-video" /> : null}
            {!hasVideoPreview || !isCameraOn ? (
              <div className="camera-placeholder">
                <div className="camera-placeholder-ring" />
                <strong>{isCameraOn ? 'Camera preview will appear here' : 'Camera is turned off'}</strong>
                <span>
                  {isCameraOn
                    ? 'Allow camera access to activate the live preview for this session.'
                    : 'Turn the camera back on to restore your live preview.'}
                </span>
              </div>
            ) : null}

            <div className="room-participant-tag">
              <span>{displayName}</span>
              <small>{isMicOn ? 'Mic on' : 'Mic muted'}</small>
            </div>
          </div>

          {permissionError ? <div className="inline-alert">{permissionError}</div> : null}
        </div>

        <aside className="room-sidebar glass-panel">
          <div className="room-stage-head">
            <div>
              <p className="card-kicker">Translation Panel</p>
              <h2>Realtime output</h2>
            </div>
            <span className="pulse-dot" />
          </div>

          <div className="room-translation-feed">
            <article className="translation-card">
              <span>You</span>
              <strong>{localTranslatedText}</strong>
            </article>
            <article className="translation-card remote">
              <span>{remoteParticipantName}</span>
              <strong>{remoteTranslatedText}</strong>
            </article>
          </div>

          <div className="room-info-grid">
            <article>
              <span>Room feed</span>
              <strong>{translatedText}</strong>
            </article>
            <article>
              <span>Input</span>
              <strong>Browser Webcam</strong>
            </article>
            <article>
              <span>Status</span>
              <strong>{isStarting ? 'Initializing' : isDetecting ? 'Streaming' : 'Ready'}</strong>
            </article>
          </div>
        </aside>
      </section>

      <section className="room-controls glass-panel">
        <button type="button" className={`dock-button ${isCameraOn ? 'is-on' : 'is-off'}`} onClick={toggleCamera} data-log-action="Toggle camera" data-log-component="SessionPage">
          <span>Camera</span>
          <strong>{isCameraOn ? 'On' : 'Off'}</strong>
        </button>
        <button type="button" className={`dock-button ${isMicOn ? 'is-on' : 'is-off'}`} onClick={toggleMic} data-log-action="Toggle microphone" data-log-component="SessionPage">
          <span>Mic</span>
          <strong>{isMicOn ? 'On' : 'Muted'}</strong>
        </button>
        <button
          type="button"
          className={`dock-button ${isDetecting ? 'is-live' : ''}`}
          onClick={isDetecting ? stopDetection : startDetection}
          disabled={isStarting}
          data-log-action={isDetecting ? 'Stop translation' : 'Start translation'}
          data-log-component="SessionPage"
        >
          <span>Translate</span>
          <strong>{isStarting ? 'Starting...' : isDetecting ? 'Stop' : 'Start'}</strong>
        </button>
        <button type="button" className="dock-button leave" onClick={leaveRoom} data-log-action="Leave meeting" data-log-component="SessionPage">
          <span>Room</span>
          <strong>Leave</strong>
        </button>
      </section>
    </div>
  );
}

export default SessionPage;
