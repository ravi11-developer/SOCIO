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
  it('1. Requires gender, ethnicity, first & second language, hindi proficiency, and consent to enable Start', async () => {
    await act(async () => {
      renderWithContext(<Page1InstructionsConsent />);
    });

    const startBtn = screen.getByTestId('start-experiment-button');
    expect(startBtn).toBeDisabled();

    // Verify instruction headline
    expect(screen.getByText('Listen to the audio and answer the questions')).toBeInTheDocument();

    // Fill Gender
    const genderSelect = screen.getByLabelText(/^gender/i);
    await act(async () => {
      fireEvent.change(genderSelect, { target: { value: 'female' } });
    });
    expect(startBtn).toBeDisabled();

    // Fill Ethnicity
    const ethnicitySelect = screen.getByLabelText(/^ethnicity/i);
    await act(async () => {
      fireEvent.change(ethnicitySelect, { target: { value: 'south_asian' } });
    });
    expect(startBtn).toBeDisabled();

    // Fill First Language
    const firstLangInput = screen.getByLabelText(/first language/i);
    await act(async () => {
      fireEvent.change(firstLangInput, { target: { value: 'Hindi' } });
    });
    expect(startBtn).toBeDisabled();

    // Fill Second Language
    const secondLangInput = screen.getByLabelText(/second language/i);
    await act(async () => {
      fireEvent.change(secondLangInput, { target: { value: 'English' } });
    });
    expect(startBtn).toBeDisabled();

    // Select Hindi Proficiency (e.g. 5)
    const profBtn5 = screen.getByTestId('hindi-prof-5');
    await act(async () => {
      fireEvent.click(profBtn5);
    });
    expect(startBtn).toBeDisabled();

    // Check consent checkbox
    const consentCheck = screen.getByRole('checkbox');
    await act(async () => {
      fireEvent.click(consentCheck);
    });

    // Now all requirements are satisfied
    expect(startBtn).not.toBeDisabled();
  });

  it('2. QuestionList displays answered count (13 total) and blocks until all 12 traits and comment are complete', async () => {
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

    expect(screen.getByText('0 of 13 answered')).toBeInTheDocument();

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

    expect(screen.getByText('1 of 13 answered')).toBeInTheDocument();

    // Rate remaining 11 traits (traits 2 to 12)
    for (let traitNum = 2; traitNum <= 12; traitNum++) {
      const btn = screen.getByTestId(`rating-${traitNum}-4`);
      await act(async () => {
        fireEvent.click(btn);
      });
    }

    expect(screen.getByText('12 of 13 answered')).toBeInTheDocument();

    // Attempt submit without candid comment
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(onSubmitMock).not.toHaveBeenCalled();

    // Fill candid comment
    const commentInput = screen.getByPlaceholderText(/write your candid thoughts/i);
    await act(async () => {
      fireEvent.change(commentInput, { target: { value: 'The speaker sounds very confident, engaging, and articulate.' } });
    });

    expect(screen.getByText('13 of 13 answered')).toBeInTheDocument();

    // Submit now succeeds
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(onSubmitMock).toHaveBeenCalledTimes(1);
  });
});
