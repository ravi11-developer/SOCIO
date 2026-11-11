import React from 'react';
import { ExperimentProvider, useExperiment, STAGES } from './context/ExperimentContext';
import Header from './components/common/Header';
import ProgressBar from './components/common/ProgressBar';
import Page1InstructionsConsent from './components/pages/Page1InstructionsConsent';
import Page2Audio1 from './components/pages/Page2Audio1';
import Page3Questions1 from './components/pages/Page3Questions1';
import Page4Audio2 from './components/pages/Page4Audio2';
import Page5Questions2 from './components/pages/Page5Questions2';
import { AlertCircle, Loader2 } from 'lucide-react';

function ExperimentRouter() {
  const { currentStage, loading, error, setError } = useExperiment();

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
        <ProgressBar />
        <div className="flex-1">
          <ExperimentRouter />
        </div>
        
        {/* Footer */}
        <footer className="border-t border-border py-4 text-center text-xs text-secondary bg-card/50">
          <div className="max-w-content mx-auto px-4">
            <p>Academic Research Questionnaire &bull; All participant responses are confidential and anonymous.</p>
          </div>
        </footer>
      </div>
    </ExperimentProvider>
  );
}
