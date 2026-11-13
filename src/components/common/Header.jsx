import React from 'react';
import { EXPERIMENT_CONFIG } from '../../config/experiment';
import { useExperiment } from '../../context/ExperimentContext';
import { CheckCircle2, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

export default function Header() {
  const { participantId, saveStatus, currentStage, isSubmitted } = useExperiment();

  return (
    <header className="border-b border-border bg-card shadow-sm sticky top-0 z-30">
      <div className="max-w-content mx-auto px-4 py-3 flex items-center justify-between">
        {/* Title / Research Branding */}
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="font-semibold text-main text-sm sm:text-base tracking-tight truncate max-w-[200px] sm:max-w-md">
            {EXPERIMENT_CONFIG.title}
          </span>
        </div>

        {/* Status Indicators & Anonymous Participant Badge */}
        <div className="flex items-center space-x-3 text-xs sm:text-sm">
          {/* Autosave Status (Only shown on question pages 3 & 5) */}
          {(currentStage === 'questions_1_pending' || currentStage === 'questions_2_pending') && !isSubmitted && (
            <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-slate-100 text-secondary text-xs">
              {saveStatus === 'saving' && (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Saved</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden sm:inline">Not saved yet, will retry</span>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </header>
  );
}
