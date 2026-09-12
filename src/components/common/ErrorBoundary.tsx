import React, { Component, ErrorInfo, ReactNode } from 'react';
import { errorService } from '../../services/errorService';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: '',
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    const errorId = 'ERR-' + Date.now().toString(36).toUpperCase();
    return { hasError: true, error, errorId };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    errorService.capture(error, {
      componentStack: errorInfo.componentStack,
      location: window.location.href,
    });
    console.error('[HUMA Global Error Boundary Caught]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorId: '' });
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F2F7] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-xl border border-gray-100 text-center space-y-4 animate-in fade-in">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto border border-rose-100 shadow-xs">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="font-heading font-extrabold text-lg sm:text-xl text-[#2E1A47]">
                {this.props.fallbackTitle || 'Terjadi Kendala Sementara'}
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Aplikasi mengalami kendala teknis yang telah diamankan. Jangan khawatir, data dan pesanan Anda tetap tersimpan dengan aman.
              </p>
            </div>

            {this.state.errorId && (
              <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-[11px] text-gray-400 font-mono">
                Kode Referensi: {this.state.errorId}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="py-2.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Muat Ulang</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="clay-button-primary py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Ke Beranda</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
