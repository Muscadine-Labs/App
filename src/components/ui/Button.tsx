'use client';

import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  children?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  children,
  loading = false,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] text-white focus:ring-[var(--primary)] shadow-sm',
    secondary: 'bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)] text-[var(--foreground)] border border-[var(--border-subtle)] focus:ring-[var(--border)] shadow-sm',
    ghost: 'hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)] text-[var(--foreground)] focus:ring-[var(--border)]',
    danger: 'bg-[var(--danger)] hover:bg-[var(--danger-hover)] active:bg-[var(--danger)] text-white focus:ring-[var(--danger)] shadow-sm',
    icon: 'hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)] text-[var(--foreground-secondary)] focus:ring-[var(--border)] rounded-full',
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm rounded-md gap-1.5',
    md: 'px-4 py-2 text-sm rounded-lg gap-2',
    lg: 'px-6 py-3 text-base rounded-lg gap-2',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-4 h-4', 
    lg: 'w-5 h-5',
  };

  const iconOnlySizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  const isIconOnly = variant === 'icon' || (!children && icon);
  const sizeClasses = isIconOnly ? iconOnlySizes[size] : sizes[size];
  const iconSizeClass = iconSizes[size];

  const classes = [
    baseClasses,
    variants[variant],
    sizeClasses,
    fullWidth && !isIconOnly ? 'w-full' : '',
    className,
  ].filter(Boolean).join(' ');

  const iconElement = icon && (
    <span className={`${iconSizeClass} flex-shrink-0 ${loading ? 'opacity-0' : ''}`}>
      {icon}
    </span>
  );

  const loadingSpinner = loading && (
    <span className={`${iconSizeClass} flex-shrink-0 animate-spin`}>
      <svg className="w-full h-full" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </span>
  );

  return (
    <button 
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading && loadingSpinner}
      {!loading && icon && iconPosition === 'left' && iconElement}
      {children && (
        <span className={loading ? 'opacity-0' : ''}>
          {children}
        </span>
      )}
      {!loading && icon && iconPosition === 'right' && iconElement}
    </button>
  );
}

// Convenience components for common patterns
export function PrimaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button variant="primary" {...props} />;
}

export function SecondaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button variant="secondary" {...props} />;
}

export function GhostButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button variant="ghost" {...props} />;
}

export function DangerButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button variant="danger" {...props} />;
}

export function IconButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button variant="icon" {...props} />;
}
