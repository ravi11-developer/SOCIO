import React, { useState } from 'react';
import { EXPERIMENT_CONFIG } from '../../config/experiment';
import { useExperiment } from '../../context/ExperimentContext';
import { Info, Headphones, AlertCircle, ShieldCheck } from 'lucide-react';

const OTHER = '__other__';
const NONE = 'None';
const MAX_STORED_LENGTH = 128; // matches the database column

const demo = EXPERIMENT_CONFIG.demographics;
const LANGUAGES = demo.languageOptions;
const OTHER_MAX = demo.otherLanguageMaxLength;

/** Turns a stored first-language value back into form state. */
function parseFirstLanguage(saved) {
  if (!saved) return { choice: '', other: '' };
  if (LANGUAGES.includes(saved)) return { choice: saved, other: '' };
  return { choice: OTHER, other: saved.replace(/^Other:\s*/, '') };
}

/** Turns a stored second-language value ("Hindi; Telugu; Other: X" or "None") back into form state. */
function parseSecondLanguages(saved) {
  if (!saved) return { selected: [], none: false, otherChecked: false, other: '' };
  if (saved === NONE) return { selected: [], none: true, otherChecked: false, other: '' };
  const parts = saved.split(';').map((p) => p.trim()).filter(Boolean);
  const selected = parts.filter((p) => LANGUAGES.includes(p));
  const otherPart = parts.find((p) => p.startsWith('Other:'));
  return {
    selected,
    none: false,
    otherChecked: Boolean(otherPart),
    other: otherPart ? otherPart.replace(/^Other:\s*/, '') : '',
  };
}

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

  const initialL1 = parseFirstLanguage(savedFirstLang);
  const initialL2 = parseSecondLanguages(savedSecondLang);

  const [gender, setGender] = useState(savedGender || '');
  const [ethnicity, setEthnicity] = useState(savedEthnicity || '');
  const [firstChoice, setFirstChoice] = useState(initialL1.choice);
  const [firstOther, setFirstOther] = useState(initialL1.other);
  const [secondSelected, setSecondSelected] = useState(initialL2.selected);
  const [secondNone, setSecondNone] = useState(initialL2.none);
  const [secondOtherChecked, setSecondOtherChecked] = useState(initialL2.otherChecked);
  const [secondOther, setSecondOther] = useState(initialL2.other);
  const [hindiProficiency, setHindiProficiency] = useState(savedHindiProf || null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Values exactly as they will be stored.
  const firstLanguageValue =
    firstChoice === OTHER ? (firstOther.trim() ? `Other: ${firstOther.trim()}` : '') : firstChoice;

  const secondLanguageValue = secondNone
    ? NONE
    : [
        ...LANGUAGES.filter((l) => secondSelected.includes(l)),
        ...(secondOtherChecked && secondOther.trim() ? [`Other: ${secondOther.trim()}`] : []),
      ].join('; ');

  const secondTooLong = secondLanguageValue.length > MAX_STORED_LENGTH;
  const secondOtherMissing = secondOtherChecked && !secondOther.trim();

  const isFormValid =
    Boolean(gender) &&
    Boolean(ethnicity) &&
    firstLanguageValue.length > 0 &&
    secondLanguageValue.length > 0 &&
    !secondTooLong &&
    !secondOtherMissing &&
    hindiProficiency !== null &&
    consentChecked;

  const toggleSecondLanguage = (lang) => {
    setSecondNone(false);
    setSecondSelected((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  const toggleSecondNone = () => {
    setSecondNone((prev) => {
      const next = !prev;
      if (next) {
        setSecondSelected([]);
        setSecondOtherChecked(false);
        setSecondOther('');
      }
      return next;
    });
  };

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
    if (!firstLanguageValue) {
      setErrorMsg('Please select your first language (mother tongue).');
      return;
    }
    if (secondOtherMissing) {
      setErrorMsg('Please type the other language you speak, or untick "Other".');
      return;
    }
    if (!secondLanguageValue) {
      setErrorMsg('Please select your second language(s), or choose "None".');
      return;
    }
    if (secondTooLong) {
      setErrorMsg('Please select fewer second languages (the list is too long to store).');
      return;
    }
    if (!hindiProficiency) {
      setErrorMsg('Please rate your proficiency in spoken Hindi on the 1-6 scale.');
      return;
    }
    if (!consentChecked) {
      setErrorMsg('Please read the consent statement and tick the box to take part.');
      return;
    }

    try {
      await submitConsentAndDemographics(
        gender,
        ethnicity,
        firstLanguageValue,
        secondLanguageValue,
        hindiProficiency,
        consentChecked
      );
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit. Please try again.');
    }
  };

  const inputCls =
    'w-full p-3 rounded-lg border border-border bg-white text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';

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
            {EXPERIMENT_CONFIG.participantInstructions?.length > 0 && (
              <div className="mt-5">
                <h2 className="text-sm font-semibold text-main mb-2">Instructions</h2>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-secondary" data-testid="participant-instructions">
                  {EXPERIMENT_CONFIG.participantInstructions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
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
              <label htmlFor="gender-select" className="block text-sm font-semibold text-main mb-2">
                Gender <span className="text-red-500">*</span>
              </label>
              <select
                id="gender-select"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={inputCls}
                required
              >
                <option value="" disabled>-- Select Gender --</option>
                {demo.gender.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Ethnicity Selection */}
            <div>
              <label htmlFor="ethnicity-select" className="block text-sm font-semibold text-main mb-2">
                Ethnicity <span className="text-red-500">*</span>
              </label>
              <select
                id="ethnicity-select"
                value={ethnicity}
                onChange={(e) => setEthnicity(e.target.value)}
                className={inputCls}
                required
              >
                <option value="" disabled>-- Select Ethnicity --</option>
                {demo.ethnicity.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* First Language (L1 / Mother Tongue) */}
            <div className="sm:col-span-2">
              <label htmlFor="first-language-select" className="block text-sm font-semibold text-main mb-2">
                {demo.firstLanguage.label} <span className="text-red-500">*</span>
              </label>
              <select
                id="first-language-select"
                value={firstChoice}
                onChange={(e) => setFirstChoice(e.target.value)}
                className={inputCls}
                required
              >
                <option value="" disabled>{demo.firstLanguage.selectPlaceholder}</option>
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
                <option value={OTHER}>{demo.firstLanguage.otherLabel}</option>
              </select>
              {firstChoice === OTHER && (
                <input
                  type="text"
                  aria-label="Other first language"
                  value={firstOther}
                  maxLength={OTHER_MAX}
                  onChange={(e) => setFirstOther(e.target.value)}
                  placeholder={demo.firstLanguage.otherPlaceholder}
                  className={`${inputCls} mt-2`}
                  data-testid="first-language-other"
                />
              )}
            </div>

            {/* Second Language(s) (L2) */}
            <fieldset className="sm:col-span-2" aria-describedby="second-language-help">
              <legend className="block text-sm font-semibold text-main mb-1">
                {demo.secondLanguage.label} <span className="text-red-500">*</span>
              </legend>
              <p id="second-language-help" className="text-xs text-secondary mb-3">
                {demo.secondLanguage.helperNote}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 text-sm text-main">
                  <input
                    type="checkbox"
                    checked={secondNone}
                    onChange={toggleSecondNone}
                    className="w-4 h-4 accent-primary"
                    data-testid="second-language-none"
                  />
                  {demo.secondLanguage.noneLabel}
                </label>
                {LANGUAGES.map((lang) => (
                  <label key={lang} className="flex items-center gap-2 text-sm text-main">
                    <input
                      type="checkbox"
                      checked={secondSelected.includes(lang)}
                      onChange={() => toggleSecondLanguage(lang)}
                      className="w-4 h-4 accent-primary"
                      data-testid={`second-language-${lang}`}
                    />
                    {lang}
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm text-main">
                  <input
                    type="checkbox"
                    checked={secondOtherChecked}
                    onChange={() => {
                      setSecondNone(false);
                      setSecondOtherChecked((prev) => !prev);
                    }}
                    className="w-4 h-4 accent-primary"
                    data-testid="second-language-other-checkbox"
                  />
                  {demo.secondLanguage.otherLabel}
                </label>
              </div>
              {secondOtherChecked && (
                <input
                  type="text"
                  aria-label="Other second language"
                  value={secondOther}
                  maxLength={OTHER_MAX}
                  onChange={(e) => setSecondOther(e.target.value)}
                  placeholder={demo.secondLanguage.otherPlaceholder}
                  className={`${inputCls} mt-3`}
                  data-testid="second-language-other"
                />
              )}
              {secondTooLong && (
                <p className="text-xs text-red-600 mt-2">Please select fewer languages.</p>
              )}
            </fieldset>
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

        {/* Section C: Informed Consent */}
        <div className="academic-card p-6 sm:p-8 bg-card border border-border rounded-xl space-y-4" data-testid="consent-section">
          <div className="border-b border-border pb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center">
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              Section C &bull; {EXPERIMENT_CONFIG.consent.title}
            </span>
          </div>
          <p className="text-sm text-main leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-4" data-testid="consent-statement">
            {EXPERIMENT_CONFIG.consent.statement}
          </p>
          <label htmlFor="consent-checkbox" className="flex items-start gap-3 text-sm text-main cursor-pointer">
            <input
              id="consent-checkbox"
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="w-5 h-5 mt-0.5 accent-primary shrink-0"
              data-testid="consent-checkbox"
              required
            />
            <span>
              {EXPERIMENT_CONFIG.consent.checkboxLabel} <span className="text-red-500">*</span>
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
