import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';

function TranslatePage() {
  const navigate = useNavigate();
  const { session } = useOutletContext();
  const [searchParams] = useSearchParams();
  const displayNameInputRef = useRef(null);

  const [displayName, setDisplayName] = useState('Guest User');
  const [roomName, setRoomName] = useState('asl-room');
  const [permissionError, setPermissionError] = useState('');
  const [showJoinPrompt, setShowJoinPrompt] = useState(searchParams.get('openJoin') === 'true');

  const joinRoom = () => {
    const trimmedRoom = roomName.trim();
    const trimmedName = displayName.trim();

    if (!trimmedRoom || !trimmedName) {
      setPermissionError('Enter both your name and a room name to join.');
      return;
    }

    setPermissionError('');

    fetch('/api/rooms/join/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        displayName: trimmedName,
        meetingIdOrLink: trimmedRoom
      })
    })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Unable to join the room.');
        }

        navigate(`/translate/session/${data.meetingId}`, {
          state: {
            displayName: data.displayName || trimmedName,
            roomName: data.roomName,
            meetingId: data.meetingId,
            meetingLink: data.meetingLink
          }
        });
      })
      .catch((error) => {
        setPermissionError(error.message || 'Unable to join the room right now.');
      });
  };

  useEffect(() => {
    if (!session.loading && !session.authenticated) {
      navigate('/login', { replace: true });
    }
  }, [navigate, session.authenticated, session.loading]);

  useEffect(() => {
    if (showJoinPrompt && displayNameInputRef.current) {
      displayNameInputRef.current.focus();
    }
  }, [showJoinPrompt]);

  if (session.loading) {
    return (
      <div className="page-translate">
        <section className="page-heading">
          <div className="eyebrow-pill">Checking Access</div>
          <h1>Preparing SignMeet</h1>
          <p>We are verifying your session before opening the translation workspace.</p>
        </section>
      </div>
    );
  }

  if (!session.authenticated) {
    return null;
  }

  return (
    <div className="page-translate">
      <section className="page-heading">
        <div className="eyebrow-pill">Translation Workspace</div>
        <h1>AI-powered ASL detection in a focused real-time interface</h1>
        <p>
          This prototype uses webcam access and simulated live output so the UI flow is ready before the
          detection model is fully connected.
        </p>
      </section>

      <section className="meeting-grid">
        <Card className="meeting-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">Meeting Console</p>
              <h2>Join a SignMeet room</h2>
            </div>
            <span className="status-badge">Ready to Join</span>
          </div>

          {showJoinPrompt ? (
            <div className="inline-success">Fill in your details below to join the room from the home page flow.</div>
          ) : null}

          <div className="meeting-form-grid">
            <label className="field">
              <span>Your Name</span>
              <input
                ref={displayNameInputRef}
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Enter your display name"
              />
            </label>
            <label className="field">
              <span>Room Name, Meeting ID, or Invite Link</span>
              <input
                type="text"
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                placeholder="Enter room name, meeting ID, or paste invite link"
              />
            </label>
          </div>

          <div className="control-row">
            <Button variant="primary" size="lg" onClick={joinRoom} data-log-action="Join room" data-log-component="TranslatePage">
              Join Room
            </Button>
          </div>

          <div className="meeting-meta">
            <article>
              <span>Participant</span>
              <strong>{displayName || 'Guest User'}</strong>
            </article>
            <article>
              <span>Room</span>
              <strong>{roomName || 'Not set'}</strong>
            </article>
            <article>
              <span>Next Step</span>
              <strong>Open session page</strong>
            </article>
          </div>
        </Card>

        <Card className="session-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">Session Flow</p>
              <h2>What opens next</h2>
            </div>
          </div>

          <div className="session-note">
            After joining, SignMeet opens a dedicated room page with camera preview, translation output,
            and leave-room controls in a focused conferencing layout.
          </div>
        </Card>
      </section>
    </div>
  );
}

export default TranslatePage;
