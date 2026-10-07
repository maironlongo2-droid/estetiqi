ALTER TABLE ai_actions
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID
        REFERENCES users(id)
        ON DELETE SET NULL;

ALTER TABLE ai_actions
    DROP CONSTRAINT IF EXISTS ai_actions_status_check;

ALTER TABLE ai_actions
    ADD CONSTRAINT ai_actions_status_check
        CHECK (status IN (
            'pending_approval',
            'approved',
            'running',
            'completed',
            'failed',
            'cancelled',
            'whatsapp_opened'
        ));

CREATE INDEX IF NOT EXISTS idx_ai_actions_created_by_user
    ON ai_actions (organization_id, created_by_user_id, created_at DESC);
