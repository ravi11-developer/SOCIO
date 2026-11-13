import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, AlertTriangle, Volume2, Loader2 } from 'lucide-react';
import { api, isLiveDatabase } from '../../services/api';
import { useExperiment } from '../../context/ExperimentContext';

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function RestrictedAudioPlayer({
  audioNumber,
  title,
  description,
  storagePath,
  fallbackSampleUrl,
  completionNotice = "Audio completed. You may now continue.",
  continueButtonLabel = "Continue to Questions",
  onContinue,
}) {
  const {
    notifyAudioStart,
    markAudioCompleted,
    recordAudioEvent,
    audioCompletionStatus,
    resetAudioCompletionStatus,
  } = useExperiment();
  const completionStatus = audioCompletionStatus?.[audioNumber] || 'idle';

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const audioRef = useRef(null);
  const [audioSrc, setAudioSrc] = useState(() => api.getAudioUrl(storagePath, fallbackSampleUrl));
  const [triedFallback, setTriedFallback] = useState(false);
  const stateRef = useRef({ hasStarted: false, isCompleted: false });
  stateRef.current = { hasStarted, isCompleted };

  // Update audio source when props change
  useEffect(() => {
    const src = api.getAudioUrl(storagePath, fallbackSampleUrl);
    setAudioSrc(src);
    setTriedFallback(false);
    setLoadError(!src);
    setIsLoading(Boolean(src));
    setIsPlaying(false);
    setCurrentTime(0);
  }, [storagePath, fallbackSampleUrl]);

  // Stop playback when leaving the page
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (el) el.pause();
    };
  }, []);

  // Log tab / app switches while the recording is being listened to.
  useEffect(() => {
    const onVisibility = () => {
      const { hasStarted: started, isCompleted: done } = stateRef.current;
      if (!started || done) return;
      const position = audioRef.current ? audioRef.current.currentTime : null;
      recordAudioEvent?.(audioNumber, document.visibilityState === 'hidden' ? 'hidden' : 'visible', position);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [audioNumber, recordAudioEvent]);

  // The server refused completion because not enough time passed since playback
  // started: ask the participant to listen again from the beginning.
  useEffect(() => {
    if (completionStatus !== 'listen_incomplete') return;
    setIsCompleted(false);
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch (e) {
        /* some browsers refuse to set currentTime before metadata loads */
      }
    }
  }, [completionStatus]);

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 60);
      setIsLoading(false);
      setLoadError(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
    if (completionStatus === 'listen_incomplete') {
      resetAudioCompletionStatus?.(audioNumber);
    }
    recordAudioEvent?.(audioNumber, 'play', audioRef.current?.currentTime ?? null);
    if (!hasStarted) {
      setHasStarted(true);
      notifyAudioStart(audioNumber);
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    const el = audioRef.current;
    // A pause event also fires at the very end; only log real pauses.
    if (el && !el.ended) {
      recordAudioEvent?.(audioNumber, 'pause', el.currentTime);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    recordAudioEvent?.(audioNumber, 'ended', audioRef.current?.currentTime ?? null);
    // Only report completion once; replays must not re-trigger the stage transition.
    // (After a failed listening check isCompleted is reset, so the next full listen reports again.)
    if (!isCompleted) {
      setIsCompleted(true);
      markAudioCompleted(audioNumber);
    }
  };

  const handleError = (e) => {
    // The sample clip is only a development aid. On the live site a load failure
    // must never be replaced by different audio, so participants see an error instead.
    if (!isLiveDatabase && !triedFallback && Boolean(fallbackSampleUrl) && audioSrc !== fallbackSampleUrl) {
      console.warn(`[RestrictedAudioPlayer] Audio failed to load from ${audioSrc}. Using development sample: ${fallbackSampleUrl}`);
      setTriedFallback(true);
      setAudioSrc(fallbackSampleUrl);
      setLoadError(false);
      setIsLoading(true);
      return;
    }
    console.error('Audio playback/load error:', e);
    recordAudioEvent?.(audioNumber, 'load_error', audioRef.current?.currentTime ?? null);
    setIsLoading(false);
    setLoadError(true);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.error('Playback failed:', err);
        setLoadError(true);
      });
    }
  };

  // Restart from the beginning (backward seek only, so the no-skip restriction still holds).
  const handleReplay = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    audioRef.current.play().catch((err) => {
      console.error('Replay failed:', err);
      setLoadError(true);
    });
  };

  const handleRetry = () => {
    setLoadError(false);
    setIsLoading(true);
    if (!audioSrc) {
      // Nothing to load; ask the context again on the next render.
      const src = api.getAudioUrl(storagePath, fallbackSampleUrl);
      setAudioSrc(src);
      if (!src) {
        setIsLoading(false);
        setLoadError(true);
      }
      return;
    }
    if (audioRef.current) {
      audioRef.current.load();
    }
  };

  const handleContinue = async () => {
    if (!onContinue || continuing) return;
    setContinuing(true);
    try {
      await onContinue();
    } finally {
      setContinuing(false);
    }
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const canContinue = isCompleted && completionStatus !== 'listen_incomplete';

  return (
    <div className="w-full space-y-6">
      {/* Hidden Native Audio Element */}
      <audio
        ref={audioRef}
        src={audioSrc || undefined}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onError={handleError}
        onKeyDown={(e) => {
          // Block keyboard seeking (left/right arrows)
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
          }
        }}
        controlsList="nodownload noplaybackrate"
        className="hidden"
      />

      {/* Audio Card */}
      <div className="academic-card p-6 sm:p-8 bg-card border border-border rounded-xl">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-main">{title}</h2>
            <p className="text-xs text-secondary">Audio Recording {audioNumber} of 2</p>
          </div>
        </div>

        {description && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-secondary mb-6 leading-relaxed">
            {description}
          </div>
        )}

        {/* Error State */}
        {loadError && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3 text-amber-900 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Audio Loading Error</p>
              <p className="text-xs text-amber-800 mt-1">
                Unable to load the audio file. Please check your internet connection or try reloading the audio file.
              </p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-3 inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Retry Audio
              </button>
            </div>
          </div>
        )}

        {/* Server listening check failed */}
        {completionStatus === 'listen_incomplete' && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3 text-amber-900 text-sm" data-testid="listen-incomplete-notice">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Please listen to the whole recording</p>
              <p className="text-xs text-amber-800 mt-1">
                We could not confirm that the full recording was played. Please press play and listen again from the beginning.
              </p>
            </div>
          </div>
        )}

        {/* Completion could not be saved */}
        {isCompleted && completionStatus === 'error' && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3 text-red-800 text-sm" data-testid="completion-save-error">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">We could not save that you finished listening</p>
              <p className="text-xs text-red-700 mt-1">
                Please check your internet connection and press Try again. You do not need to listen again.
              </p>
              <button
                type="button"
                onClick={() => markAudioCompleted(audioNumber)}
                className="mt-3 inline-flex items-center px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Custom Restricted Audio Player Controls */}
        <div className="bg-slate-50 border border-border p-6 rounded-xl flex flex-col items-center space-y-5">
          <div className="flex items-center gap-4">
          {/* Play / Pause Toggle Button */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={loadError || isLoading}
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white transition-all shadow-md focus:outline-none focus:ring-4 focus:ring-primary/30 ${
              loadError || isLoading
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-primary hover:bg-primary-hover active:scale-95'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 fill-current" />
            ) : (
              <Play className="w-8 h-8 fill-current ml-1" />
            )}
          </button>

          {/* Replay Button: restarts the recording from the beginning */}
          <button
            type="button"
            onClick={handleReplay}
            disabled={!hasStarted || loadError || isLoading}
            aria-label="Replay audio from the beginning"
            title="Replay from the beginning"
            className={`h-11 px-4 rounded-full flex items-center gap-1.5 text-sm font-semibold border transition-all focus:outline-none focus:ring-4 focus:ring-primary/30 ${
              !hasStarted || loadError || isLoading
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                : 'bg-white text-primary border-primary/40 hover:bg-primary/5 active:scale-95'
            }`}
            data-testid="audio-replay-button"
          >
            <RotateCcw className="w-4 h-4" />
            Replay
          </button>
          </div>

          <div className="w-full max-w-md space-y-2">
            <div
              className="w-full bg-slate-200 h-3 rounded-full overflow-hidden select-none cursor-default"
              title="Progress is tracked automatically (seeking disabled)"
            >
              <div
                className="bg-primary h-full rounded-full transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex justify-between text-xs font-medium text-secondary">
              <span>{formatTime(currentTime)}</span>
              <span>
                {isLoading ? 'Loading audio...' : formatTime(duration)}
              </span>
            </div>
          </div>

          <p className="text-xs text-secondary text-center italic">
            Playback restrictions: Forward seeking and skipping are disabled.
          </p>

          {canContinue && completionStatus !== 'error' && (
            <p className="text-xs text-emerald-700 font-medium flex items-center">
              {completionStatus === 'saving' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {completionStatus === 'saving' ? 'Saving...' : completionNotice}
            </p>
          )}
        </div>
      </div>

      {/* Continue Action */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue || continuing}
          className={`w-full sm:w-auto px-8 py-3.5 rounded-lg text-sm font-semibold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            canContinue && !continuing
              ? 'bg-primary hover:bg-primary-hover text-white cursor-pointer active:scale-98'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
          }`}
          data-testid="audio-continue-button"
        >
          {continueButtonLabel}
        </button>
      </div>
    </div>
  );
}
