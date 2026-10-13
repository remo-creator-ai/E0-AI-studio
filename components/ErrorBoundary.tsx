import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { saveProject } from '../services/projectService';
import i18n from '../i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  recovering?: boolean;
  recoveryError?: string;
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

  handleRetry = async () => {
    if (this.isChunkError()) {
      this.setState({ recovering: true, recoveryError: undefined });
      try {
        const project = useStore.getState().project;
        const user = useAuthStore.getState().user;
        if (project) {
          if (!user) throw new Error('No session');
          await saveProject(user.id, project);
        }
        window.location.reload();
      } catch {
        this.setState({ recovering: false, recoveryError: i18n.language.startsWith('en')
          ? 'Unable to save your project. Check your connection and try again.'
          : '프로젝트를 저장하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.' });
      }
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  isChunkError = () => /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically imported module/i.test(this.state.error?.message ?? '');

  render() {
    if (this.state.hasError) {
      const en = i18n.language.startsWith('en');
      const stale = this.isChunkError();
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#F4F7F6] text-zinc-900">
          <div className="max-w-md text-center space-y-6 p-8">
            <div className="w-16 h-16 bg-zinc-100 border border-zinc-200 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} className="text-zinc-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tight text-zinc-900">
                {stale ? (en ? 'Reload the latest workspace' : '최신 작업 화면을 불러와 주세요') : (en ? 'Something went wrong' : '오류가 발생했습니다')}
              </h2>
              <p className="text-sm text-zinc-500">
                {stale ? (en ? 'A screen file could not be loaded. Save your project and reload, then reopen it from the dashboard.' : '화면 파일을 불러오지 못했습니다. 프로젝트를 저장하고 새로고침한 뒤, 내 프로젝트에서 이어서 작업하세요.') : this.state.error?.message}
              </p>
            </div>
            <button
              onClick={this.handleRetry}
              disabled={this.state.recovering}
              className="px-8 py-3 bg-primary hover:bg-[#005D53] rounded-full font-black text-white flex items-center gap-2 mx-auto transition-all active:scale-95"
            >
              <RefreshCw size={18} />
              {this.state.recovering ? (en ? 'Saving…' : '저장 중…') : stale ? (en ? 'Save and reload' : '저장하고 최신 화면 불러오기') : (en ? 'Try again' : '다시 시도')}
            </button>
            {this.state.recoveryError && <p role="alert" className="text-sm text-red-700">{this.state.recoveryError}</p>}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
