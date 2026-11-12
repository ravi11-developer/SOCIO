import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RestrictedAudioPlayer from '../src/components/audio/RestrictedAudioPlayer';
import { ExperimentProvider } from '../src/context/ExperimentContext';

function renderWithContext(ui) {
  return render(<ExperimentProvider>{ui}</ExperimentProvider>);
}

describe('RestrictedAudioPlayer Component', () => {
  it('1. Renders player with title and disabled continue button initially', () => {
    const onContinueMock = vi.fn();
    renderWithContext(
      <RestrictedAudioPlayer
        audioNumber={1}
        title="Audio Recording 1"
        description="Test audio description"
        storagePath="sample.mp3"
        fallbackSampleUrl="https://example.com/audio.mp3"
        onContinue={onContinueMock}
      />
    );

    expect(screen.getByText('Audio Recording 1')).toBeInTheDocument();
    expect(screen.getByText('Test audio description')).toBeInTheDocument();

    const continueBtn = screen.getByTestId('audio-continue-button');
    expect(continueBtn).toBeDisabled();
    expect(continueBtn).toHaveTextContent('Continue to Questions');

    // Verify there is no range slider (no seekable timeline)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('2. Audio play click does NOT enable continue button prematurely', () => {
    renderWithContext(
      <RestrictedAudioPlayer
        audioNumber={1}
        title="Audio Recording 1"
        storagePath="sample.mp3"
        fallbackSampleUrl="https://example.com/audio.mp3"
      />
    );

    const playBtn = screen.getByLabelText('Play audio');
    fireEvent.click(playBtn);

    const continueBtn = screen.getByTestId('audio-continue-button');
    expect(continueBtn).toBeDisabled();
  });

  it('3. Enables continue button upon ended event', () => {
    const onContinueMock = vi.fn();
    const { container } = renderWithContext(
      <RestrictedAudioPlayer
        audioNumber={1}
        title="Audio Recording 1"
        storagePath="sample.mp3"
        fallbackSampleUrl="https://example.com/audio.mp3"
        onContinue={onContinueMock}
      />
    );

    const audioElement = container.querySelector('audio');
    expect(audioElement).toBeInTheDocument();

    // Trigger ended event on the audio element
    act(() => {
      fireEvent.ended(audioElement);
    });

    const continueBtn = screen.getByTestId('audio-continue-button');
    expect(continueBtn).not.toBeDisabled();

    // Click continue
    fireEvent.click(continueBtn);
    expect(onContinueMock).toHaveBeenCalledTimes(1);
  });

  it('4. Handles audio error and shows retry button', () => {
    const { container } = renderWithContext(
      <RestrictedAudioPlayer
        audioNumber={1}
        title="Audio Recording 1"
        storagePath="invalid_audio.mp3"
        fallbackSampleUrl=""
      />
    );

    const audioElement = container.querySelector('audio');
    act(() => {
      fireEvent.error(audioElement);
    });

    expect(screen.getByText('Audio Loading Error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry audio/i })).toBeInTheDocument();
  });
});
