import React, { useState } from 'react';
import { useExperiment } from '../../context/ExperimentContext';
import { EXPERIMENT_CONFIG } from '../../config/experiment';
import { CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react';

export default function QuestionList({
  title,
  description,
  recordingNumber = 1,
  actionButtonLabel = 'Continue',
  onSubmitAction,
  isLoading = false,
}) {
  const { responses, updateResponse, flushResponseSave } = useExperiment();
  const [validationErrors, setValidationErrors] = useState({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const prefix = `q${recordingNumber}_`;
  const traits = EXPERIMENT_CONFIG.traits;
  const commentKey = `${prefix}comment`;

  // The comment box is optional; this only drives the "Completed" badge.
  const isCommentAnswered = responses[commentKey] && responses[commentKey].trim().length > 0;

  const handleRatingSelect = (traitNumber, score) => {
    const key = `${prefix}${traitNumber}`;
    updateResponse(key, score);
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleCommentChange = (value) => {
    updateResponse(commentKey, value);
    if (validationErrors[commentKey] && value.trim().length > 0) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[commentKey];
        return next;
      });
    }
  };

  const handleCommentBlur = (value) => {
    flushResponseSave(commentKey, value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setAttemptedSubmit(true);

    const errors = {};
    traits.forEach((t) => {
      const key = `${prefix}${t.number}`;
      if (responses[key] === undefined || responses[key] === null || responses[key] === '') {
        errors[key] = `Please rate the speaker's ${t.name.toLowerCase()} (1 to 6).`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      const firstErrorId = Object.keys(errors)[0];
      const el = document.getElementById(`item-card-${firstErrorId}`);
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
        <div className="pb-4 border-b border-border">
          <h2 className="text-xl font-bold text-main">{title}</h2>
          {description && (
            <p className="text-sm text-secondary mt-1">{description}</p>
          )}
        </div>

        {/* Validation Warning Alert */}
        {attemptedSubmit && Object.keys(validationErrors).length > 0 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3 text-red-800 text-sm">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Incomplete Evaluation</p>
              <p className="text-xs text-red-700 mt-1">
                Please complete all remaining trait ratings before continuing.
              </p>
            </div>
          </div>
        )}

        {/* Part A: 12 Trait Rating Scales (1 to 6) */}
        <div className="mt-6 space-y-5">
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-lg flex justify-between items-center text-xs text-secondary font-medium">
            <span>Rate each trait on a scale from <strong>1 to 6</strong>:</span>
            <span><strong>1</strong> = Least &bull; <strong>6</strong> = Most</span>
          </div>

          <div className="divide-y divide-border">
            {traits.map((trait) => {
              const itemKey = `${prefix}${trait.number}`;
              const currentRating = responses[itemKey] !== undefined ? Number(responses[itemKey]) : null;
              const hasError = Boolean(validationErrors[itemKey]);

              return (
                <div
                  key={itemKey}
                  id={`item-card-${itemKey}`}
                  className={`py-5 transition-colors ${
                    hasError ? 'bg-red-50/50 p-4 rounded-lg my-2' : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-bold text-base text-main inline">
                        {trait.name}
                      </h3>
                      <span className="text-red-500 ml-1" title="Required">*</span>
                      <p className="text-xs text-secondary mt-0.5">{trait.prompt}</p>
                    </div>

                    {currentRating !== null && (
                      <span className="text-xs text-emerald-600 font-semibold flex items-center shrink-0 self-start sm:self-auto">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Rated: {currentRating} / 6
                      </span>
                    )}
                  </div>

                  {/* 1 to 6 Rating Scale Pill Buttons */}
                  <div 
                    className="grid grid-cols-6 gap-2 sm:gap-3 max-w-lg"
                    role="radiogroup"
                    aria-label={`Rate ${trait.name} from 1 (least) to 6 (most)`}
                  >
                    {[1, 2, 3, 4, 5, 6].map((score) => {
                      const isSelected = currentRating === score;
                      return (
                        <button
                          key={score}
                          type="button"
                          onClick={() => handleRatingSelect(trait.number, score)}
                          className={`py-2.5 sm:py-3 rounded-lg font-bold text-sm sm:text-base transition-all border text-center focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                            isSelected
                              ? 'bg-primary border-primary text-white shadow-sm ring-2 ring-primary/20 scale-102'
                              : 'bg-white border-border text-main hover:bg-slate-100 hover:border-slate-300'
                          }`}
                          aria-checked={isSelected}
                          role="radio"
                          data-testid={`rating-${trait.number}-${score}`}
                        >
                          {score}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex justify-between text-[11px] text-secondary mt-1 max-w-lg px-1">
                    <span>1 (Least)</span>
                    <span>6 (Most)</span>
                  </div>

                  {hasError && (
                    <p className="text-xs text-red-600 mt-2 font-medium flex items-center">
                      <AlertCircle className="w-3.5 h-3.5 mr-1 shrink-0" />
                      {validationErrors[itemKey]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Part B: Candid Open Opinion Comment Box */}
        <div 
          id={`item-card-${commentKey}`}
          className={`mt-8 pt-6 border-t-2 border-slate-200 transition-colors ${
            validationErrors[commentKey] ? 'bg-red-50/50 p-4 rounded-lg' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <span className="text-xs font-bold text-primary mr-2 uppercase tracking-wide flex items-center">
                <MessageSquare className="w-3.5 h-3.5 mr-1" />
                Open Feedback
              </span>
              <label
                htmlFor={`comment-input-${recordingNumber}`}
                className="font-bold text-base text-main block mt-1"
              >
                {EXPERIMENT_CONFIG.openOpinionPrompt.prompt}
                <span className="text-secondary font-normal text-xs ml-1">(optional)</span>
              </label>
              <p className="text-xs text-secondary mt-0.5">
                Share any impressions, thoughts on background, accent, demeanor, or trustworthiness.
              </p>
            </div>

            {isCommentAnswered && (
              <span className="text-xs text-emerald-600 font-semibold flex items-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Completed
              </span>
            )}
          </div>

          <textarea
            id={`comment-input-${recordingNumber}`}
            rows={4}
            value={responses[commentKey] || ''}
            onChange={(e) => handleCommentChange(e.target.value)}
            onBlur={(e) => handleCommentBlur(e.target.value)}
            placeholder={EXPERIMENT_CONFIG.openOpinionPrompt.placeholder}
            className={`w-full p-3.5 text-sm sm:text-base rounded-lg border transition-all resize-y focus:outline-none focus:ring-2 ${
              validationErrors[commentKey]
                ? 'border-red-400 bg-white focus:ring-red-300'
                : 'border-border bg-slate-50/50 focus:bg-white focus:border-primary focus:ring-primary/20'
            }`}
            aria-invalid={Boolean(validationErrors[commentKey])}
          />

          {validationErrors[commentKey] && (
            <p className="text-xs text-red-600 mt-1.5 font-medium flex items-center">
              <AlertCircle className="w-3.5 h-3.5 mr-1 shrink-0" />
              {validationErrors[commentKey]}
            </p>
          )}
        </div>
      </div>

      {/* Action / Next Button */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
        <p className="text-xs text-secondary italic text-center sm:text-left">
          Ratings and opinions are autosaved automatically.
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
