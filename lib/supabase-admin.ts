import { createClient } from '@supabase/supabase-js'

// Server-only client with service role key — bypasses RLS for admin operations.
// Never import this in client components or expose to the browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey || serviceRoleKey === 'your-service-role-key-here') {
    // Fallback to anon key during development if service role key is not set.
    // WARNING: In production, RLS will block admin reads without the service role key.
    console.warn(
      '[supabase-admin] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. Admin reads may be blocked by RLS.'
    )
    return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
