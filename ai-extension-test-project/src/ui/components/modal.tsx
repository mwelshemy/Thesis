import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, ApiResponse, ModalConfig } from '../types';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: any) => Promise<void>;
  title: string;
  user?: User;
  config?: Partial<ModalConfig>;
  children?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  user,
  config = {},
  children
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Enhanced configuration with defaults
  const fullConfig: ModalConfig = {
    closeOnEsc: true,
    closeOnOverlayClick: true,
    showCloseButton: true,
    maxWidth: '500px',
    minHeight: '200px',
    ...config
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && fullConfig.closeOnEsc) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      previousActiveElement.current = document.activeElement;
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, fullConfig.closeOnEsc]);

  // Focus management
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    } else if (previousActiveElement.current) {
      (previousActiveElement.current as HTMLElement).focus?.();
    }
  }, [isOpen]);

  // Handle overlay click
  const handleOverlayClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget && fullConfig.closeOnOverlayClick) {
      onClose();
    }
  }, [onClose, fullConfig.closeOnOverlayClick]);

  // Form submission with error handling
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await onConfirm(formData);
      onClose();
      setFormData({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Update form data
  const handleInputChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Render different modal content based on user role
  const renderContent = () => {
    if (children) return children;

    if (user?.role === 'admin') {
      return (
        <div className="admin-content">
          <h3>Admin Controls</h3>
          <input
            type="text"
            placeholder="Configuration value"
            onChange=((e) => handleInputChange('config', e.target.value))
          />
          <select onChange=((e) => handleInputChange('privilege', e.target.value))>
            <option value="read">Read</option>
            <option value="write">Write</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      );
    }

    return (
      <div className="user-content">
        <p>Are you sure you want to proceed?</p>
        <input
          type="text"
          placeholder="Enter confirmation"
          onChange=((e) => handleInputChange('confirmation', e.target.value))
        />
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        ref={modalRef}
        className="modal-content"
        style={{ 
          maxWidth: fullConfig.maxWidth,
          minHeight: fullConfig.minHeight 
        }}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          {fullConfig.showCloseButton && (
            <button 
              className="close-button"
              onClick={onClose}
              aria-label="Close modal"
              disabled={isLoading}
            >
              x
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            {renderContent()}
          </div>

          <div className="modal-footer">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isLoading}
              className={isLoading ? 'loading' : ''}
            >
              {isLoading ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Higher-order component for modal management
export function withModal<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  modalConfig?: Partial<ModalConfig>
) {
  return function WithModalWrapper(props: P) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState<any>(null);

    const openModal = useCallback((data?: any) => {
      setModalData(data);
      setIsModalOpen(true);
    }, []);

    const closeModal = useCallback(() => {
      setIsModalOpen(false);
      setModalData(null);
    }, []);

    return (
      <>
        <WrappedComponent 
          {...props} 
          openModal={openModal}
          closeModal={closeModal}
          isModalOpen={isModalOpen}
        />
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          onConfirm={async (data) => {
            console.log('Modal confirmed with data:', data);
          }}
          title="Dynamic Modal"
          config={modalConfig}
        >
          <div>Modal Content: {JSON.stringify(modalData)}</div>
        </Modal>
      </>
    );
  };
}
