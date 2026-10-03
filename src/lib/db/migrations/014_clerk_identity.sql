ALTER TABLE organizations
ADD COLUMN clerk_organization_id VARCHAR(255);

CREATE UNIQUE INDEX organizations_clerk_organization_id_unique
ON organizations(clerk_organization_id)
WHERE clerk_organization_id IS NOT NULL;
