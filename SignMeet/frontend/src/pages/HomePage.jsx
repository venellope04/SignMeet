import { Link, useOutletContext } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';

const featureCards = [
  {
    title: 'Live visual translation',
    description:
      'Turn webcam input into readable text with a focused interface designed for accessibility and speed.'
  },
  {
    title: 'Human-centered UI',
    description:
      'Built around clarity, spacing, and confidence so users always know where to look and what to do next.'
  },
  {
    title: 'Room to scale',
    description:
      'A modular frontend structure that can grow into authentication, history, and model-driven insights.'
  }
];

function HomePage() {
  const { session } = useOutletContext();

  return (
    <div className="page-home">
      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow-pill">Modern ASL Translation Experience</div>
          <h1>Break Communication Barriers with SignMeet</h1>
          <p className="hero-description">
            SignMeet is an AI-powered American Sign Language detection interface designed to turn gestures
            into understandable text through a premium, accessible, and responsive experience.
          </p>
          <div className="hero-actions">
            <Link to={session.authenticated ? '/translate?openJoin=true' : '/login'} data-log-action="Open join room flow" data-log-component="HomePage">
              <Button variant="primary" size="lg">Join Room</Button>
            </Link>
            <Link to="/login" data-log-action="Open login page from home" data-log-component="HomePage">
              <Button variant="ghost" size="lg">Open Login</Button>
            </Link>
          </div>
          <div className="hero-stats">
            <div>
              <strong>Realtime</strong>
              <span>Dummy live output for now</span>
            </div>
            <div>
              <strong>Responsive</strong>
              <span>Desktop, tablet, and mobile ready</span>
            </div>
            <div>
              <strong>Premium</strong>
              <span>Dark SaaS-inspired UI system</span>
            </div>
          </div>
        </div>

        <Card className="hero-visual">
          <div className="visual-display">
            <div className="visual-toolbar">
              <span />
              <span />
              <span />
            </div>
            <div className="visual-stage">
              <div className="camera-preview">
                <div className="camera-chip">Webcam Active</div>
                <div className="signal-bars">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="translation-panel">
                <p>Live Translation</p>
                <strong>"Hello, welcome to SignMeet."</strong>
                <span>ASL gesture stream recognized in a calm, readable layout.</span>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <section className="feature-grid">
        {featureCards.map((feature, index) => (
          <Card key={feature.title} className="feature-card" style={{ animationDelay: `${index * 120}ms` }}>
            <div className="feature-index">0{index + 1}</div>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}

export default HomePage;
