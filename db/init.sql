CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
