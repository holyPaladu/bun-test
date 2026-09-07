ALTER TABLE users RENAME TO auth_accounts;
ALTER TABLE auth_accounts RENAME COLUMN status TO auth_status;

ALTER INDEX users_email_key RENAME TO auth_accounts_email_key;
ALTER TABLE auth_accounts
  RENAME CONSTRAINT users_status_check TO auth_accounts_auth_status_check;
