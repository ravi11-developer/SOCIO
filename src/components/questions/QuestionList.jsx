import React, { useState } from 'react';
import { useExperiment } from '../../context/ExperimentContext';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function QuestionList({
  title,
  description,
  questions = [],
  actionButtonLabel = 'Continue',
  onSubmitAction,
  isLoading = false,
}) {
  const { responses, updateResponse, flushResponseSave } = useExperiment();
  const [validationErrors, setValidationErrors] = useState({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Calculate answered count
  const answeredCount = questions.filter(
    (q) => responses[q.id] && responses[q.id].trim().length > 0
  ).length;

  const totalQuestions = questions.length;
  const isAllAnswered = answeredCount === totalQuestions;

  const handleTextChange = (questionId, value) => {
    updateResponse(questionId, value);
    if (validationErrors[questionId] && value.trim().length > 0) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  };

  const handleBlur = (questionId, value) => {
    flushResponseSave(questionId, value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setAttemptedSubmit(true);

    const errors = {};
    questions.forEach((q) => {
      if (q.required && (!responses[q.id] || responses[q.id].trim() === '')) {
        errors[q.id] = 'This question is required.';
      }
    });

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      // Scroll to first invalid question
      const firstErrorId = Object.keys(errors)[0];
      const el = document.getElementById(`question-card-${firstErrorId}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setValidationErrors({});
    if (onSubmitAction) {
      onSubmitAction();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      {/* Questionnaire Header Card */}
      <div className="academic-card p-6 sm:p-8 bg-card border border-border rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-main">{title}</h2>
            {description && (
              <p className="text-sm text-secondary mt-1">{description}</p>
            )}
          </div>

          {/* Answered Progress Pill */}
          <div className="flex items-center space-x-2 self-start sm:self-center px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200">
            {isAllAnswered ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            )}
            <span className="text-xs font-semibold text-main">
              {answeredCount} of {totalQuestions} answered
            </span>
          </div>
        </div>

        {/* Validation Warning Alert */}
        {attemptedSubmit && Object.keys(validationErrors).length > 0 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3 text-red-800 text-sm">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Incomplete Questionnaire</p>
              <p className="text-xs text-red-700 mt-1">
                Please provide an answer for all {Object.keys(validationErrors).length} remaining required questions.
              </p>
            </div>
          </div>
        )}

        {/* Questions List */}
        <div className="divide-y divide-border mt-2">
          {questions.map((q) => {
            const hasError = Boolean(validationErrors[q.id]);
            const currentAnswer = responses[q.id] || '';

            return (
              <div
                key={q.id}
                id={`question-card-${q.id}`}
                className={`py-6 first:pt-4 last:pb-2 transition-colors ${
                  hasError ? 'bg-red-50/50 p-4 rounded-lg my-2' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <label
                    htmlFor={`input-${q.id}`}
                    className="font-semibold text-sm sm:text-base text-main leading-snug"
                  >
                    <span className="text-primary font-bold mr-1.5">
                      Q{q.number}.
                    </span>
                    {q.text}
                    {q.required && (
                      <span className="text-red-500 ml-1" title="Required">
                        *
                      </span>
                    )}
                  </label>
                  {currentAnswer.trim().length > 0 && (
                    <span className="text-xs text-emerald-600 font-medium flex items-center shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Answered
                    </span>
                  )}
                </div>

                {/* Multiline Textarea */}
                <textarea
                  id={`input-${q.id}`}
                  rows={4}
                  value={currentAnswer}
                  onChange={(e) => handleTextChange(q.id, e.target.value)}
                  onBlur={(e) => handleBlur(q.id, e.target.value)}
                  placeholder={q.placeholder || 'Write your answer here...'}
                  className={`w-full p-3.5 text-sm sm:text-base rounded-lg border transition-all resize-y focus:outline-none focus:ring-2 ${
                    hasError
                      ? 'border-red-400 bg-white focus:ring-red-300'
                      : 'border-border bg-slate-50/50 focus:bg-white focus:border-primary focus:ring-primary/20'
                  }`}
                  aria-invalid={hasError}
                  aria-describedby={hasError ? `error-${q.id}` : undefined}
                />

                {/* Error message */}
                {hasError && (
                  <p
                    id={`error-${q.id}`}
                    className="text-xs text-red-600 mt-1.5 font-medium flex items-center"
                  >
                    <AlertCircle className="w-3.5 h-3.5 mr-1" />
                    {validationErrors[q.id]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action / Next Button */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
        <p className="text-xs text-secondary italic text-center sm:text-left">
          Responses are autosaved continuously.
        </p>
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full sm:w-auto px-8 py-3.5 rounded-lg text-sm font-semibold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            isLoading
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-primary hover:bg-primary-hover text-white cursor-pointer active:scale-98'
          }`}
          data-testid="question-submit-button"
        >
          {isLoading ? 'Saving responses...' : actionButtonLabel}
        </button>
      </div>
    </form>
  );
}
