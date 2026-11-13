-- ==============================================================================
-- MAKE THE OPEN-FEEDBACK COMMENT BOXES OPTIONAL
-- rpc_complete_questions_1 and rpc_submit_experiment only block on questions with
-- is_required = true, so flipping the flag is enough. Safe to re-run.
-- ==============================================================================
UPDATE public.questions
SET is_required = false
WHERE id IN ('q1_comment', 'q2_comment');
