import React, { useEffect } from 'react';
import './Dialog.css';

const Dialog = ({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'confirm',
}) => {
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    const handleEnter = (event) => {
      if (event.key === 'Enter' && onConfirm) {
        onConfirm();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleEnter);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleEnter);
    };
  }, [onConfirm, onCancel]);

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="dialog-title">{title}</h3>}
        {message && <p className="dialog-message">{message}</p>}
        <div className="dialog-actions">
          <button className="dialog-button dialog-button-cancel" onClick={onCancel} type="button">
            {cancelText}
          </button>
          {onConfirm && (
            <button
              className={`dialog-button dialog-button-confirm dialog-button-${type}`}
              onClick={onConfirm}
              type="button"
              autoFocus
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dialog;
