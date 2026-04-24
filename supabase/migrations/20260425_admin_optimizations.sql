-- ═══════════════════════════════════════════════════════════════════════════════
-- THE FLOOR — Admin Panel Optimizations + Schema Hardening
--
-- Run AFTER 20260424_performance_indexes.sql in Supabase SQL Editor.
-- Idempotent: safe to re-run.
--
-- Co robi:
--   1. Brakujące indeksy dla zapytań panelu admina (history, rooms, profiles sort)
--   2. UNIQUE na game_rooms.code (eliminuje race przy joinByCode)
--   3. ON DELETE cascade/set null dla FKs (czyste kasowanie kategorii/graczy)
--   4. CHECK constraints na statystykach (wins/losses/xp ≥ 0)
--   5. GIN na questions.synonyms (synonim search)
--   6. RPC: admin_db_stats() — jeden RTT zamiast pięciu count() head
--   7. RPC: admin_reset_all_stats() — atomic bulk reset (transakcja)
--   8. RPC: cleanup_stale_rooms(interval) — purge nieaktywnych pokojów
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. INDEKSY POD PANEL ADMINA
-- ─────────────────────────────────────────────────────────────────────────────

-- game_history: domyślny widok admina (ORDER BY played_at DESC LIMIT 100)
CREATE INDEX IF NOT EXISTS idx_game_history_played_at_desc
  ON game_history (played_at DESC);

-- game_rooms: aktywne pokoje (ORDER BY created_at DESC LIMIT 50)
CREATE INDEX IF NOT EXISTS idx_game_rooms_created_at_desc
  ON game_rooms (created_at DESC);

-- game_rooms: filtr po status (purge nieaktywnych, count online)
CREATE INDEX IF NOT EXISTS idx_game_rooms_status
  ON game_rooms (status)
  WHERE status IN ('waiting', 'lobby', 'finished'); -- partial — playing wykluczone

