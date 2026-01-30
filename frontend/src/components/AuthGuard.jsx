import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import Login from './Login';
import Register from './Register';
import './AuthGuard.css';

/**
 * AuthGuard component that protects routes requiring authentication.
 * Always renders children (app shell). When not authenticated, shows Login or Register as a modal overlay.
 */
const AuthGuard = ({ children }) => {
  const { isAuthenticated, loading, error, login, register } = useAuth();
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'

  return (
    <>
      {children}
      {loading && (
        <div className="auth-loading auth-loading-overlay">
          <div className="auth-loading-spinner"></div>
          <p>Loading...</p>
        </div>
      )}
      {!loading && !isAuthenticated && authMode === 'login' && (
        <Login
          asModal
          onLogin={login}
          onSwitchToRegister={() => setAuthMode('register')}
          error={error}
          loading={loading}
        />
      )}
      {!loading && !isAuthenticated && authMode === 'register' && (
        <Register
          asModal
          onRegister={register}
          onSwitchToLogin={() => setAuthMode('login')}
          error={error}
          loading={loading}
        />
      )}
    </>
  );
};

export default AuthGuard;
