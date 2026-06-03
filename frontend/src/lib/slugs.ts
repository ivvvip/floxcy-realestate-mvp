/**
 * Canonical area-slug shape used in every `/areas/{slug}` URL we generate.
 * Lowercase, hyphens-only separators, no extraneous punctuation. The Next.js
 * middleware in src/middleware.ts redirects any non-canonical URL form
 * ("Al Raffa", "al raffa", "al_raffa", "AL%20RAFFA") to the canonical
 * variant produced by this function, so there's only ever one URL per area.
 *
 * Keep this in sync with the backend's slug normaliser in
 * backend/app/api/routes/areas.py — the API resolver accepts every variant
 * already, but URL canonicalisation here is what stops 404s from happening
 * at the Next.js router layer.
 */
export function toAreaSlug(input: string | null | undefined): string {
  if (!input) return '';
  let s: string;
  try {
    // %20 → space, %27 → ' etc.; safe to call even on already-decoded input
    s = decodeURIComponent(input);
  } catch {
    s = input;
  }
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]+/g, '') // drop apostrophes, parens, etc.
    .replace(/[_\s]+/g, '-')        // any whitespace/underscore → hyphen
    .replace(/-+/g, '-')            // collapse repeated hyphens
    .replace(/^-+|-+$/g, '');       // trim hyphens
}

/** True when `input` already matches its canonical form exactly. */
export function isCanonicalAreaSlug(input: string): boolean {
  return input === toAreaSlug(input) && input.length > 0;
}

/** Build the URL path for an area detail page. Centralises the route shape. */
export function areaHref(name: string | null | undefined): string {
  return `/areas/${toAreaSlug(name)}`;
}
