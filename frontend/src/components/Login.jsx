import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import './Login.css';

const Login = ({ asModal, onLogin, onSwitchToRegister, onStartGuest, error, loading }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);

    if (!username.trim()) {
      setLocalError('Username is required');
      return;
    }
    if (!password) {
      setLocalError('Password is required');
      return;
    }

    const result = await onLogin(username, password);
    if (!result.success) {
      setLocalError(result.error);
    }
  };

  const displayError = localError || error;

  const overlayClass = asModal ? 'auth-overlay auth-overlay-modal' : 'auth-overlay';

  return createPortal(
    <div className={overlayClass}>
      <div className="auth-container">
        <div className="auth-header">
          <h1>Movies Watchlist</h1>
          <p>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {displayError && (
            <div className="auth-error">
              {displayError}
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="auth-button primary"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          {onStartGuest && (
            <button
              type="button"
              className="auth-button secondary"
              disabled={loading}
              onClick={onStartGuest}
            >
              Continue as Guest
            </button>
          )}
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <button
              type="button"
              className="auth-link"
              onClick={onSwitchToRegister}
              disabled={loading}
            >
              Create one
            </button>
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Login;
