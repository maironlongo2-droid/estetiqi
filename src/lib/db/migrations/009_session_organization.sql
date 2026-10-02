ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE sessions s
SET organization_id = m.organization_id
FROM memberships m
WHERE m.user_id = s.user_id
  AND s.organization_id IS NULL;

DELETE FROM sessions
WHERE organization_id IS NULL;

ALTER TABLE sessions
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE sessions
ADD CONSTRAINT sessions_organization_fk
FOREIGN KEY (organization_id)
REFERENCES organizations(id)
ON DELETE CASCADE;

CREATE INDEX idx_sessions_organization_id
ON sessions(organization_id);
