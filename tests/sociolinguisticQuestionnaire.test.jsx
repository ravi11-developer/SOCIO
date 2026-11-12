import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Page2Audio1 from '../src/components/pages/Page2Audio1';
import Page4Audio2 from '../src/components/pages/Page4Audio2';
import QuestionList from '../src/components/questions/QuestionList';
import { ExperimentProvider } from '../src/context/ExperimentContext';
import { EXPERIMENT_CONFIG } from '../src/config/experiment';

function renderWithContext(ui) {
  return render(<ExperimentProvider>{ui}</ExperimentProvider>);
}

describe('Sociolinguistic Blinded Evaluation & 12 Traits', () => {
  it('1. Audio pages display neutral blinded headers without disclosing language or gender', async () => {
    // Render Page 2 Audio 1
    const { unmount } = renderWithContext(<Page2Audio1 />);
    expect(screen.getByText('Audio Recording 1')).toBeInTheDocument();
    
    // Ensure no leaks of dialect, language variety, or gender in participant headers
    expect(screen.queryByText(/pure hindi/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pure english/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bombay hindi/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/code-mixed/i)).not.toBeInTheDocument();

    unmount();

    // Render Page 4 Audio 2
    renderWithContext(<Page4Audio2 />);
    expect(screen.getByText('Audio Recording 2')).toBeInTheDocument();
    expect(screen.queryByText(/pure hindi/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/code-mixed/i)).not.toBeInTheDocument();
  });

  it('2. QuestionList renders all 12 traits and the candid opinion prompt', async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      renderWithContext(
        <QuestionList
          recordingNumber={1}
          title="Questions About First Audio Recording"
          actionButtonLabel="Continue"
          onSubmitAction={onSubmit}
        />
      );
    });

    // Check all 12 traits exist
    const traits = [
      'Leadership',
      'Sense of Humor',
      'Intelligence',
      'Religiousness',
      'Self-confidence',
      'Dependability',
      'Entertainingness',
      'Kindness',
      'Ambition',
      'Sociability',
      'Character',
      'Likability'
    ];

    traits.forEach((traitName) => {
      expect(screen.getByText(traitName)).toBeInTheDocument();
    });

    // Check candid opinion prompt
    expect(
      screen.getByText(/list all your opinions about the speaker, be as candid as possible/i)
    ).toBeInTheDocument();

    // Check 1 to 6 rating buttons exist for each trait
    expect(screen.getAllByRole('radio')).toHaveLength(12 * 6); // 12 traits * 6 options = 72 buttons
  });
});
