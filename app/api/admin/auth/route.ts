import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { password?: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { password } = body

  if (!password || password !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const res = NextResponse.json({ success: true })

  res.cookies.set('admin_session', 'authenticated', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 86400, // 24 hours
  })

  return res
}
