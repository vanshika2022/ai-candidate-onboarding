/**
 * scripts/reset.ts
 * ────────────────
 * Resets pipeline state so you can re-test the full flow:
 *   feedback → offer generation → send → sign → Slack DM
 *
 * What it does:
 *   1. Deletes all pending_slack_messages (clears idempotency)
 *   2. Deletes all offer_letters
 *   3. Deletes all interview_feedback
 *   4. Resets interviewed/offer_sent/hired candidates back to "interviewed"
 *
 * What it does NOT touch:
 *   - Candidates, jobs, transcripts, enrichment data, AI scores
 *   - You keep all screening + enrichment results
 *
 * Usage:
 *   npx tsx scripts/reset.ts
 *   — or —
 *   npm run reset
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local manually (no dotenv dependency)
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env.local not found — rely on existing env vars
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function reset() {
  console.log('🔄 Resetting pipeline for re-testing...\n')

  // 1. Clear Slack idempotency
  const { count: slackCount } = await supabase
    .from('pending_slack_messages')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete all
    .select('*')
  console.log(`  ✓ Cleared pending_slack_messages (${slackCount ?? 0} rows)`)

  // 2. Delete all offers
  const { count: offerCount } = await supabase
    .from('offer_letters')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select('*')
  console.log(`  ✓ Cleared offer_letters (${offerCount ?? 0} rows)`)

  // 3. Delete all feedback
  const { count: feedbackCount } = await supabase
    .from('interview_feedback')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select('*')
  console.log(`  ✓ Cleared interview_feedback (${feedbackCount ?? 0} rows)`)

  // 4. Reset candidates that advanced past "interviewed" back to "interviewed"
  const { count: resetCount } = await supabase
    .from('applications')
    .update({ status: 'interviewed', admin_override_note: null })
    .in('status', ['offer_sent', 'hired'])
    .select('*')
  console.log(`  ✓ Reset ${resetCount ?? 0} applications back to "interviewed"`)

  console.log('\n✅ Reset complete! You can now re-test:')
  console.log('   1. Submit interview feedback (rating + comments)')
  console.log('   2. Generate offer letter')
  console.log('   3. Send offer to candidate')
  console.log('   4. Sign offer at /sign/[offer-id]')
  console.log('   5. Slack DM sends (or queues if not in workspace)')
  console.log('')
  console.log('   To re-seed all demo data:  npm run seed')
}

reset().catch((err) => {
  console.error('Reset failed:', err)
  process.exit(1)
})
