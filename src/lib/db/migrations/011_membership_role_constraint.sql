ALTER TABLE memberships
ADD CONSTRAINT memberships_role_check
CHECK (role IN ('owner', 'admin', 'member'));
