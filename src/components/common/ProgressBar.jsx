import React from 'react';
import { useExperiment } from '../../context/ExperimentContext';

export default function ProgressBar() {
  const { progress, pageNumber } = useExperiment();

  return (
    <div className="w-full bg-card border-b border-border py-3 px-4 shadow-sm">
      <div className="max-w-content mx-auto">
        <div className="flex justify-between items-center mb-1.5 text-xs font-medium text-secondary">
          <span>Stage {pageNumber} of 5</span>
          <span>{progress}% Completed</span>
        </div>
        
        {/* Progress Track */}
        <div 
          className="w-full bg-slate-200 h-2 rounded-full overflow-hidden" 
          role="progressbar" 
          aria-valuenow={progress} 
          aria-valuemin="0" 
          aria-valuemax="100"
          aria-label={`Experiment progress: ${progress}%`}
        >
          <div
            className="bg-primary h-full rounded-full progress-fill transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
