import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionList from '../src/components/questions/QuestionList';
import Page1InstructionsConsent from '../src/components/pages/Page1InstructionsConsent';
import { ExperimentProvider } from '../src/context/ExperimentContext';

function renderWithContext(ui) {
  return render(<ExperimentProvider>{ui}</ExperimentProvider>);
}

describe('Sociolinguistic Validation & Page 1 Form', () => {
  it('1. Requires gender, ethnicity, first & second language, hindi proficiency and consent to enable Start', async () => {
    await act(async () => {
      renderWithContext(<Page1InstructionsConsent />);
    });

    const startBtn = screen.getByTestId('start-experiment-button');
    expect(startBtn).toBeDisabled();

    // Verify instruction headline, instructions list and the consent statement are shown
    expect(screen.getByText('Listen to the audio and answer the questions')).toBeInTheDocument();
    expect(screen.getByTestId('participant-instructions')).toBeInTheDocument();
    expect(screen.getByTestId('consent-statement')).toHaveTextContent(/voluntary and anonymous/i);

    // Fill Gender
    const genderSelect = screen.getByLabelText(/^gender/i);
    await act(async () => {
      fireEvent.change(genderSelect, { target: { value: 'female' } });
    });
    expect(startBtn).toBeDisabled();

    // Fill Ethnicity with North Indian
    const ethnicitySelect = screen.getByLabelText(/^ethnicity/i);
    await act(async () => {
      fireEvent.change(ethnicitySelect, { target: { value: 'north_indian' } });
    });
    expect(startBtn).toBeDisabled();

    // Fill First Language (standardised dropdown)
    const firstLangSelect = screen.getByLabelText(/first language/i);
    await act(async () => {
      fireEvent.change(firstLangSelect, { target: { value: 'Hindi' } });
    });
    expect(startBtn).toBeDisabled();

    // Fill Second Language (tick English)
    await act(async () => {
      fireEvent.click(screen.getByTestId('second-language-English'));
    });
    expect(startBtn).toBeDisabled();

    // Select Hindi Proficiency (e.g. 5)
    const profBtn5 = screen.getByTestId('hindi-prof-5');
    await act(async () => {
      fireEvent.click(profBtn5);
    });

    // Everything except consent is filled: Start must stay disabled
    expect(startBtn).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('consent-checkbox'));
    });
    expect(startBtn).not.toBeDisabled();
  });

  it('2. QuestionList blocks until all 12 traits are rated; comment is optional', async () => {
    const onSubmitMock = vi.fn();

    await act(async () => {
      renderWithContext(
        <QuestionList
          recordingNumber={1}
          title="Test Questionnaire"
          actionButtonLabel="Continue"
          onSubmitAction={onSubmitMock}
        />
      );
    });

    const submitBtn = screen.getByTestId('question-submit-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(onSubmitMock).not.toHaveBeenCalled();
    expect(screen.getByText('Incomplete Evaluation')).toBeInTheDocument();

    // Rate trait 1 (Leadership) as 5
    const trait1Score5 = screen.getByTestId('rating-1-5');
    await act(async () => {
      fireEvent.click(trait1Score5);
    });

    // Rate remaining 11 traits (traits 2 to 12)
    for (let traitNum = 2; traitNum <= 12; traitNum++) {
      const btn = screen.getByTestId(`rating-${traitNum}-4`);
      await act(async () => {
        fireEvent.click(btn);
      });
    }

    // Submit succeeds without a candid comment (the comment box is optional)
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(onSubmitMock).toHaveBeenCalledTimes(1);
  });
});
