import React, { createContext, useContext, useState, ReactNode } from "react";
import ConfirmationModal from "../components/ConfirmationModal";

export interface ModalOptions {
  title?: string;
  message: string;
  type?: "success" | "error" | "warning" | "info";
  duration?: number;
}

export interface ConfirmModalOptions {
  title: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
  onConfirm?: (inputValue?: string) => void;
  onCancel?: () => void;
  showDeleteOption?: boolean;
  deleteOptionText?: string;
  showInput?: boolean;
  inputPlaceholder?: string;
  inputDefaultValue?: string;
}

interface ModalContextType {
  showModal: (options: ModalOptions) => void;
  showConfirmation: (options: ConfirmModalOptions) => void;
  hideModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};

interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const [modal, setModal] = useState<ModalOptions | null>(null);
  const [confirmModal, setConfirmModal] = useState<
    (ConfirmModalOptions & { isOpen: boolean }) | null
  >(null);

  const showModal = (options: ModalOptions) => {
    setModal(options);

    if (options.duration && options.duration > 0) {
      setTimeout(() => {
        setModal(null);
      }, options.duration);
    }
  };

  const showConfirmation = (options: ConfirmModalOptions) => {
    setConfirmModal({ ...options, isOpen: true });
  };

  const hideModal = () => {
    setModal(null);
    setConfirmModal(null);
  };

  return (
    <ModalContext.Provider value={{ showModal, showConfirmation, hideModal }}>
      {children}

      {modal && (
        <div className={`alert-modal alert-${modal.type || "info"}`}>
          <div className="alert-content">
            {modal.title && <h4>{modal.title}</h4>}
            <p>{modal.message}</p>
            <button className="alert-close" onClick={hideModal}>
              ×
            </button>
          </div>
        </div>
      )}

      {confirmModal && (
        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          onClose={() => {
            confirmModal.onCancel?.();
            hideModal();
          }}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          cancelText={confirmModal.cancelText}
          confirmText={confirmModal.confirmText}
          showDeleteOption={confirmModal.showDeleteOption}
          deleteOptionText={confirmModal.deleteOptionText}
          showInput={confirmModal.showInput}
          inputPlaceholder={confirmModal.inputPlaceholder}
          inputDefaultValue={confirmModal.inputDefaultValue}
        />
      )}
    </ModalContext.Provider>
  );
};
