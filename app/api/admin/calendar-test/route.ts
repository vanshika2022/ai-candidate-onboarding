import { NextRequest, NextResponse } from 'next/server'
import { getCalendarClient, getCalendarId } from '@/lib/services/calendar'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')

  if (!auth || auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const calendar = getCalendarClient()
    await calendar.calendarList.list()

    return NextResponse.json({
      success: true,
      calendar_id: getCalendarId(),
      message: 'Google Calendar connected',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