-- profiles: sortowanie w AdminPlayers (wins/win_streak/losses)
CREATE INDEX IF NOT EXISTS idx_profiles_wins_desc        ON profiles (wins DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_win_streak_desc  ON profiles (win_streak DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_losses_desc      ON profiles (losses DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at_desc  ON profiles (created_at DESC);

-- game_rounds: cascade lookup (game_id, room_id)
CREATE INDEX IF NOT EXISTS idx_game_rounds_game_id   ON game_rounds (game_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_room_id   ON game_rounds (room_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_question  ON game_rounds (question_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_winner    ON game_rounds (winner_id, created_at DESC);

-- matchmaking_queue: dobieranie po ELO + FIFO
CREATE INDEX IF NOT EXISTS idx_matchmaking_elo_joined
  ON matchmaking_queue (elo, joined_at);

-- questions.synonyms: GIN dla operatorów @> / ANY na ARRAY
CREATE INDEX IF NOT EXISTS idx_questions_synonyms_gin
  ON questions USING GIN (synonyms);

-- profiles.last_seen: lista ostatnio aktywnych graczy
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen
  ON profiles (last_seen DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. UNIQUE: game_rooms.code (eliminuje race przy joinByCode)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Najpierw posprzątaj duplikaty (zostaw najnowszy z każdego kodu)
  DELETE FROM game_rooms gr
  USING (
    SELECT code, MAX(created_at) AS keep_at
    FROM game_rooms
    GROUP BY code
    HAVING COUNT(*) > 1
  ) dup
  WHERE gr.code = dup.code AND gr.created_at < dup.keep_at;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_rooms_code_key' AND conrelid = 'game_rooms'::regclass
  ) THEN
    ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_code_key UNIQUE (code);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UNIQUE + walidacja: profiles.username (case-insensitive)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uniq_profiles_username_lower
  ON profiles (lower(username));


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CHECK CONSTRAINTS — chronią przed ujemnymi statystykami
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_xp_nonneg') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_xp_nonneg          CHECK (xp >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_wins_nonneg') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_wins_nonneg        CHECK (wins >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_losses_nonneg') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_losses_nonneg      CHECK (losses >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_streak_nonneg') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_streak_nonneg      CHECK (win_streak >= 0 AND best_streak >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_streak_consistent') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_streak_consistent  CHECK (best_streak >= win_streak);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ON DELETE — kaskadowe kasowanie / set null
--    Wymaga DROP+ADD, więc owijamy w DO-block z guards.
-- ─────────────────────────────────────────────────────────────────────────────

-- questions.category_id: kaskadowo z kategorią
DO $$
BEGIN
  ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_category_id_fkey;
  ALTER TABLE questions
    ADD CONSTRAINT questions_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
END $$;

-- game_history.winner_id / loser_id / room_id: SET NULL przy kasowaniu profilu/pokoju
DO $$
BEGIN
  ALTER TABLE game_history DROP CONSTRAINT IF EXISTS game_history_winner_id_fkey;
  ALTER TABLE game_history
    ADD CONSTRAINT game_history_winner_id_fkey
    FOREIGN KEY (winner_id) REFERENCES profiles(id) ON DELETE SET NULL;

  ALTER TABLE game_history DROP CONSTRAINT IF EXISTS game_history_loser_id_fkey;
  ALTER TABLE game_history
    ADD CONSTRAINT game_history_loser_id_fkey
    FOREIGN KEY (loser_id) REFERENCES profiles(id) ON DELETE SET NULL;

  ALTER TABLE game_history DROP CONSTRAINT IF EXISTS game_history_room_id_fkey;
  ALTER TABLE game_history
    ADD CONSTRAINT game_history_room_id_fkey
    FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE SET NULL;
END $$;

-- game_rounds: kaskadowo z game_history / pokojem
DO $$
BEGIN
  ALTER TABLE game_rounds DROP CONSTRAINT IF EXISTS game_rounds_game_id_fkey;
  ALTER TABLE game_rounds
    ADD CONSTRAINT game_rounds_game_id_fkey
    FOREIGN KEY (game_id) REFERENCES game_history(id) ON DELETE CASCADE;

  ALTER TABLE game_rounds DROP CONSTRAINT IF EXISTS game_rounds_room_id_fkey;
  ALTER TABLE game_rounds
    ADD CONSTRAINT game_rounds_room_id_fkey
    FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE SET NULL;

  ALTER TABLE game_rounds DROP CONSTRAINT IF EXISTS game_rounds_question_id_fkey;
  ALTER TABLE game_rounds
    ADD CONSTRAINT game_rounds_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL;

  ALTER TABLE game_rounds DROP CONSTRAINT IF EXISTS game_rounds_category_id_fkey;
  ALTER TABLE game_rounds
    ADD CONSTRAINT game_rounds_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;

  ALTER TABLE game_rounds DROP CONSTRAINT IF EXISTS game_rounds_winner_id_fkey;
  ALTER TABLE game_rounds
    ADD CONSTRAINT game_rounds_winner_id_fkey
    FOREIGN KEY (winner_id) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;

-- matchmaking_queue.player_id: CASCADE (gracz odchodzi → out of queue)
DO $$
BEGIN
  ALTER TABLE matchmaking_queue DROP CONSTRAINT IF EXISTS matchmaking_queue_player_id_fkey;
  ALTER TABLE matchmaking_queue
    ADD CONSTRAINT matchmaking_queue_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES profiles(id) ON DELETE CASCADE;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC: admin_db_stats() — jeden round-trip zamiast pięciu count()
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_db_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'categories', (SELECT count(*) FROM categories),
    'questions',  (SELECT count(*) FROM questions),
    'profiles',   (SELECT count(*) FROM profiles),
    'rooms',      (SELECT count(*) FROM game_rooms),
    'rounds',     (SELECT count(*) FROM game_rounds),
    'history',    (SELECT count(*) FROM game_history),
    'queue',      (SELECT count(*) FROM matchmaking_queue),
    'online',     (SELECT count(*) FROM profiles WHERE status = 'online'),
    'in_game',    (SELECT count(*) FROM profiles WHERE status = 'in_game'),
    'rooms_active', (SELECT count(*) FROM game_rooms WHERE status IN ('waiting','lobby','playing')),
    'total_xp',   (SELECT coalesce(sum(xp), 0) FROM profiles)
  );
$$;

GRANT EXECUTE ON FUNCTION admin_db_stats() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC: admin_reset_all_stats() — atomic bulk reset
--    Zwraca liczbę zaktualizowanych wierszy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_reset_all_stats()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  -- Tylko admin (z is_admin=true) może to wywołać
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden: only admins can reset all stats';
  END IF;

  UPDATE profiles
  SET wins = 0, losses = 0, win_streak = 0, best_streak = 0, xp = 0,
      updated_at = now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_all_stats() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC: cleanup_stale_rooms(older_than interval)
--    Usuwa pokoje w stanie waiting/finished/lobby starsze niż X.
--    Pokoje "playing" zostają nietknięte. Zwraca liczbę usuniętych.
--    Można podpiąć pod pg_cron lub Edge Function jako daily job.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_stale_rooms(older_than interval DEFAULT interval '24 hours')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM game_rooms
  WHERE status IN ('waiting', 'lobby', 'finished')
    AND updated_at < now() - older_than;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_stale_rooms(interval) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ANALYZE — odśwież statystyki planera po dodaniu indeksów
-- ─────────────────────────────────────────────────────────────────────────────

ANALYZE categories;
ANALYZE questions;
ANALYZE profiles;
ANALYZE game_rooms;
ANALYZE game_rounds;
ANALYZE game_history;
ANALYZE matchmaking_queue;
ANALYZE config;
