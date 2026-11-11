import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionList from '../src/components/questions/QuestionList';
import Page1InstructionsConsent from '../src/components/pages/Page1InstructionsConsent';
import { ExperimentProvider } from '../src/context/ExperimentContext';

function renderWithContext(ui) {
  return render(<ExperimentProvider>{ui}</ExperimentProvider>);
}

describe('Question Validation & Page 1 Consent Form', () => {
  it('1. Consent checkbox and demographics must be filled to enable Start button', async () => {
    await act(async () => {
      renderWithContext(<Page1InstructionsConsent />);
    });

    const startBtn = screen.getByTestId('start-experiment-button');
    expect(startBtn).toBeDisabled();

    // Select gender
    const genderSelect = screen.getByLabelText(/gender/i);
    await act(async () => {
      fireEvent.change(genderSelect, { target: { value: 'female' } });
    });

    // Select ethnicity
    const ethnicitySelect = screen.getByLabelText(/ethnicity/i);
    await act(async () => {
      fireEvent.change(ethnicitySelect, { target: { value: 'option_placeholder_1' } });
    });

    // Start button still disabled because consent not checked
    expect(startBtn).toBeDisabled();

    // Check consent checkbox
    const consentCheck = screen.getByRole('checkbox');
    await act(async () => {
      fireEvent.click(consentCheck);
    });

    // Now start button should be enabled
    expect(startBtn).not.toBeDisabled();
  });

  it('2. QuestionList displays answered count and blocks empty required submissions', async () => {
    const onSubmitMock = vi.fn();
    const mockQuestions = [
      { id: 'q1_1', number: 1, text: 'Question 1', required: true, placeholder: 'Answer 1' },
      { id: 'q1_2', number: 2, text: 'Question 2', required: true, placeholder: 'Answer 2' },
    ];

    await act(async () => {
      renderWithContext(
        <QuestionList
          title="Test Questions"
          questions={mockQuestions}
          actionButtonLabel="Continue"
          onSubmitAction={onSubmitMock}
        />
      );
    });

    expect(screen.getByText('0 of 2 answered')).toBeInTheDocument();

    const submitBtn = screen.getByTestId('question-submit-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Submission blocked
    expect(onSubmitMock).not.toHaveBeenCalled();
    expect(screen.getByText('Incomplete Questionnaire')).toBeInTheDocument();

    // Fill first question
    const textarea1 = screen.getByPlaceholderText('Answer 1');
    await act(async () => {
      fireEvent.change(textarea1, { target: { value: 'My answer to question 1' } });
    });

    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();

    // Fill second question
    const textarea2 = screen.getByPlaceholderText('Answer 2');
    await act(async () => {
      fireEvent.change(textarea2, { target: { value: 'My answer to question 2' } });
    });

    expect(screen.getByText('2 of 2 answered')).toBeInTheDocument();

    // Submit again
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(onSubmitMock).toHaveBeenCalledTimes(1);
  });
});
