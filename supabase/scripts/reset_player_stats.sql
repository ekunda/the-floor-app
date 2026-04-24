-- ─────────────────────────────────────────────────────────────────────────────
-- reset_player_stats.sql
--
-- Czyści WSZYSTKIE statystyki graczy w bazie:
--   • profiles: xp, wins, losses, win_streak, best_streak → 0
--   • game_history: usuwa cały zapisany historyczny przebieg meczy
--   • game_rounds:  usuwa wszystkie zapisane rundy
--
-- Uwagi:
--   • NIE usuwa kont, nicków, avatarów, kategorii, pytań, ustawień config.
--   • NIE rusza aktywnych pokoi (game_rooms) ani kolejki (matchmaking_queue).
--   • Operacja jest atomowa (transakcja). Jak coś padnie — ROLLBACK.
--   • Najpierw uruchom blok DRY-RUN (sekcja 1) żeby zobaczyć ile wierszy zniknie.
--   • Dopiero potem odkomentuj BLOK WYKONAWCZY (sekcja 2) i uruchom.
--
-- Sposób użycia:
--   1) Otwórz Supabase Studio → SQL Editor (lub połącz się przez psql).
--   2) Uruchom sekcję 1 (DRY RUN) — tylko podgląd liczb, nic się nie zmienia.
--   3) Jeśli liczby się zgadzają — uruchom sekcję 2 (BLOK WYKONAWCZY).
-- ─────────────────────────────────────────────────────────────────────────────


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  SEKCJA 1 — DRY RUN (tylko podgląd, nie modyfikuje danych)               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
SELECT
  (SELECT COUNT(*) FROM public.profiles
     WHERE xp <> 0 OR wins <> 0 OR losses <> 0
        OR win_streak <> 0 OR best_streak <> 0)               AS profiles_to_reset,
  (SELECT COUNT(*) FROM public.profiles)                      AS profiles_total,
  (SELECT COUNT(*) FROM public.game_history)                  AS game_history_rows,
  (SELECT COUNT(*) FROM public.game_rounds)                   AS game_rounds_rows;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  SEKCJA 2 — BLOK WYKONAWCZY                                              ║
-- ║  Odkomentuj (usuń `/*` i `*/`) i uruchom w jednej transakcji.            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
/*
BEGIN;

-- 1) Reset statystyk w profilach
UPDATE public.profiles
SET
  xp                   = 0,
  wins                 = 0,
  losses               = 0,
  win_streak           = 0,
  best_streak          = 0,
  updated_at           = NOW()
WHERE
  xp <> 0 OR wins <> 0 OR losses <> 0
  OR win_streak <> 0 OR best_streak <> 0;

-- 2) Usuń historię meczy (FK z game_rounds → game_history idzie z CASCADE)
DELETE FROM public.game_history;

-- 3) Usuń sieroce rundy, jeśli zostały (CASCADE z punktu 2 powinien je sprzątnąć,
--    ale jest to belt-and-braces — usuwa też rundy bez game_id powiązanego z historią).
DELETE FROM public.game_rounds;

-- 4) Podsumowanie po operacji (przed COMMIT — zobacz że wszystko zerowe)
SELECT
  (SELECT COUNT(*) FROM public.profiles
     WHERE xp <> 0 OR wins <> 0 OR losses <> 0
        OR win_streak <> 0 OR best_streak <> 0)               AS profiles_with_stats_remaining,
  (SELECT COUNT(*) FROM public.game_history)                  AS game_history_remaining,
  (SELECT COUNT(*) FROM public.game_rounds)                   AS game_rounds_remaining;

-- 5) Jeżeli liczby się zgadzają (wszystkie = 0) — zatwierdź.
--    Jeżeli coś nie tak — zamiast COMMIT uruchom ROLLBACK;
COMMIT;
*/


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  ALTERNATYWA — wywołanie istniejącego RPC z migracji 20260425            ║
-- ║  admin_reset_all_stats() robi to samo, ale wymaga, żebyś był zalogowany  ║
-- ║  jako admin (gating po auth.uid()).                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- SELECT public.admin_reset_all_stats();
