import { NextRequest, NextResponse } from 'next/server';

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

  // ---------- Locale prefix handling ----------
  const { locale, rest } = localeFromPath(pathname);
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

export const config = {
  // Match everything except Next assets + static files (so locale rewrites
  // apply to all pages, not just /admin)
  matcher: ['/((?!_next/|favicon|.*\\..*).*)'],
};
