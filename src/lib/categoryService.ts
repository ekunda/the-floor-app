// ─────────────────────────────────────────────────────────────────────────────
// lib/categoryService.ts — Supabase adapter for the `categories` table.
//
// The single source of the category/question SELECT. Returns raw rows; callers
// normalize via domain/categories.normalizeCategories (and may cache the raw
// rows themselves). Keeping the column list here means a schema change touches
// exactly one place instead of every store.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

export const CATEGORIES_SELECT =
  'id, name, emoji, lang, created_at, questions(id, category_id, image_path, answer, synonyms, created_at)'

/** Fetch all categories with their questions, oldest first. Raw, un-normalized rows. */
export async function fetchRawCategories(): Promise<unknown[] | null> {
  const { data } = await supabase
    .from('categories')
    .select(CATEGORIES_SELECT)
    .order('created_at')
  return data
}
