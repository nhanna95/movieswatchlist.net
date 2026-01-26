import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import './SecurityWarningModal.css';

const SecurityWarningModal = ({ onAccept, onCancel }) => {
  const [acknowledged, setAcknowledged] = useState(false);

  const handleAccept = () => {
    if (acknowledged) {
      onAccept();
    }
  };

  return createPortal(
    <div className="security-warning-overlay">
      <div className="security-warning-modal">
        <div className="security-warning-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h2 className="security-warning-title">Security Warning</h2>

        <div className="security-warning-content">
          <p className="security-warning-main">
            This site makes <strong>no guarantee of security</strong> for your account or password.
          </p>

          <div className="security-warning-important">
            <strong>IMPORTANT:</strong> Do NOT use a password that you use for other websites or accounts.
          </div>

          <p className="security-warning-recommendation">
            We recommend using a <strong>low-security password</strong> that you don't use anywhere else.
            This is a hobby project and may not have enterprise-level security measures in place.
          </p>

          <p className="security-warning-note">
            By proceeding, you acknowledge that you understand these risks and accept full responsibility for your account security.
          </p>
        </div>

        <label className="security-warning-checkbox">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>I understand and accept these security risks</span>
        </label>

        <div className="security-warning-actions">
          <button
            type="button"
            className="security-warning-button cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="security-warning-button accept"
            onClick={handleAccept}
            disabled={!acknowledged}
          >
            I Understand, Continue
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SecurityWarningModal;
