ALTER TABLE users
ADD COLUMN clerk_user_id VARCHAR(255);

CREATE UNIQUE INDEX users_clerk_user_id_unique
ON users(clerk_user_id)
WHERE clerk_user_id IS NOT NULL;
