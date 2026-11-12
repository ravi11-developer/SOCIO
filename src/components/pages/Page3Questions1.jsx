import React from 'react';
import { EXPERIMENT_CONFIG } from '../../config/experiment';
import { useExperiment } from '../../context/ExperimentContext';
import QuestionList from '../questions/QuestionList';

export default function Page3Questions1() {
  const { advanceFromQuestions1, loading } = useExperiment();

  return (
    <div className="w-full">
      <QuestionList
        recordingNumber={1}
        title={EXPERIMENT_CONFIG.questionnaireAudio1.title}
        description={EXPERIMENT_CONFIG.questionnaireAudio1.description}
        actionButtonLabel={EXPERIMENT_CONFIG.questionnaireAudio1.continueButtonLabel}
        onSubmitAction={advanceFromQuestions1}
        isLoading={loading}
      />
    </div>
  );
}
