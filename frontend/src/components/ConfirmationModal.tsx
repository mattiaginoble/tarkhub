import React, { useState } from "react";
import Modal from "./Modal";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (inputValue?: string | boolean) => void;
  title: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
  showDeleteOption?: boolean;
  deleteOptionText?: string;
  showInput?: boolean;
  inputPlaceholder?: string;
  inputDefaultValue?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  cancelText = "Cancel",
  confirmText = "Confirm",
  showDeleteOption = false,
  deleteOptionText = "Also delete installed files",
  showInput = false,
  inputPlaceholder = "",
  inputDefaultValue = "",
}) => {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [inputValue, setInputValue] = useState(inputDefaultValue);

  const handleConfirm = () => {
    if (onConfirm) {
      if (showInput) {
        onConfirm(inputValue);
      } else if (showDeleteOption) {
        onConfirm(deleteFiles);
      } else {
        onConfirm();
      }
    }
    resetState();
    onClose();
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const resetState = () => {
    setDeleteFiles(false);
    setInputValue("");
  };

  const getConfirmButtonText = () => {
    if (showDeleteOption && deleteFiles) {
      return "Remove & Delete";
    }
    return confirmText;
  };

  const getConfirmButtonClass = () => {
    if (showDeleteOption && deleteFiles) {
      return "btn-danger";
    }
    return "btn-primary";
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="md">
      <div className="confirmation-modal">
        <p>{message}</p>

        {showInput && (
          <div className="input-section">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputPlaceholder}
              className="modal-input"
              autoFocus
            />
          </div>
        )}

        {showDeleteOption && (
          <div className="delete-option">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
              />
              <span>{deleteOptionText}</span>
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={handleClose}>
            {cancelText}
          </button>
          <button
            className={`btn ${getConfirmButtonClass()}`}
            onClick={handleConfirm}
            disabled={showInput && !inputValue.trim()}
          >
            {getConfirmButtonText()}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;
