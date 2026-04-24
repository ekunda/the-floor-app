-- ═══════════════════════════════════════════════════════════════════════════════
-- THE FLOOR — Performance Indexes & RLS Policies
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. INDEXES — Accelerate frequent queries
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles: lobby player list (status + last_seen filter, ordered by xp)
CREATE INDEX IF NOT EXISTS idx_profiles_status_lastseen
  ON profiles (status, last_seen DESC);

-- profiles: username search (case-insensitive via lower)
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON profiles (lower(username));

-- profiles: XP ordering for leaderboard
CREATE INDEX IF NOT EXISTS idx_profiles_xp_desc
  ON profiles (xp DESC);

-- game_rooms: find by code + status (join room flow)
CREATE INDEX IF NOT EXISTS idx_game_rooms_code_status
  ON game_rooms (code, status);

-- game_rooms: find rooms by host (my rooms)
CREATE INDEX IF NOT EXISTS idx_game_rooms_host
  ON game_rooms (host_id);

-- game_rooms: find rooms by guest
CREATE INDEX IF NOT EXISTS idx_game_rooms_guest
  ON game_rooms (guest_id)
  WHERE guest_id IS NOT NULL;

-- game_history: player lookup (dashboard history)
CREATE INDEX IF NOT EXISTS idx_game_history_winner
  ON game_history (winner_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_history_loser
  ON game_history (loser_id, played_at DESC);

-- categories: order by created_at (loadCategories)
CREATE INDEX IF NOT EXISTS idx_categories_created
  ON categories (created_at);

-- questions: category lookup (joined in categories query)
CREATE INDEX IF NOT EXISTS idx_questions_category
  ON questions (category_id);

-- config: key lookup (fetch all config)
CREATE INDEX IF NOT EXISTS idx_config_key
  ON config (key);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS POLICIES — Public read for shared tables
--    These allow anon/authenticated users to read without row-level checks,
--    which eliminates per-row policy evaluation overhead on read-heavy tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS (idempotent — safe to re-run)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Categories: everyone can read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'categories_public_read'
  ) THEN
    CREATE POLICY categories_public_read ON categories FOR SELECT USING (true);
  END IF;
END $$;

-- Questions: everyone can read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'questions' AND policyname = 'questions_public_read'
  ) THEN
    CREATE POLICY questions_public_read ON questions FOR SELECT USING (true);
  END IF;
END $$;

-- Config: everyone can read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'config' AND policyname = 'config_public_read'
  ) THEN
    CREATE POLICY config_public_read ON config FOR SELECT USING (true);
  END IF;
END $$;

-- Profiles: everyone can read (public leaderboard, lobby player list)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_public_read'
  ) THEN
    CREATE POLICY profiles_public_read ON profiles FOR SELECT USING (true);
  END IF;
END $$;

-- Profiles: users can only update their own row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_self_update'
  ) THEN
    CREATE POLICY profiles_self_update ON profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

-- Profiles: users can insert their own row (registration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_self_insert'
  ) THEN
    CREATE POLICY profiles_self_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. OPTIONAL: Heartbeat RPC function (reduces REST overhead)
--    Call via: supabase.rpc('heartbeat')
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION heartbeat()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET last_seen = now()
  WHERE id = auth.uid();
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION heartbeat() TO authenticated;
