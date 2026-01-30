import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import Login from './Login';
import Register from './Register';
import './AuthGuard.css';

/**
 * AuthGuard component that protects routes requiring authentication.
 * Always renders children (app shell). When not authenticated, shows Login or Register as a modal overlay.
 * When guestMode and showAuthModal, also shows the auth overlay (e.g. user clicked "Login" in header).
 */
const AuthGuard = ({ children, showAuthModal = false, setShowAuthModal }) => {
  const { isAuthenticated, loading, error, login, register, startGuestMode, guestMode } = useAuth();
  const [authMode, setAuthMode] = useState('login');

  const showOverlay = !loading && ((!isAuthenticated) || (guestMode && showAuthModal));

  const handleLoginSuccess = async (username, password) => {
    const result = await login(username, password);
    if (result?.success && setShowAuthModal) setShowAuthModal(false);
    return result;
  };

  const handleRegisterSuccess = async (username, password) => {
    const result = await register(username, password);
    if (result?.success && setShowAuthModal) setShowAuthModal(false);
    return result;
  };

  return (
    <>
      {children}
      {loading && (
        <div className="auth-loading auth-loading-overlay">
          <div className="auth-loading-spinner"></div>
          <p>Loading...</p>
        </div>
      )}
      {showOverlay && authMode === 'login' && (
        <Login
          asModal
          onLogin={handleLoginSuccess}
          onSwitchToRegister={() => setAuthMode('register')}
          onStartGuest={!showAuthModal ? startGuestMode : undefined}
          onClose={guestMode && setShowAuthModal ? () => setShowAuthModal(false) : undefined}
          error={error}
          loading={loading}
        />
      )}
      {showOverlay && authMode === 'register' && (
        <Register
          asModal
          onRegister={handleRegisterSuccess}
          onSwitchToLogin={() => setAuthMode('login')}
          onClose={guestMode && setShowAuthModal ? () => setShowAuthModal(false) : undefined}
          error={error}
          loading={loading}
        />
      )}
    </>
  );
};

export default AuthGuard;
