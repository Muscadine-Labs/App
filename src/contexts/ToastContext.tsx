'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'neutral';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number; // Duration in milliseconds, defaults to 3000
  actionUrl?: string; // Optional URL for action link
  actionLabel?: string; // Optional label for action link (defaults to extracted from URL)
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number, actionUrl?: string, actionLabel?: string) => void;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number, actionUrl?: string, actionLabel?: string) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((
    message: string,
    type: ToastType = 'success',
    duration: number = 3000,
    actionUrl?: string,
    actionLabel?: string
  ) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: Toast = {
      id,
      message,
      type,
      duration,
      actionUrl,
      actionLabel,
    };

    setToasts(prev => [...prev, newToast]);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const success = useCallback((message: string, duration?: number, actionUrl?: string, actionLabel?: string) => {
    showToast(message, 'success', duration, actionUrl, actionLabel);
  }, [showToast]);

  const error = useCallback((message: string, duration?: number) => {
    showToast(message, 'error', duration);
  }, [showToast]);

  const info = useCallback((message: string, duration?: number) => {
    showToast(message, 'info', duration);
  }, [showToast]);

  const warning = useCallback((message: string, duration?: number) => {
    showToast(message, 'warning', duration);
  }, [showToast]);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        removeToast,
        success,
        error,
        info,
        warning,
      }}
    >
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

