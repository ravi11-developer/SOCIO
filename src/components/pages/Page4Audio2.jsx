import React from 'react';
import { EXPERIMENT_CONFIG } from '../../config/experiment';
import { useExperiment } from '../../context/ExperimentContext';
import RestrictedAudioPlayer from '../audio/RestrictedAudioPlayer';

export default function Page4Audio2() {
  const { advanceFromAudio, assignedAudio2 } = useExperiment();

  return (
    <div className="w-full">
      <RestrictedAudioPlayer
        audioNumber={2}
        title={assignedAudio2?.title || "Audio Recording 2"}
        description={assignedAudio2?.description}
        storagePath={assignedAudio2?.storagePath}
        fallbackSampleUrl={assignedAudio2?.fallbackSampleUrl}
        completionNotice={EXPERIMENT_CONFIG.audioPlayerTexts.completionNotice}
        continueButtonLabel={EXPERIMENT_CONFIG.audioPlayerTexts.continueButtonLabel}
        onContinue={() => advanceFromAudio(2)}
      />
    </div>
  );
}
