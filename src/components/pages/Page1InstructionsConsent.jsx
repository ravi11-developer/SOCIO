import React, { useState } from 'react';
import { EXPERIMENT_CONFIG } from '../../config/experiment';
import { useExperiment } from '../../context/ExperimentContext';
import { Info, Headphones, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Page1InstructionsConsent() {
  const {
    submitConsentAndDemographics,
    loading,
    gender: savedGender,
    ethnicity: savedEthnicity,
    firstLanguage: savedFirstLang,
    secondLanguage: savedSecondLang,
    hindiProficiency: savedHindiProf,
  } = useExperiment();

  const [gender, setGender] = useState(savedGender || '');
  const [ethnicity, setEthnicity] = useState(savedEthnicity || '');
  const [firstLanguage, setFirstLanguage] = useState(savedFirstLang || '');
  const [secondLanguage, setSecondLanguage] = useState(savedSecondLang || '');
  const [hindiProficiency, setHindiProficiency] = useState(savedHindiProf || null);
  const [errorMsg, setErrorMsg] = useState('');

  const isFormValid =
    gender &&
    ethnicity &&
    firstLanguage.trim().length > 0 &&
    secondLanguage.trim().length > 0 &&
    hindiProficiency !== null;

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
    if (!firstLanguage.trim()) {
      setErrorMsg('Please enter your first language (mother tongue).');
      return;
    }
    if (!secondLanguage.trim()) {
      setErrorMsg('Please enter your second language.');
      return;
    }
    if (!hindiProficiency) {
      setErrorMsg('Please rate your proficiency in spoken Hindi on the 1-6 scale.');
      return;
    }

    try {
      await submitConsentAndDemographics(
        gender,
        ethnicity,
        firstLanguage,
        secondLanguage,
        hindiProficiency,
        true
      );
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit. Please try again.');
    }
  };

  return (
    <div className="w-full space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section A: Instructions */}
        <div className="academic-card p-6 sm:p-8 bg-card border border-border rounded-xl">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center">
              <Headphones className="w-4 h-4 mr-1.5" />
              Research Experiment Overview
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-main mt-2">
              {EXPERIMENT_CONFIG.instructionHeadline}
            </h1>
            <p className="text-sm text-secondary mt-2 leading-relaxed">
              {EXPERIMENT_CONFIG.description}
            </p>
          </div>
        </div>

        {/* Section B: Linguistic & Demographic Information */}
        <div className="academic-card p-6 sm:p-8 bg-card border border-border rounded-xl space-y-6">
          <div className="border-b border-border pb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Section B &bull; Demographic & Language Background
            </span>
            <h2 className="text-lg font-bold text-main mt-1">
              Background Information
            </h2>
            <p className="text-xs text-secondary mt-1">
              All responses are confidential and anonymous. No personal identifying information is collected.
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

            {/* First Language (L1 / Mother Tongue) */}
            <div>
              <label 
                htmlFor="first-language-input" 
                className="block text-sm font-semibold text-main mb-2"
              >
                First Language (Mother Tongue / L1) <span className="text-red-500">*</span>
              </label>
              <input
                id="first-language-input"
                type="text"
                value={firstLanguage}
                onChange={(e) => setFirstLanguage(e.target.value)}
                placeholder={EXPERIMENT_CONFIG.demographics.firstLanguage.placeholder}
                className="w-full p-3 rounded-lg border border-border bg-white text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
            </div>

            {/* Second Language (L2) */}
            <div>
              <label 
                htmlFor="second-language-input" 
                className="block text-sm font-semibold text-main mb-2"
              >
                Second Language (L2) <span className="text-red-500">*</span>
              </label>
              <input
                id="second-language-input"
                type="text"
                value={secondLanguage}
                onChange={(e) => setSecondLanguage(e.target.value)}
                placeholder={EXPERIMENT_CONFIG.demographics.secondLanguage.placeholder}
                className="w-full p-3 rounded-lg border border-border bg-white text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                required
              />
            </div>
          </div>

          {/* Hindi Proficiency Rating (1 to 6 Scale) */}
          <div className="pt-2 border-t border-border">
            <label className="block text-sm font-semibold text-main mb-1">
              Rate your proficiency in spoken Hindi <span className="text-red-500">*</span>
            </label>
            <div className="mb-3 p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed flex items-start space-x-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                <strong>Guidance:</strong> If you are a native speaker or are proficient in spoken Hindi then consider rating yourselves <strong>4, 5 or 6</strong>.
              </span>
            </div>

            {/* 6-Choice Interactive Pill Buttons */}
            <div className="grid grid-cols-6 gap-2 sm:gap-3" role="radiogroup" aria-label="Hindi Proficiency Scale 1 to 6">
              {[1, 2, 3, 4, 5, 6].map((score) => {
                const isSelected = hindiProficiency === score;
                return (
                  <button
                    key={score}
                    type="button"
                    onClick={() => setHindiProficiency(score)}
                    className={`py-3 px-2 sm:px-4 rounded-lg font-bold text-sm sm:text-base transition-all border text-center focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                      isSelected
                        ? 'bg-primary border-primary text-white shadow-sm ring-2 ring-primary/20 scale-102'
                        : 'bg-white border-border text-main hover:bg-slate-100 hover:border-slate-300'
                    }`}
                    aria-checked={isSelected}
                    role="radio"
                    data-testid={`hindi-prof-${score}`}
                  >
                    <span>{score}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between text-xs text-secondary mt-1.5 px-1 font-medium">
              <span>1 - Not proficient</span>
              <span>6 - Very proficient</span>
            </div>
          </div>
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
            disabled={loading || !isFormValid}
            className={`w-full sm:w-auto px-10 py-3.5 rounded-lg text-sm font-semibold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              loading || !isFormValid
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
