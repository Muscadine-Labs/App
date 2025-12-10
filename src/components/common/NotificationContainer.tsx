'use client';

import React from 'react';
import { useNotifications } from '@/contexts/NotificationContext';
import { Notification } from '@/contexts/NotificationContext';
import { CheckCircleIcon, XCircleIcon, WarningIcon, InfoCircleIcon, XIcon } from '../ui';

interface NotificationItemProps {
  notification: Notification;
  onRemove: (id: string) => void;
}

function NotificationItem({ notification, onRemove }: NotificationItemProps) {
  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircleIcon size="md" color="success" />;
      case 'error':
        return <XCircleIcon size="md" color="danger" />;
      case 'warning':
        return <WarningIcon size="md" color="warning" />;
      case 'info':
      default:
        return <InfoCircleIcon size="md" color="primary" />;
    }
  };

  const getBorderColor = () => {
    switch (notification.type) {
      case 'success': return 'border-l-green-500';
      case 'error': return 'border-l-red-500';
      case 'warning': return 'border-l-yellow-500';
      case 'info':
      default: return 'border-l-blue-500';
    }
  };

  return (
    <div className={`bg-[var(--surface)] border border-[var(--border-subtle)] border-l-4 ${getBorderColor()} rounded-lg shadow-lg p-4 mb-3 max-w-sm w-full transform transition-all duration-300 ease-in-out`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-[var(--foreground)]">
            {notification.title}
          </h3>
          {notification.message && (
            <p className="mt-1 text-sm text-[var(--foreground-secondary)]">
              {notification.message}
            </p>
          )}
        </div>
        <div className="ml-4 flex-shrink-0">
          <button
            onClick={() => onRemove(notification.id)}
            className="inline-flex text-[var(--foreground-secondary)] hover:text-[var(--foreground)] focus:outline-none transition-colors"
          >
            <XIcon size="sm" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotificationContainer() {
  const { notifications, removeNotification } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="flex flex-col items-center space-y-2">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onRemove={removeNotification}
          />
        ))}
      </div>
    </div>
  );
}
