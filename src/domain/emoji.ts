// ─────────────────────────────────────────────────────────────────────────────
// domain/emoji.ts — Category → emoji resolution (pure)
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORY_EMOJI: Record<string, string> = {
  zwierzęta: '🐶', jedzenie: '🍕', filmy: '🎬', sport: '⚽', muzyka: '🎵',
  geografia: '🌍', 'miasta polski': '🏙', zawody: '💼', marki: '🏷', owoce: '🍎',
  warzywa: '🥕', napoje: '🥤', pojazdy: '🚗', ubrania: '👕',
  'przybory szkolne': '✏', 'kraje europy': '🌐', 'bohaterowie bajek': '🧸', narzędzia: '🔧',
}

/**
 * Resolve the emoji for a category. An explicit custom emoji wins; otherwise we
 * match the name against the known map, falling back to a generic target.
 */
export function getCatEmoji(name: string, customEmoji?: string): string {
  if (customEmoji && customEmoji !== '🎯') return customEmoji
  const lc = name.toLowerCase()
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
    if (lc.includes(key)) return emoji
  }
  return '🎯'
}
