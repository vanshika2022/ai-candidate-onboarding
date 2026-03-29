# Role-Based Access Control — Production Design

## Why This Matters

The current system uses two separate UIs with a shared bearer token protecting the admin side.
This is the correct trade-off for a prototype — it lets us validate the full pipeline without
building auth infrastructure first. Production requires proper role separation for security,
compliance, and usability.

The three problems a shared bearer token cannot solve:
1. **Auditing** — you can't tell which human made which decision when all admins share one token
2. **Least-privilege** — an interviewer shouldn't see salary data or have the ability to reject candidates
3. **Candidate data isolation** — a hiring manager at one company must never see another company's data (multi-tenant future)

---

## Three Roles

### Candidate

| Attribute | Detail |
|---|---|
| Access | `/careers`, `/jobs`, `/jobs/[id]`, `/sign/[id]`, `/portal/[applicationId]` only |
| Auth | Magic link via email — no password required |
| Cannot see | AI scores, other candidates, admin data, salary details of other candidates |
| Token | JWT with `role: 'candidate'` and `candidate_id` claim; short-lived (1 hour), refreshed silently |

Candidates should only ever interact with public-facing pages. They never see the admin dashboard,
AI scores, or other candidates' profiles. The `/sign/[id]` and `/portal/[id]` pages are
already effectively access-controlled by unguessable UUIDs in the URL — RBAC adds a session
check as a second factor.

---

### Interviewer

| Attribute | Detail |
|---|---|
| Access | Restricted admin view — only candidates assigned to them |
| Can do | View candidate profile, view transcript, submit structured feedback form |
| Cannot do | Shortlist, reject, send offers, see AI scores, see unassigned candidates |
| Auth | SSO via company Google Workspace or Slack OAuth |
| Token | JWT with `role: 'interviewer'` and `user_id` claim |

Interviewers need just enough access to complete their interview and record feedback.
They must not see the AI score before the interview — it creates anchoring bias.
They see the candidate's name, role, resume, and any pre-interview notes the recruiter left.
After the interview, they submit structured feedback (see Step 5 below).

---

### Hiring Manager / Recruiter

| Attribute | Detail |
|---|---|
| Access | Full admin dashboard — all candidates, all stages |
| Can do | Everything: shortlist, reject, schedule, generate offers, hire, manual override |
| Auth | SSO via company Google Workspace or Slack OAuth |
| Token | JWT with `role: 'hiring_manager'` claim |

This is the current admin role. No functional changes needed — just replace the bearer
token check with a JWT role claim check.

---

## Implementation Plan

### Step 1 — Enable Supabase Auth and add role column

```sql
-- Add role to the auth.users metadata
-- (Supabase stores this in auth.users.raw_app_meta_data)
-- Set via Supabase Admin API or a post-signup hook

-- Role values: 'candidate' | 'interviewer' | 'hiring_manager'
```

In practice, use Supabase's `auth.users.raw_app_meta_data` JSONB column to store role:

```typescript
// Set role when creating/updating a user (server-side only)
await supabase.auth.admin.updateUserById(userId, {
  app_metadata: { role: 'interviewer' },
})
```

JWT claims are derived from `app_metadata` automatically — no custom column needed.

---

### Step 2 — Row Level Security policies per role

```sql
-- Enable RLS on all tables (currently disabled for prototype — see migration 20240101000003)
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts   ENABLE ROW LEVEL SECURITY;

-- Candidates can only see their own application
CREATE POLICY "candidates_own_application" ON applications
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'candidate'
    AND candidate_id = (auth.jwt() ->> 'candidate_id')::uuid
  );

-- Interviewers can only see applications assigned to them
CREATE POLICY "interviewers_assigned_only" ON applications
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'interviewer'
    AND id IN (
      SELECT application_id FROM interviewer_assignments
      WHERE interviewer_id = auth.uid()
    )
  );

-- Hiring managers see everything
CREATE POLICY "hiring_managers_all" ON applications
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'hiring_manager'
  );
```

