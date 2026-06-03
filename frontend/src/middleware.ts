import { NextRequest, NextResponse } from 'next/server';
import { toAreaSlug } from '@/lib/slugs';

const AUTH_COOKIE = 'floxcy_session';

// i18n infra — NOT active yet. Currently:
//  - /ar/* paths are rewritten to /* and the NEXT_LOCALE cookie is set
//    to 'ar' so layout + components can pick it up.
//  - /en/* paths are stripped to /* with cookie 'en'.
//  - bare / paths default to 'en' but DO NOT redirect — keeps current
//    URLs ('floxcy.com/areas') unchanged.
// When real Arabic copy ships, we can flip a flag to enforce locale
// prefixes (redirect / → /en/ or /ar/ based on Accept-Language).
const LOCALES = ['en', 'ar'] as const;
const LOCALE_COOKIE = 'NEXT_LOCALE';
type Locale = (typeof LOCALES)[number];

function localeFromPath(pathname: string): { locale: Locale | null; rest: string } {
  for (const loc of LOCALES) {
    if (pathname === `/${loc}`) return { locale: loc, rest: '/' };
    if (pathname.startsWith(`/${loc}/`)) return { locale: loc, rest: pathname.slice(loc.length + 1) };
  }
  return { locale: null, rest: pathname };
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---------- Admin auth gate (unchanged behaviour) ----------
  if (pathname.startsWith('/admin')) {
    const token = req.cookies.get(AUTH_COOKIE)?.value;
    if (!token) {
      if (pathname === '/admin/login') {
        return forwardWithLocale(req, NextResponse.next());
      }
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', pathname);
      return forwardWithLocale(req, NextResponse.redirect(url));
    }
  }

  // ---------- Area slug canonicalisation ----------
  // Any /areas/{slug}/... that isn't already in the canonical form
  // (lowercase + hyphens + no extraneous chars) is 308-redirected to the
  // canonical URL. This is what stops Next.js's [slug] router from 404'ing
  // on /areas/al%20raffa, /areas/Al-Raffa, /areas/al_raffa, etc. — there's
  // exactly one URL per area, every variant funnels into it. The peeled
  // path also handles /en/areas/... and /ar/areas/... cleanly because
  // localeFromPath strips the prefix below.
  const peeled = localeFromPath(pathname);
  const areaRedirect = canonicaliseAreaPath(req, peeled.locale, peeled.rest);
  if (areaRedirect) return areaRedirect;

  // ---------- Locale prefix handling ----------
  const { locale, rest } = peeled;
  if (locale) {
    // Rewrite /ar/foo → /foo (transparent to pages) and pin the cookie
    const url = req.nextUrl.clone();
    url.pathname = rest;
    const res = NextResponse.rewrite(url);
    res.cookies.set(LOCALE_COOKIE, locale, {
      path: '/',
      sameSite: 'lax',
      // 1 year — explicit user choice via URL
      maxAge: 60 * 60 * 24 * 365,
    });
    // Also surface the resolved pathname for server-component lookups
    res.headers.set('x-next-pathname', pathname);
    return res;
  }

  return forwardWithLocale(req, NextResponse.next());
}

function forwardWithLocale(req: NextRequest, res: NextResponse): NextResponse {
  // Propagate the pathname header so server components can compute layout dir
  res.headers.set('x-next-pathname', req.nextUrl.pathname);
  return res;
}

/**
 * Inspect the locale-peeled path; if it points at an /areas/{slug}/... URL
 * whose first segment is not already the canonical area slug, return a 308
 * redirect to the canonical form (with the locale prefix re-attached).
 * Returns null when the URL is already canonical (or isn't an area URL).
 */
function canonicaliseAreaPath(
  req: NextRequest,
  locale: Locale | null,
  restPath: string,
): NextResponse | null {
  if (!restPath.startsWith('/areas/')) return null;
  const after = restPath.slice('/areas/'.length);
  if (!after) return null;
  const firstSlash = after.indexOf('/');
  const rawSlug = firstSlash === -1 ? after : after.slice(0, firstSlash);
  const tail = firstSlash === -1 ? '' : after.slice(firstSlash);
  if (!rawSlug) return null;
  const canonical = toAreaSlug(rawSlug);
  if (!canonical) return null;
  // Already canonical → let the request through.
  if (rawSlug === canonical) return null;
  const newRest = `/areas/${canonical}${tail}`;
  const newPath = locale ? `/${locale}${newRest}` : newRest;
  const url = req.nextUrl.clone();
  url.pathname = newPath;
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Match everything except Next assets + static files (so locale rewrites
  // apply to all pages, not just /admin)
  matcher: ['/((?!_next/|favicon|.*\\..*).*)'],
};
