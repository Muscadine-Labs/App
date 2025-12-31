'use client';

import React from 'react';

export type IconName = 
  | 'wallet'
  | 'external-link'
  | 'close'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'chevron-right'
  | 'info'
  | 'check-circle'
  | 'x-circle'
  | 'warning'
  | 'info-circle'
  | 'x'
  | 'book'
  | 'loading-spinner'
  | 'money-in'
  | 'money-out'
  | 'panel-right'
  | 'sidebar'
  | 'glasses'
  | 'menu';

export interface IconProps {
  name: IconName;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: 'current' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'muted';
}

const iconPaths: Record<IconName, string | string[]> = {
  wallet: [
    'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
    'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'
  ],
  'external-link': [
    'M18 13V19C18 20.1046 17.1046 21 16 21H5C3.89543 21 3 20.1046 3 19V8C3 6.89543 3.89543 6 5 6H11',
    'M15 3H21V9',
    'M10 14L21 3'
  ],
  close: 'M18 6L6 18M6 6L18 18',
  'chevron-down': 'M6 9L12 15L18 9',
  'chevron-up': 'M18 15L12 9L6 15',
  'chevron-left': 'M15 18L9 12L15 6',
  'chevron-right': 'M9 18L15 12L9 6',
  info: 'M12 16V12M12 8H12.01',
  'check-circle': 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
  'x-circle': 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z',
  warning: 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
  'info-circle': 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z',
  x: 'M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z',
  book: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  'loading-spinner': 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z',
  'money-in': [
    'M9.5 13.7502C9.5 14.7202 10.25 15.5002 11.17 15.5002H13.05C13.85 15.5002 14.5 14.8202 14.5 13.9702C14.5 13.0602 14.1 12.7302 13.51 12.5202L10.5 11.4702C9.91 11.2602 9.51001 10.9402 9.51001 10.0202C9.51001 9.18023 10.16 8.49023 10.96 8.49023H12.84C13.76 8.49023 14.51 9.27023 14.51 10.2402',
    'M12 7.5V16.5',
    'M22 12C22 17.52 17.52 22 12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2',
    'M17 3V7H21',
    'M22 2L17 7'
  ],
  'money-out': [
    'M9.5 13.7502C9.5 14.7202 10.25 15.5002 11.17 15.5002H13.05C13.85 15.5002 14.5 14.8202 14.5 13.9702C14.5 13.0602 14.1 12.7302 13.51 12.5202L10.5 11.4702C9.91 11.2602 9.51001 10.9402 9.51001 10.0202C9.51001 9.18023 10.16 8.49023 10.96 8.49023H12.84C13.76 8.49023 14.51 9.27023 14.51 10.2402',
    'M12 7.5V16.5',
    'M22 12C22 17.52 17.52 22 12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2',
    'M22 6V2H18',
    'M17 7L22 2'
  ],
  'panel-right': [
    'M9 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5',
    'M15 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5',
    'M9 9h6',
    'M9 15h6',
  ],
  'sidebar': [
    'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'M16.5 4v16',
  ],
  'glasses': [
    'M6 12a4 4 0 1 0 8 0',
    'M18 12a4 4 0 1 0-8 0',
    'M10 12h4',
  ],
  'menu': [
    'M4 6h16',
    'M4 12h16',
    'M4 18h16',
  ],
};

const sizeClasses = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
};

const colorClasses = {
  current: 'text-current',
  primary: 'text-[var(--primary)]',
  secondary: 'text-[var(--foreground-secondary)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger: 'text-[var(--danger)]',
  muted: 'text-[var(--foreground-muted)]',
};

export function Icon({ 
  name, 
  size = 'md', 
  className = '', 
  color = 'current' 
}: IconProps) {
  const sizeClass = sizeClasses[size];
  const colorClass = colorClasses[color];
  
  const classes = [
    sizeClass,
    colorClass,
    className,
  ].filter(Boolean).join(' ');

  // Special handling for loading spinner
  if (name === 'loading-spinner') {
    const iconPath = iconPaths[name];
    return (
      <svg className={`${classes} animate-spin`} fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d={Array.isArray(iconPath) ? iconPath[0] : iconPath} />
      </svg>
    );
  }

  // Special handling for filled icons (check-circle, x-circle, etc.)
  const filledIcons = ['check-circle', 'x-circle', 'warning', 'info-circle', 'x'];
  const isFilled = filledIcons.includes(name);

  if (isFilled) {
    const iconPath = iconPaths[name];
    return (
      <svg className={classes} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d={Array.isArray(iconPath) ? iconPath[0] : iconPath} clipRule="evenodd" />
      </svg>
    );
  }

  // Default stroke-based icons
  const iconPath = iconPaths[name];
  const isMultiPath = Array.isArray(iconPath);

  return (
    <svg 
      className={classes} 
      fill="none" 
      viewBox="0 0 24 24" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      stroke="currentColor"
    >
      {isMultiPath ? (
        iconPath.map((path, index) => (
          <path key={index} d={path} />
        ))
      ) : (
        <path d={iconPath} />
      )}
    </svg>
  );
}

// Convenience components for common icons
export function WalletIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="wallet" {...props} />;
}

export function ExternalLinkIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="external-link" {...props} />;
}

export function CloseIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="close" {...props} />;
}

export function ChevronDownIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="chevron-down" {...props} />;
}

export function ChevronUpIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="chevron-up" {...props} />;
}

export function InfoIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="info" {...props} />;
}

export function CheckCircleIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="check-circle" {...props} />;
}

export function XCircleIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="x-circle" {...props} />;
}

export function WarningIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="warning" {...props} />;
}

export function InfoCircleIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="info-circle" {...props} />;
}

export function XIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="x" {...props} />;
}

export function BookIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="book" {...props} />;
}

export function LoadingSpinnerIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="loading-spinner" {...props} />;
}

export function MoneyInIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="money-in" {...props} />;
}

export function MoneyOutIcon(props: Omit<IconProps, 'name'>) {
  return <Icon name="money-out" {...props} />;
}
