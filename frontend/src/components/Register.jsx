import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import SecurityWarningModal from './SecurityWarningModal';
import './Register.css';

const Register = ({ onRegister, onSwitchToLogin, error, loading }) => {
  const [showSecurityWarning, setShowSecurityWarning] = useState(true);
  const [warningAccepted, setWarningAccepted] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState(null);

  const handleSecurityWarningAccept = () => {
    setWarningAccepted(true);
    setShowSecurityWarning(false);
  };

  const handleSecurityWarningCancel = () => {
    setShowSecurityWarning(false);
    onSwitchToLogin();
  };

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);

    // Validation
    if (!username.trim()) {
      setLocalError('Username is required');
      return;
    }
    if (username.length < 3) {
      setLocalError('Username must be at least 3 characters');
      return;
    }
    if (!email.trim()) {
      setLocalError('Email is required');
      return;
    }
    if (!validateEmail(email)) {
      setLocalError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setLocalError('Password is required');
      return;
    }
    if (password.length < 4) {
      setLocalError('Password must be at least 4 characters');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    const result = await onRegister(username, email, password);
    if (!result.success) {
      setLocalError(result.error);
    }
  };

  // Show security warning first
  if (showSecurityWarning && !warningAccepted) {
    return (
      <SecurityWarningModal
        onAccept={handleSecurityWarningAccept}
        onCancel={handleSecurityWarningCancel}
      />
    );
  }

  const displayError = localError || error;

  return createPortal(
    <div className="auth-overlay">
      <div className="auth-container register-container">
        <div className="auth-header">
          <h1>Movies Watchlist</h1>
          <p>Create your account</p>
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
              placeholder="Choose a username"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
              disabled={loading}
            />
            <span className="auth-field-hint">
              Remember: Use a unique, low-security password for this site only
            </span>
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="auth-button primary"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <button
              type="button"
              className="auth-link"
              onClick={onSwitchToLogin}
              disabled={loading}
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Register;
