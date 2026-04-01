import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';

function LoginPage() {
  const navigate = useNavigate();
  const { session, setSession } = useOutletContext();
  const [mode, setMode] = useState('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatusMessage('');
    setErrorMessage('');
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload =
      mode === 'login'
        ? {
            identifier: formData.get('identifier'),
            password: formData.get('password')
          }
        : {
            email: formData.get('email'),
            password: formData.get('password'),
            confirmPassword: formData.get('confirmPassword')
          };

    try {
      const response = await fetch(`/api/auth/${mode}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setSession({
        loading: false,
        authenticated: true,
        username: data.username || '',
        email: data.email || ''
      });
      setStatusMessage(mode === 'login' ? 'Login successful.' : 'Account created successfully.');

      window.setTimeout(() => {
        navigate('/translate');
      }, 700);
    } catch (error) {
      setErrorMessage('Unable to reach the backend right now. Please check that Django is running.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-login">
      <div className="login-grid">
        <div className="login-copy">
          <div className="eyebrow-pill">Secure Access</div>
          <h1>Login to your SignMeet workspace</h1>
          <p>
            Access translation tools, future session history, and a cleaner workflow through a polished
            sign-first product experience.
          </p>
          <ul className="login-benefits">
            <li>Fast room access for translation sessions</li>
            <li>Clean dashboard-ready structure for future expansion</li>
            <li>Consistent premium UI across every page</li>
          </ul>
        </div>

        <Card className="login-card">
          <div className="card-head">
            <div>
              <p className="card-kicker">{mode === 'login' ? 'Welcome Back' : 'Create Account'}</p>
              <h2>{mode === 'login' ? 'Sign in' : 'Sign up'}</h2>
            </div>
          </div>

          <div className="auth-toggle">
            <button
              type="button"
              className={`auth-toggle-button ${mode === 'login' ? 'is-active' : ''}`}
              data-log-action="Switch auth mode to login"
              data-log-component="LoginPage"
              onClick={() => setMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={`auth-toggle-button ${mode === 'signup' ? 'is-active' : ''}`}
              data-log-action="Switch auth mode to signup"
              data-log-component="LoginPage"
              onClick={() => setMode('signup')}
            >
              Sign Up
            </button>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>{mode === 'login' ? 'Email or Username' : 'Email'}</span>
              <input
                type={mode === 'login' ? 'text' : 'email'}
                name={mode === 'login' ? 'identifier' : 'email'}
                placeholder={mode === 'login' ? 'you@example.com or username' : 'you@example.com'}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" name="password" placeholder="Enter your password" required />
            </label>

            {mode === 'signup' ? (
              <label className="field">
                <span>Confirm Password</span>
                <input type="password" name="confirmPassword" placeholder="Confirm your password" required />
              </label>
            ) : (
              <div className="form-meta">
                <label className="checkbox-row">
                  <input type="checkbox" />
                  <span>Keep me signed in</span>
                </label>
                <button type="button" className="text-link" data-log-action="Open forgot password prompt" data-log-component="LoginPage">Forgot password?</button>
              </div>
            )}

            {errorMessage ? <div className="inline-alert">{errorMessage}</div> : null}
            {statusMessage ? <div className="inline-success">{statusMessage}</div> : null}

            <Button
              variant="primary"
              size="lg"
              className="full-width"
              type="submit"
              disabled={isSubmitting}
              data-log-action={mode === 'login' ? 'Submit login form' : 'Submit signup form'}
              data-log-component="LoginPage"
            >
              {isSubmitting
                ? mode === 'login'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'login'
                  ? 'Login'
                  : 'Create Account'}
            </Button>
          </form>

          {session.authenticated ? (
            <div className="session-note">Current session: {session.username || session.email}</div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

export default LoginPage;
