import { redirect } from 'next/navigation'

/**
 * /careers → redirects to /jobs (the candidate-facing job board).
 * Both URLs are documented in CLAUDE.md; /careers is the canonical name
 * from the system architecture spec.
 */
export default function CareersPage() {
  redirect('/jobs')
}
