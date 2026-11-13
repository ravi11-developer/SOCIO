import React from 'react';
import { ExperimentProvider, useExperiment, STAGES } from './context/ExperimentContext';
import Header from './components/common/Header';
import Page1InstructionsConsent from './components/pages/Page1InstructionsConsent';
import Page2Audio1 from './components/pages/Page2Audio1';
import Page3Questions1 from './components/pages/Page3Questions1';
import Page4Audio2 from './components/pages/Page4Audio2';
import Page5Questions2 from './components/pages/Page5Questions2';
import { AlertCircle, Loader2, WifiOff, RotateCcw, CheckCircle2, UserPlus } from 'lucide-react';
import { EXPERIMENT_CONFIG } from './config/experiment';

function ConnectionErrorScreen({ onRetry, loading }) {
  return (
    <div className="max-w-content mx-auto px-4 py-10" data-testid="connection-error-screen">
      <div className="academic-card p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
          <WifiOff className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-main">We could not connect to the study</h1>
        <p className="text-sm text-secondary leading-relaxed max-w-md mx-auto">
          Your answers can only be recorded while the study is connected. Please check your internet
          connection and try again. If this keeps happening, please contact the research team.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={loading}
          className="inline-flex items-center px-6 py-3 rounded-lg text-sm font-semibold bg-primary hover:bg-primary-hover text-white disabled:bg-slate-300"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          {loading ? 'Connecting...' : 'Try again'}
        </button>
      </div>
    </div>
  );
}

function AlreadyCompletedScreen({ code, onStartNew }) {
  return (
    <div className="max-w-content mx-auto px-4 py-10" data-testid="already-completed-screen">
      <div className="academic-card p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-main">{EXPERIMENT_CONFIG.alreadyCompleted.title}</h1>
        <p className="text-sm text-secondary">{EXPERIMENT_CONFIG.alreadyCompleted.message}</p>
        {code && code !== 'completed' && (
          <p className="text-xs font-mono text-main">Participant Confirmation: <strong>{code}</strong></p>
        )}
        <div className="pt-4 border-t border-border space-y-3">
          <p className="text-xs text-secondary">{EXPERIMENT_CONFIG.completion.newSessionNote}</p>
          <button
            type="button"
            onClick={onStartNew}
            className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold border border-border bg-white hover:bg-slate-50 text-main"
            data-testid="start-new-session-button"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {EXPERIMENT_CONFIG.completion.newSessionButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExperimentRouter() {
  const {
    currentStage,
    loading,
    error,
    setError,
    connectionError,
    retryConnection,
    alreadyCompletedCode,
    startNewSession,
  } = useExperiment();

  if (alreadyCompletedCode) {
    return <AlreadyCompletedScreen code={alreadyCompletedCode} onStartNew={startNewSession} />;
  }

  if (connectionError) {
    return <ConnectionErrorScreen onRetry={retryConnection} loading={loading} />;
  }

  if (loading && !currentStage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-secondary space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Loading experiment session...</p>
      </div>
    );
  }

  const renderCurrentPage = () => {
    switch (currentStage) {
      case STAGES.PAGE_1_CONSENT:
        return <Page1InstructionsConsent />;
      case STAGES.PAGE_2_AUDIO_1:
        return <Page2Audio1 />;
      case STAGES.PAGE_3_QUESTIONS_1:
        return <Page3Questions1 />;
      case STAGES.PAGE_4_AUDIO_2:
        return <Page4Audio2 />;
      case STAGES.PAGE_5_QUESTIONS_2:
      case STAGES.SUBMITTED:
        return <Page5Questions2 />;
      default:
        return <Page1InstructionsConsent />;
    }
  };

  return (
    <div className="w-full">
      {/* Global Error Banner */}
      {error && (
        <div className="max-w-content mx-auto px-4 mt-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-red-800 text-sm">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-semibold text-red-700 hover:text-red-900 underline ml-4"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Single-Column Content Area */}
      <main className="max-w-content mx-auto px-4 py-8 sm:py-10">
        {renderCurrentPage()}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ExperimentProvider>
      <div className="min-h-screen bg-background text-main flex flex-col antialiased">
        <Header />
        <div className="flex-1">
          <ExperimentRouter />
        </div>
      </div>
    </ExperimentProvider>
  );
}
