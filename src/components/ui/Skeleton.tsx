'use client';

import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  className = '',
  ...props
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-[var(--surface-hover)]';
  
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  const classes = [
    baseClasses,
    variantClasses[variant],
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={style}
      {...props}
    />
  );
}

// Convenience components for common patterns
export function SkeletonText({ lines = 1, className = '', ...props }: { lines?: number; className?: string } & Omit<SkeletonProps, 'variant'>) {
  if (lines === 1) {
    return <Skeleton variant="text" height="1em" className={className} {...props} />;
  }

  return (
    <div className={className}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          variant="text"
          height="1em"
          className={index < lines - 1 ? 'mb-2' : ''}
          {...props}
        />
      ))}
    </div>
  );
}

export function SkeletonCircle(props: Omit<SkeletonProps, 'variant'>) {
  return <Skeleton variant="circular" {...props} />;
}

export function SkeletonRect(props: Omit<SkeletonProps, 'variant'>) {
  return <Skeleton variant="rectangular" {...props} />;
}

