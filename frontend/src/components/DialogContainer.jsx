import React from 'react';
import Dialog from './Dialog';

const DialogContainer = ({ dialogs, onRemoveDialog }) => {
  if (!dialogs || dialogs.length === 0) return null;

  // Only render the most recent dialog
  const topDialog = dialogs[dialogs.length - 1];

  return (
    <Dialog
      title={topDialog.title}
      message={topDialog.message}
      confirmText={topDialog.confirmText}
      cancelText={topDialog.cancelText}
      onConfirm={() => {
        if (topDialog.onConfirm) {
          topDialog.onConfirm();
        }
        onRemoveDialog(topDialog.id);
      }}
      onCancel={() => {
        if (topDialog.onCancel) {
          topDialog.onCancel();
        }
        onRemoveDialog(topDialog.id);
      }}
      type={topDialog.type}
    />
  );
};

export default DialogContainer;
