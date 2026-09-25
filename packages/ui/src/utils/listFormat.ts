/**
 * Joins a list of strings the way a short list naturally reads: comma-separated, with the last
 * item introduced by the locale's own conjunction word and no comma before it —
 * `AvatarGroup`'s accessible sentence is the one caller (spec "Avatar" → Accessibility:
 * `aria-label="Makers: Ingrid, Tomas, Maya and 4 more"`, no Oxford comma before "and"; task brief:
 * "Icelandic list joining: use `Intl.ListFormat` with the message locale where available").
 *
 * `Intl.ListFormat` is the right primitive for this locale by locale, but its English "long
 * conjunction" CLDR pattern inserts a comma before "and" once there are three or more items
 * ("a, b, and c"), which the spec's own example does not have — Icelandic's own pattern has no
 * such comma, so verbatim output already matches there. Rather than hand-roll the whole join and
 * lose every locale's own conjunction word, word order and pluralisation, this keeps
 * `Intl.ListFormat`'s output and removes only that one separator: `formatToParts` exposes the
 * literal immediately before the final element, and stripping a leading `", "` from it turns
 * "a, b, and c" into "a, b and c" while leaving a locale that never had the comma (Icelandic
 * among them) untouched.
 *
 * Falls back to a hand-written join — `", "` between every item but the last, `" and "`/`" og "`
 * before it, picked from the locale tag — when `Intl.ListFormat` is not available in the runtime
 * at all (some minimal JS engines ship `Intl` without every constructor).
 */
export function formatConjunctionList(items: string[], locale: string): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] as string;

  if (typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function') {
    const formatter = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
    const parts = formatter.formatToParts(items);
    // The literal immediately before the final element is the conjunction's own separator
    // ("`, and `" in English, "` og `" in Icelandic) — every earlier literal is a plain
    // mid-list "`, `" and is left untouched.
    const conjunctionIndex = parts.length - 2;
    return parts
      .map((part, index) =>
        index === conjunctionIndex && part.type === 'literal'
          ? part.value.replace(/^,\s*/, ' ')
          : part.value
      )
      .join('');
  }

  const and = locale.toLowerCase().startsWith('is') ? 'og' : 'and';
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}
