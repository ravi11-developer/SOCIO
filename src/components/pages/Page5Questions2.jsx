import React from 'react';
import { EXPERIMENT_CONFIG } from '../../config/experiment';
import { useExperiment } from '../../context/ExperimentContext';
import QuestionList from '../questions/QuestionList';
import { CheckCircle2, Award, ShieldCheck, Lock } from 'lucide-react';

export default function Page5Questions2() {
  const { isSubmitted, participantId, submitFinalExperiment, loading } = useExperiment();

  // If submitted, show the Completion Screen (part of Page 5, not a 6th page)
  if (isSubmitted) {
    return (
      <div className="w-full space-y-6" data-testid="completion-screen">
        <div className="academic-card p-8 sm:p-12 bg-card border border-border rounded-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Experiment Completed
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-main pt-2">
              {EXPERIMENT_CONFIG.completion.title}
            </h1>
          </div>

          <div className="max-w-md mx-auto text-sm sm:text-base text-secondary leading-relaxed bg-slate-50 p-6 rounded-lg border border-slate-200">
            {EXPERIMENT_CONFIG.completion.message}
          </div>

          <div className="pt-4 border-t border-border flex flex-col items-center justify-center space-y-2 text-xs text-secondary">
            <div className="flex items-center space-x-1.5 text-main font-mono bg-slate-100 px-3 py-1.5 rounded border border-border">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Participant Confirmation: <strong>{participantId}</strong></span>
            </div>
            <p>Your responses have been securely encrypted, saved, and locked.</p>
            <p className="text-slate-400">You may now safely close this browser window.</p>
          </div>
        </div>
      </div>
    );
  }

  // Active Questionnaire for Audio 2
  return (
    <div className="w-full">
      <QuestionList
        title={EXPERIMENT_CONFIG.questionsAudio2.title}
        description={EXPERIMENT_CONFIG.questionsAudio2.description}
        questions={EXPERIMENT_CONFIG.questionsAudio2.questions}
        actionButtonLabel={EXPERIMENT_CONFIG.questionsAudio2.submitButtonLabel}
        onSubmitAction={submitFinalExperiment}
        isLoading={loading}
      />
    </div>
  );
}
