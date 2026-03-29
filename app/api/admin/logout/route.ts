import { NextResponse } from 'next/server'

export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ success: true })

  res.cookies.set('admin_session', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // expire immediately
  })

  return res
}
