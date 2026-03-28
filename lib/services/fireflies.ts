/**
 * lib/services/fireflies.ts
 * ─────────────────────────
 * Mock Fireflies.ai notetaker integration.
 *
 * In production this would call the Fireflies GraphQL API to:
 *   - Invite the notetaker to a meeting by calendar event ID
 *   - Retrieve transcripts post-meeting via webhook or polling
 *
 * For now, "inviting the notetaker" is handled directly by adding
 * fred@fireflies.ai as a calendar attendee inside confirmAndRelease()
 * (lib/services/calendar.ts). This file provides the webhook handler
 * data structures and the mock transcript generator used by the webhook.
 */

export interface FirefliesTranscript {
  fireflies_id: string
  title: string
  summary: string
  action_items: string[]
  full_transcript: Array<{
    speaker: string
    text: string
    start_time: number   // seconds
  }>
  retrieved_at: string
}

/**
 * Generates a deterministic mock transcript for a given application.
 * Used by the /api/webhook/fireflies endpoint to populate the transcripts table.
 */
export function generateMockTranscript(
  applicationId: string,
  candidateName: string,
  jobTitle: string
): FirefliesTranscript {
  const firefliesId = `mock_ff_${applicationId.slice(0, 8)}`

  return {
    fireflies_id: firefliesId,
    title: `Interview — ${candidateName} for ${jobTitle}`,
    summary: `${candidateName} demonstrated strong technical depth during the interview for the ${jobTitle} role. Discussion covered system design, past projects, and cultural fit. Candidate asked thoughtful questions about team structure and roadmap.`,
    action_items: [
      'Send candidate take-home assessment (if applicable)',
      'Schedule debrief with hiring panel',
      'Check references if candidate advances',
    ],
    full_transcript: [
      { speaker: 'Interviewer', text: `Thanks for joining us today, ${candidateName}. Let's start with your background.`, start_time: 0 },
      { speaker: candidateName, text: `Thanks for having me! I'm excited about the ${jobTitle} opportunity. I've spent the last few years working on distributed systems...`, start_time: 12 },
      { speaker: 'Interviewer', text: 'Can you walk me through a technically challenging project you led?', start_time: 45 },
      { speaker: candidateName, text: 'Sure — at my last company I designed a real-time event pipeline processing 500k events/sec...', start_time: 55 },
      { speaker: 'Interviewer', text: 'How did you handle backpressure and consumer lag?', start_time: 120 },
      { speaker: candidateName, text: 'We used adaptive batching and a circuit-breaker pattern. Let me walk through the architecture...', start_time: 130 },
      { speaker: 'Interviewer', text: 'Impressive. Any questions for us before we wrap up?', start_time: 2580 },
      { speaker: candidateName, text: "Yes — what does the on-call rotation look like, and how does the team approach incident post-mortems?", start_time: 2588 },
    ],
    retrieved_at: new Date().toISOString(),
  }
}