---

### Step 3 — Middleware in Next.js

Create `middleware.ts` in the project root:

```typescript
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(req: NextRequest) {
  const res  = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const { data: { session } } = await supabase.auth.getSession()
  const role = session?.user?.app_metadata?.role

  const { pathname } = req.nextUrl

  // Admin routes: hiring_manager only
  if (pathname.startsWith('/admin')) {
    if (!session || role !== 'hiring_manager') {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  // Interviewer routes: interviewer or higher
  if (pathname.startsWith('/interviewer')) {
    if (!session || !['interviewer', 'hiring_manager'].includes(role)) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  // Candidate-auth routes: any authenticated user with candidate role
  // /sign/[id] and /portal/[id] stay public (UUID = access token) — no change needed

  return res
}

export const config = {
  matcher: ['/admin/:path*', '/interviewer/:path*'],
}
```

---

### Step 4 — Assignment table for interviewers

```sql
CREATE TABLE interviewer_assignments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  interviewer_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (application_id, interviewer_id)
);

-- Index for fast lookup by interviewer
CREATE INDEX idx_interviewer_assignments_interviewer
  ON interviewer_assignments (interviewer_id);
```

The hiring manager assigns an interviewer from the candidate detail page.
The assignment creates a row here. The interviewer's RLS policy above uses this table.

---

### Step 5 — Interviewer feedback form

After the interview, the interviewer submits structured feedback via a new route `/interviewer/feedback/[applicationId]`.

```sql
CREATE TABLE interview_feedback (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   UUID        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  interviewer_id   UUID        NOT NULL REFERENCES auth.users(id),
  technical_rating INT         CHECK (technical_rating BETWEEN 1 AND 5),
  communication_rating INT     CHECK (communication_rating BETWEEN 1 AND 5),
  notes            TEXT,
  recommendation   TEXT        CHECK (recommendation IN ('proceed', 'reject', 'hold')),
  submitted_at     TIMESTAMPTZ DEFAULT now()
);
```

The hiring manager sees aggregated feedback on the candidate detail page before deciding
whether to generate an offer.

---

## Why We Did Not Build This Now

RBAC adds significant authentication infrastructure before the core pipeline is proven to work.
The correct engineering decision is:

1. Build and validate the full pipeline end-to-end with simplified auth
2. Add RBAC once the pipeline is stable and the team decides to scale

This is not a shortcut — it is the right sequencing. A job queue, multi-tenant isolation, and
proper auth are all second-phase concerns. Building them before the pipeline is validated creates
infrastructure that may need to change when product requirements shift.

---

## Current Security Model

| Route | Protection |
|---|---|
| `/admin/*` | `Authorization: Bearer ADMIN_SECRET` checked in every route handler |
| `/sign/[id]` | Offer UUID in URL — 2^122 entropy, unguessable |
| `/portal/[id]` | Application UUID in URL — same entropy guarantee |
| `/careers`, `/jobs`, `/jobs/[id]` | Public — no auth needed |
| `/api/offers/*`, `/api/transcripts/*` | Bearer token required |
| `/api/offers/[id]/sign` | Public — offer must be in `sent` status; replay prevented by status transition |
| `/api/webhooks/fireflies` | HMAC-SHA256 signature verified on every request |

This is sufficient for a prototype and internal demo. The blast radius of a leaked
`ADMIN_SECRET` is limited to admin operations on this single instance — no production
candidate data, no multi-tenant exposure.

---

## Migration Path from Current to RBAC

The transition does not require a rewrite — it is additive:

1. Add Supabase Auth (no schema changes to application tables)
2. Re-enable RLS (currently disabled in `20240101000003_disable_rls.sql`)
3. Write policies per the templates above
4. Replace `createAdminClient()` calls in candidate-facing routes with `createBrowserClient()`
5. Add `middleware.ts` to protect `/admin`
6. Keep `createAdminClient()` (service role) only in Server Actions and Route Handlers

No existing features break. The pipeline continues to work. Auth is layered on top.
