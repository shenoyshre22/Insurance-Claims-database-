USE insurance_claims_db;

-- Replace the former Claims Officer application role with the restricted User role.
-- Existing Claims Officer accounts become Users, retaining sign-in but only document submission.
ALTER TABLE APP_USER MODIFY COLUMN role ENUM('Admin', 'Claims Officer', 'User') NOT NULL DEFAULT 'User';
UPDATE APP_USER SET role = 'User' WHERE role = 'Claims Officer';
ALTER TABLE APP_USER MODIFY COLUMN role ENUM('Admin', 'User') NOT NULL DEFAULT 'User';
