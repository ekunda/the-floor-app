-- ═══════════════════════════════════════════════════════════════════════════════
-- THE FLOOR — Admin RLS Hardening + Admin Management RPC (wariant B)
--
-- Run AFTER 20260425_admin_optimizations.sql w Supabase SQL Editor.
-- Idempotent: bezpieczne do ponownego uruchomienia.
--
-- Problem który naprawia:
--   Dotychczasowe polityki zapisu na categories/questions/config brzmiały
--   "admin write …", ale realnie sprawdzały tylko `auth.uid() IS NOT NULL`,
--   czyli KAŻDY zalogowany gracz MP mógł edytować pytania, kategorie i config.
--   Tabela profiles z kolei pozwalała edytować/usuwać wyłącznie własny wiersz,
--   więc panel graczy (edycja XP / kasowanie cudzych profili) nie działał pod RLS.
--
-- Co robi:
--   1. Gwarantuje kolumnę profiles.is_admin
--   2. Helper public.is_admin(uid) — SECURITY DEFINER (omija RLS → brak rekurencji)
--   3. Zapis na categories/questions/config TYLKO dla adminów
--   4. profiles: admin może UPDATE/DELETE dowolny wiersz (poza tym self-edit zostaje)
--   5. RPC set_player_admin(target, make_admin) — nadaje/odbiera admina,
--      z blokadą usunięcia ostatniego admina
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Kolumna is_admin
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_admin
  ON public.profiles (is_admin) WHERE is_admin = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Helper: is_admin(uid)
--    SECURITY DEFINER → odczyt profiles bez RLS, dzięki czemu można go wołać
--    wewnątrz polityk na profiles bez nieskończonej rekurencji.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND is_admin = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Zapis na content tables TYLKO dla adminów (odczyt publiczny zostaje)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- categories
  DROP POLICY IF EXISTS "admin write categories" ON public.categories;
  CREATE POLICY "admin write categories" ON public.categories
    FOR ALL TO authenticated
    USING      (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

  -- questions
  DROP POLICY IF EXISTS "admin write questions" ON public.questions;
  CREATE POLICY "admin write questions" ON public.questions
    FOR ALL TO authenticated
    USING      (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

  -- config
  DROP POLICY IF EXISTS "admin write config" ON public.config;
  CREATE POLICY "admin write config" ON public.config
    FOR ALL TO authenticated
    USING      (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. profiles: admin może edytować / usuwać dowolny profil
--    (polityki permissive sumują się OR-em z istniejącym self-edit)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
  CREATE POLICY "profiles_admin_update" ON public.profiles
    FOR UPDATE TO authenticated
    USING      (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

  DROP POLICY IF EXISTS "profiles_admin_delete" ON public.profiles;
  CREATE POLICY "profiles_admin_delete" ON public.profiles
    FOR DELETE TO authenticated
    USING (public.is_admin(auth.uid()));
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: set_player_admin(target_id, make_admin)
--    Nadaje/odbiera prawa admina. Tylko admin może wołać.
--    Blokuje odebranie praw ostatniemu adminowi (anti-lockout).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_player_admin(target_id uuid, make_admin boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count integer;
  target_is_admin boolean;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: only admins can change admin rights';
  END IF;

  IF make_admin = false THEN
    SELECT count(*) INTO admin_count FROM public.profiles WHERE is_admin = true;
    SELECT is_admin INTO target_is_admin FROM public.profiles WHERE id = target_id;
    IF target_is_admin AND admin_count <= 1 THEN
      RAISE EXCEPTION 'cannot revoke the last remaining admin';
    END IF;
  END IF;

  UPDATE public.profiles
    SET is_admin = make_admin, updated_at = now()
    WHERE id = target_id;

  RETURN make_admin;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_player_admin(uuid, boolean) TO authenticated;
