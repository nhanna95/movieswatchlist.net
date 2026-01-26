import React, { useEffect } from 'react';
import './KeyboardShortcutsHelp.css';

const KeyboardShortcutsHelp = ({ onClose }) => {
  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const shortcuts = [
    { key: '/', description: 'Focus search bar' },
    { key: 'Escape', description: 'Close modal/clear selection' },
    { key: 'Enter', description: 'Open selected movie modal' },
    { key: 'F', description: 'Toggle favorite on selected movie' },
    { key: '?', description: 'Show keyboard shortcuts help' },
    { key: '↑ ↓', description: 'Navigate between movies' },
  ];

  return (
    <div className="shortcuts-modal-overlay" onClick={onClose}>
      <div className="shortcuts-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="shortcuts-modal-close" onClick={onClose}>
          ×
        </button>
        <h2 className="shortcuts-modal-title">Keyboard Shortcuts</h2>
        <div className="shortcuts-list">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="shortcut-item">
              <div className="shortcut-keys">
                {shortcut.key.split(' + ').map((key, i) => (
                  <span key={i} className="shortcut-key">
                    {key}
                  </span>
                ))}
              </div>
              <div className="shortcut-description">{shortcut.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsHelp;
