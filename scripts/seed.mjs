import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://hkxdhogaaqrscqhnmqbh.supabase.co',
  'sb_publishable_GLPQ-zMKFbkjBKwt-quu1A_s6nPuB3b'
)

const jobs = [
  {
    title: 'Senior Software Engineer',
    team: 'Engineering',
    location: 'Remote',
    level: 'Senior',
    description:
      'Join our core engineering team to design, build, and maintain scalable backend services and APIs that power the Niural platform. You will collaborate closely with product managers, designers, and fellow engineers to deliver high-quality, reliable software. You will drive technical decisions, mentor junior engineers, and help define best practices across the engineering org.',
    requirements:
      '• 5+ years of professional software engineering experience\n• Deep expertise in TypeScript, Node.js, or Go\n• Strong grasp of distributed systems, REST/GraphQL APIs, and microservices\n• Experience with PostgreSQL or other relational databases\n• Familiarity with cloud platforms (AWS, GCP, or Azure)\n• Excellent communication skills and ability to thrive in a remote-first environment',
    status: 'open',
  },
  {
    title: 'HR Operations Manager',
    team: 'People & Culture',
    location: 'New York, NY',
    level: 'Mid-Level',
    description:
      'As our HR Operations Manager, you will own the people operations function from hire to retire. You will build and refine HR processes, ensure compliance with employment law, manage benefits administration, and serve as a trusted resource for our growing team. This is a high-impact role that directly shapes employee experience at Niural.',
    requirements:
      '• 4+ years in HR operations or people operations roles\n• Solid knowledge of US employment law and HR compliance requirements\n• Experience managing benefits, payroll coordination, and HRIS platforms\n• Strong interpersonal skills and a high degree of discretion\n• Process-oriented mindset with the ability to balance strategy and execution\n• SHRM-CP or PHR certification is a plus',
    status: 'open',
  },
  {
    title: 'Product Designer',
    team: 'Design',
    location: 'Remote',
    level: 'Mid-Level',
    description:
      'We are looking for a Product Designer who thrives at the intersection of user research, interaction design, and visual craft. You will own end-to-end design for key product flows, from initial discovery through high-fidelity prototypes and developer handoff. You will partner with engineers and PMs to ensure that every pixel shipped is intentional and user-centric.',
    requirements:
      '• 3+ years of product design experience at a SaaS or tech company\n• Mastery of Figma for wireframing, prototyping, and design systems\n• Strong portfolio demonstrating user-centered design thinking and visual polish\n• Experience conducting user research and translating insights into design decisions\n• Ability to give and receive candid design critique\n• Familiarity with front-end concepts (HTML/CSS) is a strong plus',
    status: 'open',
  },
]

const { data, error } = await supabase.from('jobs').insert(jobs).select()

if (error) {
  console.error('Seed failed:', error.message)
  process.exit(1)
} else {
  console.log(`Seeded ${data.length} jobs:`)
  data.forEach((j) => console.log(`  ✓ ${j.title} (${j.id})`))
}
