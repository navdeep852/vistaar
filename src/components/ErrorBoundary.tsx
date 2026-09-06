import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  moduleName?: string;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  private getSanitizedErrorMessage(rawMessage?: string): string {
    if (!rawMessage) return 'An unexpected rendering error occurred.';
    // Prevent leaking sensitive internal details (tokens, database credentials, internal SQL)
    if (
      rawMessage.includes('jwt') ||
      rawMessage.includes('token') ||
      rawMessage.includes('password') ||
      rawMessage.includes('secret') ||
      rawMessage.includes('select ') ||
      rawMessage.includes('insert into') ||
      rawMessage.includes('supabase.co')
    ) {
      return 'A system communication error occurred. Please try again or refresh the page.';
    }
    return rawMessage;
  }

  public render() {
    if (this.state.hasError) {
      const title = this.props.moduleName
        ? `Something went wrong in ${this.props.moduleName}`
        : (this.props.fallbackTitle || 'Something went wrong');

      const message = this.getSanitizedErrorMessage(this.state.error?.message);

      return (
        <div className="p-8 max-w-xl mx-auto my-12 bg-white dark:bg-slate-900 rounded-3xl border border-rose-200 dark:border-rose-900/60 shadow-xl text-center space-y-4">
          <div className="w-14 h-14 bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {message}
            </p>
          </div>

          {import.meta.env.DEV && this.state.errorInfo && (
            <details className="text-left bg-slate-950 text-slate-200 p-3 rounded-xl text-[10px] font-mono overflow-x-auto max-h-40 border border-slate-800">
              <summary className="cursor-pointer text-amber-400 font-bold mb-1">
                View Stack Trace (Dev Mode)
              </summary>
              <pre>{this.state.error?.stack}</pre>
            </details>
          )}

          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={this.handleReset}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Try Again</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
