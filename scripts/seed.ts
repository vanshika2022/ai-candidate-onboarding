/**
 * scripts/seed.ts
 * ───────────────
 * Seeds the database with demo candidates across every pipeline state.
 * Each candidate is designed to showcase specific features and edge cases.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *   — or —
 *   npm run seed
 *
 * Prerequisites:
 *   - Supabase project running with all migrations applied
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *
 * This script is idempotent — running it twice won't create duplicates
 * (candidates are upserted by email, applications by candidate_id + job_id).
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local manually (no dotenv dependency needed)
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
      // Strip surrounding quotes
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

// ─── Helper: past date ──────────────────────────────────────────────────────
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function businessDayFromNow(daysOut: number, hour: number): { start: string; end: string } {
  const d = new Date()
  d.setDate(d.getDate() + daysOut)
  // Skip to Monday if weekend
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  const start = d.toISOString()
  d.setMinutes(45)
  const end = d.toISOString()
  return { start, end }
}

// ─── Jobs ───────────────────────────────────────────────────────────────────
const JOBS = [
  {
    title: 'Senior Software Engineer',
    team: 'Platform',
    location: 'Remote',
    level: 'Senior',
    description: `Build the core infrastructure that powers Niural's global payroll platform. You'll design and implement scalable APIs, work with distributed systems, and collaborate with product to ship features that directly impact how companies pay and manage distributed teams worldwide.

Key responsibilities:
- Design and build RESTful and GraphQL APIs serving 10k+ requests/second
- Own the CI/CD pipeline and deployment infrastructure
- Mentor mid-level engineers and review PRs
- Contribute to system design documents and architectural decisions
- On-call rotation (1 week per quarter)`,
    requirements: `- 5+ years of backend engineering experience
- Proficiency in TypeScript and Node.js
- Experience with PostgreSQL or similar relational databases
- Familiarity with cloud infrastructure (AWS, GCP, or Azure)
- Experience with distributed systems and microservices architecture
- Strong communication skills and ability to work asynchronously
- Nice to have: experience with financial systems, payroll, or compliance`,
    status: 'open',
  },
  {
    title: 'HR Operations Manager',
    team: 'People Ops',
    location: 'Hybrid — San Francisco',
    level: 'Mid-Level',
    description: `Lead HR operations for a fast-growing team distributed across 12 countries. You'll own the employee lifecycle from onboarding through offboarding, manage compliance across jurisdictions, and build scalable people processes that support Niural's growth from 50 to 200 employees.

Key responsibilities:
- Own the full employee onboarding and offboarding workflow
- Manage multi-country compliance (US, Canada, EU, LATAM, APAC)
- Administer benefits programs across all regions
- Partner with legal on employment contracts and local labor law
- Build and maintain the HRIS (BambooHR or similar)`,
    requirements: `- 3+ years in HR operations or people ops
- Experience with multi-country employment compliance
- Familiarity with HRIS platforms (BambooHR, Rippling, or similar)
- Knowledge of US employment law; international experience strongly preferred
- Excellent organizational skills and attention to detail
- Comfortable with ambiguity in a fast-growing startup
- Nice to have: experience at a payroll or HR tech company`,
    status: 'open',
  },
  {
    title: 'Product Designer',
    team: 'Design',
    location: 'Remote',
    level: 'Mid-Level',
    description: `Design the user experience for Niural's payroll and HR management platform. You'll work across the full design lifecycle — research, wireframes, prototypes, and high-fidelity UI — collaborating closely with engineering and product to ship features used by thousands of companies.

Key responsibilities:
- Conduct user research and usability testing with real customers
- Design end-to-end flows for complex financial workflows (payroll runs, tax filing, contractor payments)
- Create and maintain the design system in Figma
- Collaborate with engineering to ensure pixel-perfect implementation
- Present design rationale to stakeholders and incorporate feedback`,
    requirements: `- 3+ years of product design experience (B2B SaaS preferred)
- Strong portfolio demonstrating end-to-end product design process
- Proficiency in Figma (design system experience preferred)
- Experience designing complex data-heavy interfaces
- Understanding of accessibility standards (WCAG 2.1 AA)
- Comfortable with rapid iteration and shipping weekly
- Nice to have: experience with fintech, payroll, or HR products`,
    status: 'open',
  },
]

// ─── Candidates ─────────────────────────────────────────────────────────────
// Each candidate is designed to showcase a specific pipeline state + edge case

const CANDIDATES = [
  // ── 1. REJECTED — Clear mismatch, no enrichment runs ──────────────────
  // Shows: Haiku pre-screen routing to skip, low score, no Tavily/Sonnet spend
  {
    candidate: {
      full_name: 'Jake Morrison',
      email: 'jake.morrison.demo@example.com',
      linkedin_url: 'https://www.linkedin.com/in/jakemorrison-marketing',
      github_url: null, // No GitHub — marketing background
    },
    job_title: 'Senior Software Engineer',
    application: {
      status: 'rejected' as const,
      ai_score: 18,
      ai_rationale: 'Candidate has 6 years in digital marketing and social media management with no software engineering experience. Resume mentions "basic HTML/CSS" but no programming languages, frameworks, or backend experience. Does not meet any of the core technical requirements for this role.',
      ai_brief: 'Marketing professional with 6 years at mid-size agencies. Skills center on campaign management, Google Analytics, and content strategy. Resume mentions "basic HTML/CSS" under additional skills but no programming, databases, or systems experience. Clear role mismatch — this is a marketing profile applied to a senior engineering position. Recommend immediate pass.',
      ai_analysis: {
        potential_bias_flags: [],
      },
      structured_data: {
        skills: ['Google Analytics', 'Social Media Management', 'Content Strategy', 'HTML/CSS basics', 'Mailchimp'],
        years_exp: 6,
        education: ['B.A. Communications, University of Oregon, 2018'],
        employers: ['Sprout Agency (2021–present)', 'MediaVine Digital (2018–2021)'],
        achievements: ['Grew client Instagram following by 300%', 'Managed $2M annual ad budget'],
      },
      resume_text: `Jake Morrison
Digital Marketing Manager

EXPERIENCE
Sprout Agency — Senior Marketing Manager (2021–present)
- Led digital campaigns for 12 B2B SaaS clients
- Managed $2M annual advertising budget across Google Ads and Meta
- Grew organic traffic by 180% through SEO strategy

MediaVine Digital — Marketing Associate (2018–2021)
- Created content calendars for 8 client accounts
- Basic HTML/CSS for landing page edits
- Managed email campaigns via Mailchimp

EDUCATION
B.A. Communications — University of Oregon, 2018

SKILLS
Google Analytics, Meta Business Suite, Mailchimp, Canva, basic HTML/CSS, SEO, Content Strategy`,
      // No enrichment — score < 70
      research_profile: null,
      discrepancy_flags: null,
      has_discrepancies: false,
    },
  },

  // ── 2. PENDING REVIEW — Borderline score, needs human judgment ────────
  // Shows: Score 50-69 routing, career changer edge case, bias flag
  {
    candidate: {
      full_name: 'Priya Chakraborty',
      email: 'priya.chakraborty.demo@example.com',
      linkedin_url: 'https://www.linkedin.com/in/priyachakraborty',
      github_url: 'https://github.com/priya-chakraborty',
    },
    job_title: 'Senior Software Engineer',
    application: {
      status: 'pending_review' as const,
      ai_score: 62,
      ai_rationale: 'Career changer with 3 years of software engineering after 5 years in data science. Strong Python and SQL skills, emerging TypeScript proficiency. Has built production APIs but at smaller scale than required. Solid analytical foundation from data science career could be a differentiator for platform work. Does not fully meet the "5+ years backend" requirement if counting only pure engineering tenure, but total technical experience exceeds 8 years.',
      ai_brief: 'Career changer: 5 years data science at Deloitte, then pivoted to software engineering 3 years ago. Now a mid-level engineer at a Series B startup building Node.js/TypeScript APIs. GitHub shows consistent contribution pattern — 847 contributions in the last year across 6 repos. Strong analytical skills from DS background. Gap: only 3 years of pure engineering, role asks for 5+. But total technical experience is 8+ years and she\'s building exactly the kind of APIs this role requires. Borderline — recommend human review.',
      ai_analysis: {
        potential_bias_flags: [
          'Career changer: 5 years data science experience may be undervalued vs. 5 years pure engineering. Transferable skills (Python, SQL, API design, data modeling) are directly relevant to this role.',
        ],
      },
      structured_data: {
        skills: ['Python', 'TypeScript', 'Node.js', 'PostgreSQL', 'Redis', 'Docker', 'pandas', 'scikit-learn', 'REST APIs'],
        years_exp: 8,
        education: ['M.S. Computer Science, Georgia Tech, 2016', 'B.Tech Information Technology, BITS Pilani, 2014'],
        employers: ['DataStack (2022–present)', 'Deloitte Consulting (2016–2022)'],
        achievements: ['Built real-time data pipeline processing 50k events/sec', 'Led migration from Python monolith to TypeScript microservices', 'Published 2 papers on anomaly detection'],
      },
      resume_text: `Priya Chakraborty
Software Engineer

EXPERIENCE
DataStack Inc. — Software Engineer (2022–present)
- Build and maintain RESTful APIs in Node.js/TypeScript serving 15k req/sec
- Led migration from Python monolith to TypeScript microservices
- Designed PostgreSQL schema for multi-tenant SaaS platform
- Implemented Redis caching layer reducing p95 latency by 60%

Deloitte Consulting — Senior Data Scientist (2016–2022)
- Built ML pipelines in Python for Fortune 500 clients
- Designed ETL workflows processing 50k events/second
- Published 2 papers on anomaly detection in financial transactions
- Led team of 4 data analysts

EDUCATION
M.S. Computer Science — Georgia Tech (Online), 2016
B.Tech Information Technology — BITS Pilani, 2014

SKILLS
TypeScript, Node.js, Python, PostgreSQL, Redis, Docker, Kubernetes, pandas, scikit-learn, REST API design`,
      research_profile: null, // No enrichment at score 62
      discrepancy_flags: null,
      has_discrepancies: false,
    },
  },

  // ── 3. SHORTLISTED — High score, enrichment ran, WITH discrepancy flags ─
  // Shows: Tavily enrichment, discrepancy flags, UNVERIFIABLE distinction,
  //        has_discrepancies=true warning badge, scout findings
  {
    candidate: {
      full_name: 'Marcus Chen',
      email: 'marcus.chen.demo@example.com',
      linkedin_url: 'https://www.linkedin.com/in/marcuschen-eng',
      github_url: 'https://github.com/marcuschen',
    },
    job_title: 'Senior Software Engineer',
    application: {
      status: 'shortlisted' as const,
      ai_score: 82,
      ai_rationale: 'Strong backend engineer with 7 years experience across two well-known companies. Deep TypeScript and Node.js expertise with production-scale distributed systems experience. Meets all core requirements. Discrepancy noted: resume states "Staff Engineer at Datadog (2021–present)" but LinkedIn shows title as "Senior Engineer" — title inflation possible. GitHub profile shows active open source contributions.',
      ai_brief: 'Seven-year backend engineer, currently at Datadog working on their metrics ingestion pipeline. Prior 3 years at Stripe on payment processing APIs. Deep TypeScript, Go, and PostgreSQL. GitHub shows 1,200+ contributions and maintains a popular open-source observability library (340 stars). Key concern: resume says "Staff Engineer" but LinkedIn shows "Senior Engineer" — possible title inflation. Despite the title discrepancy, technical skills and experience level are an excellent match. Strong hire signal with one flag for the recruiter to verify.',
      ai_analysis: {
        potential_bias_flags: [
          'School prestige: candidate attended UC Berkeley (highly ranked CS program). Ensure scoring reflects demonstrated skills and production experience, not institutional reputation.',
          'Employment gap: 3-month gap between Stripe (ended March 2021) and Datadog (started July 2021). This is a normal transition period and should not affect scoring.',
        ],
      },
      structured_data: {
        skills: ['TypeScript', 'Go', 'Node.js', 'PostgreSQL', 'Kafka', 'Kubernetes', 'gRPC', 'Terraform', 'Datadog', 'AWS'],
        years_exp: 7,
        education: ['B.S. Computer Science, UC Berkeley, 2017'],
        employers: ['Datadog (2021–present)', 'Stripe (2017–2021)'],
        achievements: [
          'Designed metrics ingestion pipeline handling 2M data points/second',
          'Open-source observability library with 340+ GitHub stars',
          'Led Stripe payment retry system reducing failed payments by 12%',
        ],
      },
      resume_text: `Marcus Chen
Staff Engineer

EXPERIENCE
Datadog — Staff Engineer (2021–present)
- Architect of metrics ingestion pipeline processing 2M data points/second
- Led team of 6 engineers on next-gen query engine
- Designed gRPC service mesh reducing inter-service latency by 40%

Stripe — Backend Engineer (2017–2021)
- Built payment retry system reducing failed payments by 12%
- Owned TypeScript SDK used by 50k+ merchants
- On-call for payment processing infrastructure (99.999% uptime)

OPEN SOURCE
- otel-ts-utils: TypeScript OpenTelemetry utilities (340+ stars)
- Published 4 blog posts on distributed tracing

EDUCATION
B.S. Computer Science — UC Berkeley, 2017`,
      research_profile: {
        linkedin_summary: 'LinkedIn profile found for Marcus Chen. Title shows "Senior Software Engineer at Datadog" (not "Staff Engineer" as stated on resume). Profile shows 500+ connections, endorsements for TypeScript, Go, and distributed systems. Employment history: Stripe (2017-2021) as "Software Engineer", Datadog (2021-present) as "Senior Software Engineer". Education: UC Berkeley BS Computer Science 2017 — matches resume.',
        github_summary: 'GitHub profile @marcuschen found. 1,247 contributions in the last year. Top repositories: otel-ts-utils (TypeScript, 342 stars, 67 forks — OpenTelemetry utilities library), metrics-bench (Go, 89 stars — benchmarking framework for time-series databases). Primary languages: TypeScript (48%), Go (31%), Python (12%). Member since 2015. Active contributor to the OpenTelemetry JS project.',
        x_findings: 'No X/Twitter account found matching this candidate.',
      },
      discrepancy_flags: [
        'Resume states "Staff Engineer at Datadog" but LinkedIn shows title as "Senior Software Engineer at Datadog" — possible title inflation.',
        'Resume states role at Stripe was "Backend Engineer" but LinkedIn shows "Software Engineer" — minor title variation.',
        'UNVERIFIABLE: No X/Twitter profile found to corroborate technical community involvement.',
      ],
      has_discrepancies: true,
      shortlisted_at: daysAgo(3),
    },
  },

  // ── 4. SLOTS HELD — Waiting for candidate to pick a slot ──────────────
  // Shows: Calendar hold & release, portal page with 5 slots,
  //        48-hour nudge scenario, tentative_slots JSONB
  {
    candidate: {
      full_name: 'Sarah Kim',
      email: 'sarah.kim.demo@example.com',
      linkedin_url: 'https://www.linkedin.com/in/sarahkim-swe',
      github_url: 'https://github.com/sarahkim',
    },
    job_title: 'Senior Software Engineer',
    application: {
      status: 'slots_held' as const,
      ai_score: 88,
      ai_rationale: 'Exceptional match. 6 years of backend engineering with deep TypeScript and distributed systems expertise. Currently at Vercel building edge runtime infrastructure — directly relevant to platform engineering. Strong open-source track record and conference speaking experience. Exceeds all core requirements.',
      ai_brief: 'Six-year backend engineer, currently at Vercel on the edge runtime team. Previously at Cloudflare Workers for 3 years. Deep expertise in TypeScript, Rust, and distributed systems at the edge. 2,100+ GitHub contributions, maintains a popular middleware framework. Conference speaker at NodeConf and ViteConf. Every requirement met or exceeded. Top-tier candidate — fast-track to scheduling.',
      ai_analysis: { potential_bias_flags: [] },
      structured_data: {
        skills: ['TypeScript', 'Rust', 'Node.js', 'PostgreSQL', 'Cloudflare Workers', 'Vercel Edge', 'WebAssembly', 'Docker'],
        years_exp: 6,
        education: ['M.S. Computer Science, Stanford University, 2018'],
        employers: ['Vercel (2021–present)', 'Cloudflare (2018–2021)'],
        achievements: [
          'Architected Vercel edge middleware runtime serving 1B+ requests/day',
          'Speaker at NodeConf 2023 and ViteConf 2024',
          'Maintains open-source middleware framework (1.2k stars)',
        ],
      },
      resume_text: `Sarah Kim
Senior Software Engineer

EXPERIENCE
Vercel — Senior Engineer, Edge Runtime (2021–present)
- Architect of edge middleware runtime handling 1B+ daily requests
- Designed V8 isolate pooling reducing cold start by 65%
- Core contributor to Next.js server components RFC

Cloudflare — Software Engineer, Workers (2018–2021)
- Built TypeScript SDK for Cloudflare Workers
- Implemented WebAssembly module loading for edge functions

EDUCATION
M.S. Computer Science — Stanford University, 2018
B.S. Computer Engineering — University of Michigan, 2016

SPEAKING
NodeConf 2023 — "Edge-First Architecture Patterns"
ViteConf 2024 — "Build Tools for the Edge"`,
      research_profile: {
        linkedin_summary: 'LinkedIn profile confirmed. Title: "Senior Software Engineer at Vercel" — matches resume. 800+ connections, extensive endorsements for TypeScript, distributed systems, and edge computing. Employment history matches resume exactly.',
        github_summary: 'GitHub @sarahkim confirmed. 2,147 contributions in the last year. Top repo: edge-mw (TypeScript, 1,243 stars) — middleware framework for edge runtimes. Active contributor to vercel/next.js and cloudflare/workers-sdk. Languages: TypeScript (72%), Rust (18%), JavaScript (8%).',
        x_findings: 'Active X/Twitter account (@sarahkim_dev). Posts about edge computing, TypeScript, and conference talks. 4,200 followers. Consistent with professional profile.',
      },
      discrepancy_flags: [],
      has_discrepancies: false,
      shortlisted_at: daysAgo(2),
      // 5 tentative slots for the portal demo
      tentative_slots: [
        { eventId: 'demo_slot_1', ...businessDayFromNow(2, 9) },
        { eventId: 'demo_slot_2', ...businessDayFromNow(2, 14) },
        { eventId: 'demo_slot_3', ...businessDayFromNow(3, 10) },
        { eventId: 'demo_slot_4', ...businessDayFromNow(4, 11) },
        { eventId: 'demo_slot_5', ...businessDayFromNow(5, 15) },
      ],
    },
  },

  // ── 5. INTERVIEWED — Transcript present, feedback submitted, ready for offer
  // Shows: Mock transcript, interview feedback gate, offer form unlocked
  {
    candidate: {
      full_name: 'Alex Rivera',
      email: 'alex.rivera.demo@example.com',
      linkedin_url: 'https://www.linkedin.com/in/alexrivera-fullstack',
      github_url: 'https://github.com/arivera-dev',
    },
    job_title: 'Senior Software Engineer',
    application: {
      status: 'interviewed' as const,
      ai_score: 91,
      ai_rationale: 'Outstanding candidate. 8 years of full-stack experience with a strong backend focus. Currently leading a team of 5 at a Series C fintech. Deep expertise in TypeScript, Node.js, and PostgreSQL with production experience in financial systems — directly relevant to Niural\'s payroll platform. Exceeds all requirements.',
      ai_brief: 'Eight-year engineer, currently tech lead at PayFlow (Series C fintech) managing a team of 5. Prior 4 years at Square on merchant payment APIs. Deep TypeScript/Node.js/PostgreSQL stack with production financial systems experience — rare combination for this role. Built PCI-compliant payment processing pipeline handling $2B annual volume. Open-source contributor, clean GitHub history. No flags. This is the strongest engineering candidate in the pipeline.',
      ai_analysis: { potential_bias_flags: [] },
      structured_data: {
        skills: ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Redis', 'AWS', 'Terraform', 'GraphQL', 'PCI DSS'],
        years_exp: 8,
        education: ['B.S. Computer Science, MIT, 2016'],
        employers: ['PayFlow (2020–present)', 'Square (2016–2020)'],
        achievements: [
          'Built PCI-compliant payment pipeline processing $2B annual volume',
          'Led migration to event-driven architecture reducing system downtime by 95%',
          'Promoted from IC to tech lead managing 5 engineers',
        ],
      },
      resume_text: `Alex Rivera
Tech Lead / Senior Software Engineer

EXPERIENCE
PayFlow — Tech Lead (2020–present)
- Lead team of 5 engineers on core payment processing platform
- Designed PCI-compliant pipeline handling $2B annual transaction volume
- Architected event-driven system (Kafka) reducing downtime by 95%
- Migrated monolith to TypeScript microservices over 6 months

Square — Software Engineer (2016–2020)
- Built merchant onboarding APIs used by 500k+ businesses
- Implemented real-time fraud detection scoring system
- Contributed to Square's open-source Go SDK

EDUCATION
B.S. Computer Science — MIT, 2016

SKILLS
TypeScript, Node.js, React, PostgreSQL, Redis, Kafka, AWS, Terraform, GraphQL, PCI DSS compliance`,
      research_profile: {
        linkedin_summary: 'LinkedIn confirmed. Tech Lead at PayFlow since 2020, Square 2016-2020. All titles and dates match resume exactly. 600+ connections with strong fintech network. Endorsements for TypeScript, distributed systems, payment processing.',
        github_summary: 'GitHub @arivera-dev confirmed. 1,800+ contributions. Maintains payflow-sdk (TypeScript, 220 stars). Active contributions to square/connect-api-specification. Clean commit history with descriptive messages.',
        x_findings: 'Minimal X/Twitter presence. Account exists but last post was 8 months ago. Not a red flag — many senior engineers are not active on social media.',
      },
      discrepancy_flags: [],
      has_discrepancies: false,
      shortlisted_at: daysAgo(7),
      interview_link: 'https://meet.google.com/demo-interview-link',
    },
    // Transcript and feedback added separately
    transcript: {
      fireflies_id: 'mock_alex_rivera',
      summary: 'Strong technical interview. Candidate demonstrated deep knowledge of distributed systems, payment processing architecture, and team leadership. Discussed a complex migration from monolith to microservices with specific technical details. Showed strong communication skills when explaining trade-offs. Answered system design question on real-time payment reconciliation with a novel approach using event sourcing. Cultural fit indicators were positive — asked thoughtful questions about team structure and engineering culture.',
      full_transcript: [
        { speaker: 'Interviewer (Jordan)', text: 'Thanks for joining, Alex. Let\'s start with your current role at PayFlow. Can you walk me through the payment processing pipeline you built?', timestamp: 0 },
        { speaker: 'Alex Rivera', text: 'Sure. When I joined PayFlow, we had a Python monolith handling all payment processing. The first thing I did was map the critical path — authorization, capture, settlement — and identify where failures were cascading.', timestamp: 15 },
        { speaker: 'Alex Rivera', text: 'We migrated to an event-driven architecture using Kafka. Each step in the payment flow is a separate service that publishes events. If capture fails, the event goes to a dead letter queue and we retry with exponential backoff. This reduced our downtime from about 4 hours per month to under 15 minutes.', timestamp: 45 },
        { speaker: 'Interviewer (Jordan)', text: 'How did you handle PCI compliance during the migration? That\'s usually where things get complicated.', timestamp: 90 },
        { speaker: 'Alex Rivera', text: 'Great question. We isolated the cardholder data environment into its own VPC with no internet egress. Only the tokenization service touches raw card numbers — everything downstream works with tokens. We passed our PCI DSS Level 1 audit on the first attempt after migration.', timestamp: 105 },
        { speaker: 'Interviewer (Priya)', text: 'I want to shift to system design. How would you design a real-time payment reconciliation system that handles discrepancies between our records and the bank\'s records?', timestamp: 150 },
        { speaker: 'Alex Rivera', text: 'I\'d use an event sourcing approach. Every transaction state change is an immutable event. The reconciliation service replays our event log against the bank\'s daily settlement file. Discrepancies are categorized — timing differences versus actual mismatches — because most "discrepancies" are just transactions that haven\'t settled yet.', timestamp: 170 },
        { speaker: 'Alex Rivera', text: 'For the real mismatches, I\'d build an alert pipeline that escalates based on dollar amount. Under $100 goes to automated resolution. Over $100 gets a human review with full event history attached. We built something similar at PayFlow and it reduced manual reconciliation work by 80%.', timestamp: 210 },
        { speaker: 'Interviewer (Jordan)', text: 'Tell me about a time you had a disagreement with your team about a technical decision.', timestamp: 270 },
        { speaker: 'Alex Rivera', text: 'When we were choosing between Kafka and RabbitMQ for the event system, I advocated for Kafka but my lead engineer wanted RabbitMQ because the team already knew it. Instead of pushing back, I built a proof of concept with both. Kafka handled our throughput requirements with 3 brokers versus 8 RabbitMQ nodes. The data made the decision, not the argument.', timestamp: 290 },
        { speaker: 'Interviewer (Priya)', text: 'How do you approach mentoring junior engineers?', timestamp: 360 },
        { speaker: 'Alex Rivera', text: 'I do weekly 1:1s focused on their growth areas, not status updates. For code reviews, I try to explain the "why" behind my suggestions rather than just saying "change this." I also pair program on complex features — the first time they see a new pattern, we build it together. Second time, they build and I review.', timestamp: 375 },
        { speaker: 'Interviewer (Jordan)', text: 'Any questions for us about Niural?', timestamp: 450 },
        { speaker: 'Alex Rivera', text: 'Yes — how does the engineering team handle on-call? And what does the deployment pipeline look like? I\'m curious about how much autonomy individual engineers have over shipping features.', timestamp: 460 },
        { speaker: 'Interviewer (Priya)', text: 'Great questions. We do week-long on-call rotations, about once per quarter per engineer. Deployments are automated via GitHub Actions — merge to main triggers staging, then production after smoke tests pass. Engineers own their features end-to-end including deployment.', timestamp: 480 },
        { speaker: 'Alex Rivera', text: 'That sounds very aligned with how I like to work. I appreciate the autonomy aspect — at PayFlow I pushed hard for that model and it significantly improved our shipping velocity.', timestamp: 530 },
      ],
    },
    feedback: {
      rating: 5,
      comments: 'Exceptional candidate. Deep technical expertise in payment systems — directly relevant to our payroll platform. System design answer on reconciliation was the best I\'ve seen in 20+ interviews. Strong leadership skills, data-driven decision maker (Kafka vs RabbitMQ story was excellent). Mentoring approach is mature. Cultural fit is strong — asked the right questions about autonomy and deployment. Strong hire recommendation.',
    },
  },

  // ── 6. OFFER SENT — Offer generated, waiting for candidate signature ──
  // Shows: Offer letter HTML, signing page, pending signature state
  {
    candidate: {
      full_name: 'Elena Vasquez',
      email: 'elena.vasquez.demo@example.com',
      linkedin_url: 'https://www.linkedin.com/in/elenavasquez-ops',
      github_url: null, // HR role — no GitHub expected
    },
    job_title: 'HR Operations Manager',
    application: {
      status: 'offer_sent' as const,
      ai_score: 85,
      ai_rationale: 'Strong HR operations professional with 5 years experience across multi-country compliance. Currently managing HR for a 150-person company distributed across 8 countries. Deep knowledge of US employment law with practical international experience. Meets all core requirements and has the startup experience that is a strong plus.',
      ai_brief: 'Five-year HR ops professional, currently Head of People Ops at a 150-person remote-first startup operating in 8 countries. Prior 2 years at Deel (competitor context — she knows the EOR/payroll space). Manages BambooHR, Rippling, and local payroll providers across US, Canada, UK, Germany, and Brazil. Strong compliance knowledge. Has built onboarding processes from scratch twice. The Deel experience means she understands our product space deeply. Recommend fast-tracking.',
      ai_analysis: { potential_bias_flags: [] },
      structured_data: {
        skills: ['Multi-country compliance', 'BambooHR', 'Rippling', 'US Employment Law', 'GDPR', 'Benefits Administration', 'Onboarding Design'],
        years_exp: 5,
        education: ['MBA, NYU Stern, 2019', 'B.A. Psychology, UCLA, 2017'],
        employers: ['RemoteFirst Inc. (2021–present)', 'Deel (2019–2021)'],
        achievements: [
          'Built onboarding program reducing new hire ramp time from 6 weeks to 3',
          'Managed compliance across 8 countries with zero audit findings',
          'Implemented BambooHR + Rippling integration for 150-person org',
        ],
      },
      resume_text: `Elena Vasquez
Head of People Operations

EXPERIENCE
RemoteFirst Inc. — Head of People Ops (2021–present)
- Manage HR operations for 150-person distributed team across 8 countries
- Own compliance for US, Canada, UK, Germany, Brazil, Mexico, India, Philippines
- Built onboarding program reducing ramp time from 6 weeks to 3 weeks
- Administer BambooHR (HRIS) and Rippling (payroll/benefits)

Deel — HR Operations Specialist (2019–2021)
- Managed employee lifecycle for internal team during hypergrowth (20→200)
- Handled multi-country contractor compliance in LATAM and APAC
- Built first version of internal onboarding playbook

EDUCATION
MBA — NYU Stern School of Business, 2019
B.A. Psychology — UCLA, 2017`,
      research_profile: {
        linkedin_summary: 'LinkedIn confirmed. Head of People Ops at RemoteFirst Inc. since 2021, Deel 2019-2021. Titles and dates match. 450+ connections with strong HR/People Ops network. Active poster about remote work and international employment.',
        github_summary: 'No GitHub profile found — expected for an HR operations role.',
        x_findings: 'UNVERIFIABLE: No X/Twitter account found matching this candidate.',
      },
      discrepancy_flags: [
        'UNVERIFIABLE: No X/Twitter presence found to corroborate professional activity.',
      ],
      has_discrepancies: false, // UNVERIFIABLE doesn't count
      shortlisted_at: daysAgo(10),
      interview_link: 'https://meet.google.com/demo-hr-interview',
    },
    transcript: {
      fireflies_id: 'mock_elena_vasquez',
      summary: 'Excellent interview. Candidate demonstrated deep knowledge of multi-country compliance, strong process design skills, and relevant industry experience from Deel. Discussed specific challenges of managing HR across 8 countries with practical solutions. Cultural fit was strong — asked insightful questions about Niural\'s growth plans and HR tech stack.',
      full_transcript: [
        { speaker: 'Interviewer (Maya)', text: 'Elena, tell me about your experience managing HR compliance across multiple countries.', timestamp: 0 },
        { speaker: 'Elena Vasquez', text: 'At RemoteFirst, we operate in 8 countries. The biggest challenge is that employment law varies dramatically — Germany requires works council consultation for terminations, Brazil has mandatory 13th salary, and US at-will employment is unique globally. I built a compliance checklist per country that our legal team reviews quarterly.', timestamp: 15 },
        { speaker: 'Elena Vasquez', text: 'What I learned at Deel was to start with the employment contract. If the contract is right, 80% of compliance issues are prevented. We use country-specific templates reviewed by local counsel in each jurisdiction.', timestamp: 60 },
        { speaker: 'Interviewer (Maya)', text: 'How do you handle onboarding for someone in a country where you don\'t have an entity?', timestamp: 120 },
        { speaker: 'Elena Vasquez', text: 'That\'s the EOR question. At RemoteFirst we use Deel and Remote.com as EOR providers for countries where we don\'t have entities. I manage the relationship and make sure the employee experience is consistent regardless of their employment structure. They should feel like a RemoteFirst employee, not a contractor of a third-party provider.', timestamp: 135 },
      ],
    },
    feedback: {
      rating: 4,
      comments: 'Strong candidate with directly relevant experience. Deep compliance knowledge across multiple countries. Deel background is a significant plus — she understands our space. Onboarding process design skills are exactly what we need. Slightly concerned about managing at Niural\'s scale (we\'re smaller than her current company), but her Deel experience at the 20-person stage addresses this. Recommend offer.',
    },
    offer: {
      status: 'sent',
      html_content: `<!DOCTYPE html>
<html>
<head><style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:20px;color:#1a1a1a;line-height:1.7}h1{font-size:24px;color:#1e293b;border-bottom:2px solid #4f46e5;padding-bottom:12px}h2{font-size:18px;color:#334155;margin-top:32px}.highlight{background:#f0f0ff;border-left:4px solid #4f46e5;padding:16px;margin:20px 0;border-radius:0 8px 8px 0}.signature-block{margin-top:48px;border-top:1px solid #e2e8f0;padding-top:24px}.personal-note{font-style:italic;color:#475569;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:24px 0}</style></head>
<body>
<h1>Offer of Employment — Niural</h1>

<p>Dear Elena,</p>

<p>On behalf of the entire team at Niural, I am thrilled to extend this offer of employment. Your experience building HR operations across 8 countries and your deep understanding of the EOR/payroll landscape make you an exceptional fit for this role.</p>

<div class="personal-note">
<strong>A note from your interview:</strong> Your interviewer noted your "deep compliance knowledge across multiple countries" and highlighted that your experience at Deel gives you a unique understanding of our product space. We believe your process design skills — particularly the onboarding program that cut ramp time in half — will directly accelerate our team's growth.
</div>

<h2>Position Details</h2>
<div class="highlight">
<p><strong>Title:</strong> HR Operations Manager</p>
<p><strong>Team:</strong> People Ops</p>
<p><strong>Location:</strong> Hybrid — San Francisco</p>
<p><strong>Start Date:</strong> April 21, 2026</p>
<p><strong>Reporting To:</strong> VP of People</p>
</div>

<h2>Compensation</h2>
<div class="highlight">
<p><strong>Base Salary:</strong> $145,000 USD per year</p>
<p><strong>Equity:</strong> 0.15% stock options (4-year vest, 1-year cliff)</p>
<p><strong>Signing Bonus:</strong> $10,000 USD</p>
</div>

<h2>Benefits</h2>
<ul>
<li>Comprehensive medical, dental, and vision insurance</li>
<li>Unlimited PTO with a 3-week minimum</li>
<li>$2,500 annual learning and development budget</li>
<li>$1,000 home office setup stipend</li>
<li>401(k) with 4% company match</li>
<li>12 weeks paid parental leave</li>
</ul>

<h2>Next Steps</h2>
<p>Please review and sign this offer by <strong>April 7, 2026</strong>. If you have any questions, please don't hesitate to reach out.</p>

<p>We're excited about the possibility of you joining Niural. Your expertise in building people operations from the ground up is exactly what we need as we scale globally.</p>

<div class="signature-block">
<p><strong>Maya Chen</strong><br>VP of People, Niural</p>
</div>
</body>
</html>`,
    },
  },

  // ── 7. HIRED — Full pipeline complete, Slack onboarding triggered ─────
  // Shows: Signed offer, signature data, hired status, Slack DM queued
  {
    candidate: {
      full_name: 'Jordan Okafor',
      email: 'jordan.okafor.demo@example.com',
      linkedin_url: 'https://www.linkedin.com/in/jordanokafor-design',
      github_url: null, // Product Designer — no GitHub
    },
    job_title: 'Product Designer',
    application: {
      status: 'hired' as const,
      ai_score: 79,
      ai_rationale: 'Solid product designer with 4 years experience in B2B SaaS. Strong portfolio showing end-to-end design process from research through high-fidelity UI. Experience with data-heavy interfaces is directly relevant. Figma design system experience is a plus. Minor gap: no fintech-specific experience, but B2B SaaS dashboard work is transferable.',
      ai_brief: 'Four-year product designer, currently at Notion designing the enterprise admin dashboard. Prior 2 years at Airtable on the data visualization team. Strong Figma skills with design system experience. Portfolio shows complex data-heavy interfaces — tables, charts, multi-step workflows — directly relevant to payroll UI. No fintech experience but the patterns transfer. WCAG 2.1 AA compliance experience noted. Good match with one transferability gap.',
      ai_analysis: { potential_bias_flags: [] },
      structured_data: {
        skills: ['Figma', 'Design Systems', 'User Research', 'Prototyping', 'WCAG 2.1', 'Data Visualization', 'Usability Testing'],
        years_exp: 4,
        education: ['B.F.A. Interaction Design, SVA, 2020'],
        employers: ['Notion (2022–present)', 'Airtable (2020–2022)'],
        achievements: [
          'Designed Notion enterprise admin dashboard used by 5,000+ companies',
          'Led design system migration reducing component inconsistencies by 70%',
          'Conducted 40+ user interviews for Airtable data viz redesign',
        ],
      },
      resume_text: `Jordan Okafor
Product Designer

EXPERIENCE
Notion — Senior Product Designer (2022–present)
- Designed enterprise admin dashboard used by 5,000+ companies
- Led design system migration to new Figma component library
- Conducted bi-weekly usability testing sessions with enterprise customers

Airtable — Product Designer (2020–2022)
- Designed data visualization features (charts, pivot tables, dashboards)
- Led redesign of form builder improving completion rates by 35%
- Established WCAG 2.1 AA compliance review process

EDUCATION
B.F.A. Interaction Design — School of Visual Arts, 2020

PORTFOLIO
notion.so/jordanokafor-portfolio`,
      research_profile: {
        linkedin_summary: 'LinkedIn confirmed. Senior Product Designer at Notion since 2022, Airtable 2020-2022. All dates match resume. 350+ connections, strong design community network. Active poster about design systems and accessibility.',
        github_summary: 'No GitHub profile — expected for a product design role.',
        x_findings: 'Active Dribbble profile with 28 shots. Behance portfolio consistent with resume projects. No X/Twitter account found.',
      },
      discrepancy_flags: [],
      has_discrepancies: false,
      shortlisted_at: daysAgo(14),
      interview_link: 'https://meet.google.com/demo-design-interview',
    },
    transcript: {
      fireflies_id: 'mock_jordan_okafor',
      summary: 'Good interview focused on design process and portfolio review. Candidate walked through their Notion admin dashboard project in detail — from user research through final implementation. Strong understanding of accessibility and design systems. Discussed approach to designing complex financial workflows.',
      full_transcript: [
        { speaker: 'Interviewer (Sam)', text: 'Jordan, walk me through your design process for the Notion enterprise dashboard.', timestamp: 0 },
        { speaker: 'Jordan Okafor', text: 'I started with 12 interviews with enterprise admins to understand their pain points. The biggest insight was that they needed to see billing, team management, and usage analytics in one view — not three separate pages. I designed a modular dashboard where admins could customize which widgets they see based on their role.', timestamp: 15 },
        { speaker: 'Jordan Okafor', text: 'For the design system, I built all components to WCAG 2.1 AA standards from day one. That\'s not something you bolt on later — it has to be foundational. Every color contrast, focus state, and screen reader label was part of the component spec.', timestamp: 75 },
      ],
    },
    feedback: {
      rating: 4,
      comments: 'Strong designer with relevant B2B SaaS experience. Notion admin dashboard project demonstrates ability to handle complex, data-heavy interfaces. Accessibility-first mindset is impressive. No fintech experience but the pattern library transfers well. Design process is mature — research-driven, systematic, iterative. Recommend offer.',
    },
    offer: {
      status: 'signed',
      html_content: `<!DOCTYPE html><html><body><h1>Offer of Employment — Niural</h1><p>Dear Jordan,</p><p>We are delighted to offer you the position of Product Designer on the Design team at Niural...</p><p><strong>Base Salary:</strong> $135,000 USD</p><p><strong>Equity:</strong> 0.10% stock options</p><p><strong>Start Date:</strong> April 14, 2026</p></body></html>`,
      signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      signed_at: daysAgo(1),
      signer_ip: '73.162.214.93',
    },
    slack_message: {
      candidate_email: 'jordan.okafor.demo@example.com',
      message: 'Hey Jordan! Welcome to Niural — we\'re so excited to have you on the Design team! Your start date is April 14, and you\'ll be reporting to Sam Torres (VP of Design). Before your first day: check your email for onboarding docs, join #general here in Slack, and feel free to introduce yourself. If you have any questions before day one, don\'t hesitate to reach out. Looking forward to working together!',
    },
  },

  // ── 8. MANUAL REVIEW REQUIRED — Scanned PDF, extraction failed ────────
  // Shows: Low text density edge case, manual_review_required status,
  //        no AI score (null), resume still uploaded for human review
  {
    candidate: {
      full_name: 'David Park',
      email: 'david.park.demo@example.com',
      linkedin_url: 'https://www.linkedin.com/in/davidpark-pm',
      github_url: null,
    },
    job_title: 'Product Designer',
    application: {
      status: 'manual_review_required' as const,
      ai_score: null,
      ai_rationale: 'Resume extraction produced insufficient text (< 200 characters). The uploaded file appears to be a scanned image PDF without OCR text layer. The resume binary has been preserved in storage for manual review. Please download the original file and review manually.',
      ai_brief: null,
      ai_analysis: null,
      structured_data: null,
      resume_text: 'David Park Product Des', // Simulates failed OCR extraction
      research_profile: null,
      discrepancy_flags: null,
      has_discrepancies: false,
    },
  },

  // ── 9. RESCHEDULE REQUESTED — Candidate asked to change slot ──────────
  // Shows: Reschedule flow, pending_admin status, Haiku preference extraction
  {
    candidate: {
      full_name: 'Mei-Lin Torres',
      email: 'meilin.torres.demo@example.com',
      linkedin_url: 'https://www.linkedin.com/in/meilintorres',
      github_url: 'https://github.com/meilintorres',
    },
    job_title: 'Senior Software Engineer',
    application: {
      status: 'reschedule_requested' as const,
      ai_score: 76,
      ai_rationale: 'Good fit with 5 years of backend experience in TypeScript and Node.js. Currently at a mid-stage startup working on API infrastructure. Meets core requirements. Some gaps in distributed systems experience but demonstrates strong learning trajectory.',
      ai_brief: 'Five-year backend engineer at a Series B developer tools company. TypeScript/Node.js focused with PostgreSQL and Redis experience. Built API gateway handling 200k req/min. No distributed systems at scale yet but strong fundamentals. Education from bootcamp (Hack Reactor) — non-traditional path but 5 years of production experience validates the skills. Good fit, not exceptional.',
      ai_analysis: {
        potential_bias_flags: [
          'Bootcamp graduate: candidate has a non-traditional education path (Hack Reactor 2019, no CS degree). 5 years of production experience at two companies should be evaluated on its own merit, not discounted due to education path.',
        ],
      },
      structured_data: {
        skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Redis', 'Express', 'Docker', 'CI/CD', 'REST APIs'],
        years_exp: 5,
        education: ['Hack Reactor (2019)', 'B.A. Economics, UC Davis, 2018'],
        employers: ['DevToolsCo (2021–present)', 'StartupXYZ (2019–2021)'],
        achievements: [
          'Built API gateway handling 200k requests/minute',
          'Reduced CI/CD pipeline time from 45 min to 8 min',
          'Mentored 3 junior engineers through Hack Reactor alumni network',
        ],
      },
      resume_text: `Mei-Lin Torres
Backend Software Engineer

EXPERIENCE
DevToolsCo — Senior Backend Engineer (2021–present)
- Built API gateway handling 200k requests/minute
- Designed PostgreSQL sharding strategy for multi-tenant platform
- Reduced CI/CD pipeline from 45 min to 8 min via parallelization

StartupXYZ — Software Engineer (2019–2021)
- Full-stack development in TypeScript/React/Node.js
- Built real-time notification system using WebSockets
- Implemented automated testing reducing production bugs by 60%

EDUCATION
Hack Reactor — Software Engineering Immersive, 2019
B.A. Economics — UC Davis, 2018`,
      research_profile: {
        linkedin_summary: 'LinkedIn confirmed. Senior Backend Engineer at DevToolsCo since 2021. StartupXYZ 2019-2021. Titles and dates match. Hack Reactor listed in education — consistent with resume.',
        github_summary: 'GitHub @meilintorres found. 956 contributions in the last year. Several TypeScript repos. Most starred: api-gateway-ts (47 stars). Active and consistent contribution pattern.',
        x_findings: 'UNVERIFIABLE: No X/Twitter account found.',
      },
      discrepancy_flags: [
        'UNVERIFIABLE: No X/Twitter presence found.',
      ],
      has_discrepancies: false,
      shortlisted_at: daysAgo(4),
      reschedule_reason: 'I have a conflict with a medical appointment on the scheduled dates. Would it be possible to reschedule to Monday or Wednesday afternoons after 2 PM?',
      reschedule_status: 'pending_admin',
      tentative_slots: [
        { eventId: 'demo_resched_1', ...businessDayFromNow(1, 10) },
        { eventId: 'demo_resched_2', ...businessDayFromNow(1, 14) },
        { eventId: 'demo_resched_3', ...businessDayFromNow(3, 11) },
        { eventId: 'demo_resched_4', ...businessDayFromNow(4, 9) },
        { eventId: 'demo_resched_5', ...businessDayFromNow(5, 15) },
      ],
    },
  },
]

// ─── Seed function ──────────────────────────────────────────────────────────
async function seed() {
  console.log('🌱 Seeding Niural Scout demo data...\n')

  // ── 1. Upsert jobs ──────────────────────────────────────────────────────
  console.log('📋 Upserting jobs...')
  const jobMap: Record<string, string> = {} // title → id

  for (const job of JOBS) {
    // Check if job with this title already exists
    const { data: existing } = await supabase
      .from('jobs')
      .select('id')
      .eq('title', job.title)
      .maybeSingle()

    if (existing) {
      jobMap[job.title] = existing.id
      console.log(`   ✓ ${job.title} (exists: ${existing.id})`)
    } else {
      const { data, error } = await supabase
        .from('jobs')
        .insert(job)
        .select('id')
        .single()

      if (error) {
        console.error(`   ✗ Failed to insert job "${job.title}":`, error.message)
        continue
      }
      jobMap[job.title] = data.id
      console.log(`   ✓ ${job.title} (created: ${data.id})`)
    }
  }

  // ── 2. Upsert candidates + applications ─────────────────────────────────
  console.log('\n👤 Seeding candidates and applications...')

  for (const entry of CANDIDATES) {
    const { candidate, job_title, application } = entry
    const jobId = jobMap[job_title]

    if (!jobId) {
      console.error(`   ✗ Job "${job_title}" not found — skipping ${candidate.full_name}`)
      continue
    }

    // Upsert candidate by email
    const { data: candidateRow, error: candidateError } = await supabase
      .from('candidates')
      .upsert(candidate, { onConflict: 'email' })
      .select('id')
      .single()

    if (candidateError || !candidateRow) {
      console.error(`   ✗ Failed to upsert candidate "${candidate.full_name}":`, candidateError?.message)
      continue
    }

    // Check for existing application
    const { data: existingApp } = await supabase
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateRow.id)
      .eq('job_id', jobId)
      .maybeSingle()

    const appData: Record<string, unknown> = {
      candidate_id: candidateRow.id,
      job_id: jobId,
      status: application.status,
      ai_score: application.ai_score,
      ai_rationale: application.ai_rationale,
      ai_brief: application.ai_brief ?? null,
      ai_analysis: application.ai_analysis ?? null,
      structured_data: application.structured_data ?? null,
      research_profile: application.research_profile ?? null,
      social_research: application.research_profile ?? null,
      discrepancy_flags: application.discrepancy_flags ?? null,
      has_discrepancies: application.has_discrepancies ?? false,
      resume_text: application.resume_text ?? null,
      interview_link: (application as Record<string, unknown>).interview_link ?? null,
      tentative_slots: (application as Record<string, unknown>).tentative_slots ?? null,
      shortlisted_at: (application as Record<string, unknown>).shortlisted_at ?? null,
      reschedule_reason: (application as Record<string, unknown>).reschedule_reason ?? null,
      reschedule_status: (application as Record<string, unknown>).reschedule_status ?? null,
    }

    let appId: string
    if (existingApp) {
      const { error } = await supabase
        .from('applications')
        .update(appData)
        .eq('id', existingApp.id)

      if (error) {
        console.error(`   ✗ Failed to update application for "${candidate.full_name}":`, error.message)
        continue
      }
      appId = existingApp.id
      console.log(`   ✓ ${candidate.full_name} — ${application.status} (updated: ${appId})`)
    } else {
      const { data, error } = await supabase
        .from('applications')
        .insert(appData)
        .select('id')
        .single()

      if (error) {
        console.error(`   ✗ Failed to insert application for "${candidate.full_name}":`, error.message)
        continue
      }
      appId = data.id
      console.log(`   ✓ ${candidate.full_name} — ${application.status} (created: ${appId})`)
    }

    // ── 3. Add transcript if provided ───────────────────────────────────
    const transcriptData = (entry as Record<string, unknown>).transcript as Record<string, unknown> | undefined
    if (transcriptData) {
      const { data: existingTranscript } = await supabase
        .from('transcripts')
        .select('id')
        .eq('application_id', appId)
        .maybeSingle()

      if (!existingTranscript) {
        const { error } = await supabase
          .from('transcripts')
          .insert({
            application_id: appId,
            fireflies_id: transcriptData.fireflies_id,
            summary: transcriptData.summary,
            full_transcript: transcriptData.full_transcript,
          })

        if (error) {
          console.error(`     ✗ Failed to insert transcript for "${candidate.full_name}":`, error.message)
        } else {
          console.log(`     ✓ Transcript added`)
        }
      } else {
        console.log(`     ✓ Transcript exists`)
      }
    }

    // ── 4. Add interview feedback if provided ───────────────────────────
    const feedbackData = (entry as Record<string, unknown>).feedback as Record<string, unknown> | undefined
    if (feedbackData) {
      const { data: existingFeedback } = await supabase
        .from('interview_feedback')
        .select('id')
        .eq('application_id', appId)
        .maybeSingle()

      if (!existingFeedback) {
        const { error } = await supabase
          .from('interview_feedback')
          .insert({
            application_id: appId,
            rating: feedbackData.rating,
            comments: feedbackData.comments,
          })

        if (error) {
          console.error(`     ✗ Failed to insert feedback for "${candidate.full_name}":`, error.message)
        } else {
          console.log(`     ✓ Interview feedback added (rating: ${feedbackData.rating}/5)`)
        }
      } else {
        console.log(`     ✓ Interview feedback exists`)
      }
    }

    // ── 5. Add offer letter if provided ─────────────────────────────────
    const offerData = (entry as Record<string, unknown>).offer as Record<string, unknown> | undefined
    if (offerData) {
      const { data: existingOffer } = await supabase
        .from('offer_letters')
        .select('id')
        .eq('application_id', appId)
        .maybeSingle()

      if (!existingOffer) {
        const { error } = await supabase
          .from('offer_letters')
          .insert({
            application_id: appId,
            status: offerData.status,
            content: offerData.html_content,
            signed_at: offerData.signed_at ?? null,
            signer_ip: offerData.signer_ip ?? null,
          })

        if (error) {
          console.error(`     ✗ Failed to insert offer for "${candidate.full_name}":`, error.message)
        } else {
          console.log(`     ✓ Offer letter added (status: ${offerData.status})`)
        }
      } else {
        console.log(`     ✓ Offer letter exists`)
      }
    }

    // ── 6. Add Slack message if provided ─────────────────────────────────
    const slackData = (entry as Record<string, unknown>).slack_message as Record<string, unknown> | undefined
    if (slackData) {
      const { data: existingSlack } = await supabase
        .from('pending_slack_messages')
        .select('id')
        .eq('candidate_email', slackData.candidate_email)
        .maybeSingle()

      if (!existingSlack) {
        const { error } = await supabase
          .from('pending_slack_messages')
          .insert({
            candidate_email: slackData.candidate_email,
            message: slackData.message,
            sent_at: null, // Not sent yet — demonstrates the queue
          })

        if (error) {
          console.error(`     ✗ Failed to insert Slack message for "${candidate.full_name}":`, error.message)
        } else {
          console.log(`     ✓ Slack welcome DM queued (pending delivery)`)
        }
      } else {
        console.log(`     ✓ Slack message exists`)
      }
    }
  }

  console.log('\n✅ Seed complete!\n')
  console.log('Demo candidates:')
  console.log('─────────────────────────────────────────────────────────────')
  console.log('  Jake Morrison      → rejected (score 18, no enrichment)')
  console.log('  Priya Chakraborty  → pending_review (score 62, career changer, bias flag)')
  console.log('  Marcus Chen        → shortlisted (score 82, discrepancy flags)')
  console.log('  Sarah Kim          → slots_held (score 88, 5 slots in portal)')
  console.log('  Alex Rivera        → interviewed (score 91, transcript + feedback, offer ready)')
  console.log('  Elena Vasquez      → offer_sent (score 85, HR role, full offer letter)')
  console.log('  Jordan Okafor      → hired (score 79, signed offer, Slack DM queued)')
  console.log('  David Park         → manual_review_required (scanned PDF, no score)')
  console.log('  Mei-Lin Torres     → reschedule_requested (score 76, bootcamp grad, bias flag)')
  console.log('─────────────────────────────────────────────────────────────')
  console.log('\nView at: http://localhost:3000/admin/applications')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
