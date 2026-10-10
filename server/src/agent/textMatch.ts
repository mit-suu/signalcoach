/**
 * Text matching shared by the self-check passes (session review and transcript analysis).
 * Quotes are compared after `norm`: lower-case, punctuation stripped, whitespace collapsed —
 * so a model that drops a comma still quotes "verbatim", but one that paraphrases does not.
 */
export const norm = (s: string) => s.toLowerCase().replace(/[“”"'’`.,;:!?()\-–—…]/g, " ").replace(/\s+/g, " ").trim();

const words = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 1));

/** Dice coefficient over word sets — 1 = same words, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** True when `quote` has real words (not just punctuation like "…") and appears in `text` after normalisation. */
export function quoteIn(quote: string, text: string): boolean {
  const q = norm(quote);
  return q.length > 0 && norm(text).includes(q);
}
