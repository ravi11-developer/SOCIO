import React from 'react';
import { EXPERIMENT_CONFIG } from '../../config/experiment';
import { useExperiment } from '../../context/ExperimentContext';
import QuestionList from '../questions/QuestionList';

export default function Page3Questions1() {
  const { advanceFromQuestions1, loading } = useExperiment();

  return (
    <div className="w-full">
      <QuestionList
        title={EXPERIMENT_CONFIG.questionsAudio1.title}
        description={EXPERIMENT_CONFIG.questionsAudio1.description}
        questions={EXPERIMENT_CONFIG.questionsAudio1.questions}
        actionButtonLabel={EXPERIMENT_CONFIG.questionsAudio1.continueButtonLabel}
        onSubmitAction={advanceFromQuestions1}
        isLoading={loading}
      />
    </div>
  );
}
