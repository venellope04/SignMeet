import { Link, useLocation } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';

function ThankYouPage() {
  const location = useLocation();
  const reason = location.state?.reason === 'meeting-ended' ? 'meeting-ended' : 'left';
  const roomName = location.state?.roomName || 'your meeting';

  const title =
    reason === 'meeting-ended' ? 'The meeting has ended' : 'You have left the meeting';
  const description =
    reason === 'meeting-ended'
      ? `Thank you for joining the call. ${roomName} has ended, and your session is now closed.`
      : `Thank you for joining the call. You have left ${roomName}, and your session has been closed.`;

  return (
    <div className="page-translate">
      <section className="page-heading">
        <div className="eyebrow-pill">Call Complete</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>

      <section className="meeting-grid">
        <Card className="meeting-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">Thank You</p>
              <h2>Session summary</h2>
            </div>
            <span className="status-badge">Closed</span>
          </div>

          <div className="session-note">
            {reason === 'meeting-ended'
              ? 'The room is no longer active. You can start or join another session whenever you are ready.'
              : 'You have exited the room successfully. You can return to the workspace to join another session.'}
          </div>

          <div className="meeting-meta">
            <article>
              <span>Room</span>
              <strong>{roomName}</strong>
            </article>
            <article>
              <span>Status</span>
              <strong>{reason === 'meeting-ended' ? 'Meeting ended' : 'Left by participant'}</strong>
            </article>
            <article>
              <span>Next Step</span>
              <strong>Join another room</strong>
            </article>
          </div>

          <div className="control-row">
            <Link to="/translate" data-log-action="Join another room from thank you page" data-log-component="ThankYouPage">
              <Button variant="primary" size="lg">Join Another Room</Button>
            </Link>
            <Link to="/" data-log-action="Return home from thank you page" data-log-component="ThankYouPage">
              <Button variant="ghost" size="lg">Back Home</Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}

export default ThankYouPage;
