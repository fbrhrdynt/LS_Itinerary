CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'User';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS febro_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_febro_sub ON users(febro_sub) WHERE febro_sub IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Administrator','User'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_status_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active','hold','blocked'));
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  administrator_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) NOT NULL,
  target_id BIGINT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS trips (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  trip_type VARCHAR(10) NOT NULL CHECK (trip_type IN ('solo','group')),
  destination VARCHAR(180) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  overall_budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  invite_code VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS trip_members (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  budget_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_trip_member_user
  ON trip_members(trip_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members(trip_id);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'activity',
  location VARCHAR(220),
  notes TEXT,
  estimated_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_itinerary_trip_date ON itinerary_items(trip_id, item_date, start_time);

CREATE TABLE IF NOT EXISTS accommodations (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  location VARCHAR(220),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  booking_ref VARCHAR(120),
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (check_out >= check_in)
);

CREATE TABLE IF NOT EXISTS transportation (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  mode VARCHAR(40) NOT NULL,
  provider VARCHAR(120),
  origin VARCHAR(180) NOT NULL,
  destination VARCHAR(180) NOT NULL,
  departure_at TIMESTAMPTZ,
  arrival_at TIMESTAMPTZ,
  booking_ref VARCHAR(120),
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  description VARCHAR(180) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'other',
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  paid_by_member_id BIGINT NOT NULL REFERENCES trip_members(id) ON DELETE RESTRICT,
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_trip_date ON expenses(trip_id, expense_date);

CREATE TABLE IF NOT EXISTS expense_splits (
  id BIGSERIAL PRIMARY KEY,
  expense_id BIGINT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id BIGINT NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  share_amount NUMERIC(14,2) NOT NULL CHECK (share_amount >= 0),
  UNIQUE(expense_id, member_id)
);

-- Additive authentication migration. Existing ownership is deliberately unverified.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
UPDATE users SET role='User' WHERE role='Administrator' AND NOT (
 lower(trim(email)) IN ('febroherdyanto98@gmail.com','febroherdyanto@outlook.com')
 AND email_verified_at IS NOT NULL AND lower(trim(verified_email))=lower(trim(email))
 AND verified_email IS NOT NULL);
CREATE OR REPLACE FUNCTION enforce_user_auth_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF lower(trim(NEW.email)) IS DISTINCT FROM lower(trim(OLD.email)) THEN
   NEW.email_verified_at=NULL; NEW.verified_email=NULL; NEW.role='User';
  END IF;
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.email IS DISTINCT FROM OLD.email THEN
   NEW.auth_version=OLD.auth_version+1;
  END IF;
 END IF;
 IF NEW.role='Administrator' AND NOT COALESCE((lower(trim(NEW.email)) IN ('febroherdyanto98@gmail.com','febroherdyanto@outlook.com') AND NEW.email_verified_at IS NOT NULL AND lower(trim(NEW.verified_email))=lower(trim(NEW.email))),false) THEN
  RAISE EXCEPTION 'Administrator requires allowlisted verified ownership' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' OR lower(trim(NEW.email)) IS DISTINCT FROM lower(trim(OLD.email)) THEN
  PERFORM pg_advisory_xact_lock(hashtext(lower(trim(NEW.email))));
  IF EXISTS(SELECT 1 FROM users WHERE lower(trim(email))=lower(trim(NEW.email)) AND id<>NEW.id) THEN
   RAISE EXCEPTION 'Email already registered' USING ERRCODE='23505';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_auth_policy ON users;
CREATE TRIGGER users_auth_policy BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION enforce_user_auth_policy();
CREATE TABLE IF NOT EXISTS password_resets (
 token_hash CHAR(64) PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL,
 used_at TIMESTAMPTZ,
 auth_version INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);
