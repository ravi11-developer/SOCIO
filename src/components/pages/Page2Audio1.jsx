import React from 'react';
import { EXPERIMENT_CONFIG } from '../../config/experiment';
import { useExperiment } from '../../context/ExperimentContext';
import RestrictedAudioPlayer from '../audio/RestrictedAudioPlayer';

export default function Page2Audio1() {
  const { advanceFromAudio, assignedAudio1 } = useExperiment();

  return (
    <div className="w-full">
      <RestrictedAudioPlayer
        audioNumber={1}
        title={assignedAudio1?.title || "Audio Recording 1"}
        description={assignedAudio1?.description}
        storagePath={assignedAudio1?.storagePath}
        fallbackSampleUrl={assignedAudio1?.fallbackSampleUrl}
        completionNotice={EXPERIMENT_CONFIG.audioPlayerTexts.completionNotice}
        continueButtonLabel={EXPERIMENT_CONFIG.audioPlayerTexts.continueButtonLabel}
        onContinue={() => advanceFromAudio(1)}
      />
    </div>
  );
}
