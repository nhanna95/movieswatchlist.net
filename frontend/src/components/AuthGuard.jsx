import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import Login from './Login';
import Register from './Register';
import './AuthGuard.css';

/**
 * AuthGuard component that protects routes requiring authentication.
 * Shows Login or Register screens if user is not authenticated.
 */
const AuthGuard = ({ children }) => {
  const { isAuthenticated, loading, error, login, register } = useAuth();
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // If authenticated, render children
  if (isAuthenticated) {
    return children;
  }

  // Show login or register screen
  if (authMode === 'login') {
    return (
      <Login
        onLogin={login}
        onSwitchToRegister={() => setAuthMode('register')}
        error={error}
        loading={loading}
      />
    );
  }

  return (
    <Register
      onRegister={register}
      onSwitchToLogin={() => setAuthMode('login')}
      error={error}
      loading={loading}
    />
  );
};

export default AuthGuard;
