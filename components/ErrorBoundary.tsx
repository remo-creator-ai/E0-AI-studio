import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#F5F7FA] text-zinc-900">
          <div className="max-w-md text-center space-y-6 p-8">
            <div className="w-16 h-16 bg-zinc-100 border border-zinc-200 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} className="text-zinc-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tight text-zinc-900">
                Something went wrong
              </h2>
              <p className="text-sm text-zinc-500">
                {this.state.error?.message || 'An unexpected error occurred.'}
              </p>
            </div>
            <button
              onClick={this.handleRetry}
              className="px-8 py-3 bg-primary hover:bg-[#003E99] rounded-full font-black text-white flex items-center gap-2 mx-auto transition-all active:scale-95"
            >
              <RefreshCw size={18} />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
