'use client';

import React, { Component, ReactNode } from 'react';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to logging service
    logger.error('ErrorBoundary caught an error', error, {
      componentStack: errorInfo.componentStack,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
              Something went wrong
            </h2>
            <p className="text-[var(--foreground-secondary)] text-sm mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="text-xs text-[var(--foreground-secondary)] bg-[var(--surface)] p-4 rounded mt-4 overflow-auto max-w-2xl">
                {this.state.error.stack}
              </pre>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              onClick={this.handleReset}
              variant="primary"
              size="md"
            >
              Try again
            </Button>
            <Button
              onClick={() => window.location.href = '/'}
              variant="secondary"
              size="md"
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
