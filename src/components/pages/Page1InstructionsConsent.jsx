import React, { useState } from 'react';
import { EXPERIMENT_CONFIG } from '../../config/experiment';
import { useExperiment } from '../../context/ExperimentContext';
import { Clock, Info, CheckSquare, ShieldCheck, AlertCircle } from 'lucide-react';

export default function Page1InstructionsConsent() {
  const { submitConsentAndDemographics, loading } = useExperiment();

  const [gender, setGender] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!gender) {
      setErrorMsg('Please select your gender.');
      return;
    }
    if (!ethnicity) {
      setErrorMsg('Please select your ethnicity.');
      return;
    }
    if (!consentChecked) {
      setErrorMsg('You must provide informed consent to participate in this study.');
      return;
    }

    try {
      await submitConsentAndDemographics(gender, ethnicity, consentChecked);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit. Please try again.');
    }
  };

  return (
    <div className="w-full space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section A: Instructions */}
        <div className="academic-card p-6 sm:p-8 bg-card border border-border rounded-xl">
          <div className="border-b border-border pb-4 mb-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Section A &bull; Overview
            </span>
            <h1 className="text-2xl font-bold text-main mt-1">
              {EXPERIMENT_CONFIG.title}
            </h1>
            <p className="text-sm text-secondary mt-2 leading-relaxed">
              {EXPERIMENT_CONFIG.description}
            </p>
            {EXPERIMENT_CONFIG.estimatedTime && (
              <div className="flex items-center text-xs text-secondary mt-3">
                <Clock className="w-4 h-4 mr-1.5 text-primary" />
                <span>Estimated completion time: <strong>{EXPERIMENT_CONFIG.estimatedTime}</strong></span>
              </div>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-main flex items-center mb-3">
              <Info className="w-4 h-4 text-primary mr-2" />
              Participant Instructions
            </h3>
            <ul className="space-y-2 text-sm text-secondary leading-relaxed list-disc list-inside">
              {EXPERIMENT_CONFIG.participantInstructions.map((inst, idx) => (
                <li key={idx} className="pl-1">
                  <span className="text-main">{inst}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Section B: Demographics */}
        <div className="academic-card p-6 sm:p-8 bg-card border border-border rounded-xl">
          <div className="border-b border-border pb-3 mb-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Section B &bull; Demographic Information
            </span>
            <h2 className="text-lg font-bold text-main mt-1">
              Basic Demographics
            </h2>
            <p className="text-xs text-secondary mt-1">
              All responses are strictly anonymous. We do not collect your name, email, or other personal identifying details.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Gender Selection */}
            <div>
              <label 
                htmlFor="gender-select" 
                className="block text-sm font-semibold text-main mb-2"
              >
                Gender <span className="text-red-500">*</span>
              </label>
              <select
                id="gender-select"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full p-3 rounded-lg border border-border bg-white text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              >
                <option value="" disabled>-- Select Gender --</option>
                {EXPERIMENT_CONFIG.demographics.gender.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Ethnicity Selection */}
            <div>
              <label 
                htmlFor="ethnicity-select" 
                className="block text-sm font-semibold text-main mb-2"
              >
                Ethnicity <span className="text-red-500">*</span>
              </label>
              <select
                id="ethnicity-select"
                value={ethnicity}
                onChange={(e) => setEthnicity(e.target.value)}
                className="w-full p-3 rounded-lg border border-border bg-white text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              >
                <option value="" disabled>-- Select Ethnicity --</option>
                {EXPERIMENT_CONFIG.demographics.ethnicity.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section C: Consent */}
        <div className="academic-card p-6 sm:p-8 bg-card border border-border rounded-xl">
          <div className="border-b border-border pb-3 mb-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Section C &bull; Informed Consent
            </span>
            <h2 className="text-lg font-bold text-main mt-1">
              Consent Declaration
            </h2>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-secondary leading-relaxed mb-6 font-mono text-xs">
            {EXPERIMENT_CONFIG.consent.statement}
          </div>

          {/* Mandatory Checkbox */}
          <label 
            htmlFor="consent-checkbox"
            className="flex items-start space-x-3 cursor-pointer p-4 rounded-lg border border-border hover:bg-slate-50 transition-colors"
          >
            <input
              id="consent-checkbox"
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="w-5 h-5 mt-0.5 rounded border-border text-primary focus:ring-primary/30"
              required
            />
            <span className="text-sm font-medium text-main select-none leading-snug">
              {EXPERIMENT_CONFIG.consent.checkboxLabel}
            </span>
          </label>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-3 text-red-800 text-sm">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Start Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading || !consentChecked || !gender || !ethnicity}
            className={`w-full sm:w-auto px-10 py-3.5 rounded-lg text-sm font-semibold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              loading || !consentChecked || !gender || !ethnicity
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                : 'bg-primary hover:bg-primary-hover text-white cursor-pointer active:scale-98'
            }`}
            data-testid="start-experiment-button"
          >
            {loading ? 'Initializing...' : EXPERIMENT_CONFIG.consent.startButtonLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
