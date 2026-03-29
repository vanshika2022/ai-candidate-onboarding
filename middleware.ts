import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow /admin/login through without auth
  if (pathname === '/admin/login') {
    return NextResponse.next()
  }

  // All other /admin routes require the session cookie
  const session = request.cookies.get('admin_session')

  if (!session || session.value !== 'authenticated') {
    const loginUrl = new URL('/admin/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
