'use client';

import React, { useEffect, useState } from 'react';
import { Toast as ToastType } from '@/contexts/ToastContext';

interface ToastProps {
  toast: ToastType;
  onRemove: (id: string) => void;
}

export function Toast({ toast, onRemove }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Start exit animation slightly before the toast is removed
    const duration = toast.duration ?? 3000; // Default to 3000ms if not specified
    if (duration > 0) {
      const exitTimer = setTimeout(() => {
        setIsExiting(true);
      }, Math.max(0, duration - 200)); // Start fade out 200ms before removal

      return () => clearTimeout(exitTimer);
    }
  }, [toast.duration]);

  const handleRemove = () => {
    setIsExiting(true);
    // Wait for animation to complete before removing
    setTimeout(() => {
      onRemove(toast.id);
    }, 200);
  };

  const getToastStyles = () => {
    const baseStyles = 'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[200px] max-w-md';
    
    switch (toast.type) {
      case 'success':
        return `${baseStyles} bg-[var(--success-subtle)] border-[var(--success)]`;
      case 'error':
        return `${baseStyles} bg-[var(--danger-subtle)] border-[var(--danger)]`;
      case 'warning':
        return `${baseStyles} bg-[var(--warning-subtle)] border-[var(--warning)]`;
      case 'info':
        return `${baseStyles} bg-[var(--info-subtle)] border-[var(--info)]`;
      default:
        return `${baseStyles} bg-[var(--surface-elevated)] border-[var(--border-subtle)]`;
    }
  };

  const getIconColor = () => {
    switch (toast.type) {
      case 'success':
        return 'text-[var(--success)]';
      case 'error':
        return 'text-[var(--danger)]';
      case 'warning':
        return 'text-[var(--warning)]';
      case 'info':
        return 'text-[var(--info)]';
      default:
        return 'text-[var(--foreground)]';
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'info':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`${getToastStyles()} ${
        isExiting ? 'toast-exit' : 'toast-enter'
      }`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={`flex-shrink-0 ${getIconColor()}`}>
        {getIcon()}
      </div>
      <p className="flex-1 text-sm font-medium text-[var(--foreground)]">
        {toast.message}
      </p>
      <button
        onClick={handleRemove}
        className="flex-shrink-0 text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
        aria-label="Close notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

