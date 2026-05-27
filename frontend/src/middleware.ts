import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'floxcy_session';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/admin')) {
    const token = req.cookies.get(AUTH_COOKIE)?.value;
    if (!token) {
      // Allow /admin/login through; gate everything else
      if (pathname === '/admin/login') return NextResponse.next();
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
