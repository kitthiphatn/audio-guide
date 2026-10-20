// Shared by server and browser code, so no Node imports here.

/** A plain string, or one string per language code: { th: '…', en: '…' }. */
export type Text = string | Record<string, string>;

export function pick(text: Text | undefined, lang: string, fallback?: string): string {
  if (typeof text === 'string') return text;
  return text?.[lang] ?? (fallback ? text?.[fallback] : undefined) ?? Object.values(text || {})[0] ?? '';
}
