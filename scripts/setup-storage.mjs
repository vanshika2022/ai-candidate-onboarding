import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://hkxdhogaaqrscqhnmqbh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Create the resumes bucket (private)
const { data, error } = await supabase.storage.createBucket('resumes', {
  public: false,
  fileSizeLimit: 10 * 1024 * 1024, // 10 MB
  allowedMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
})

if (error && error.message !== 'The resource already exists') {
  console.error('Failed to create bucket:', error.message)
  process.exit(1)
}

if (error?.message === 'The resource already exists') {
  console.log('✓ Bucket "resumes" already exists')
} else {
  console.log('✓ Bucket "resumes" created')
}

// Storage RLS: allow service_role full access (handled by Supabase by default for service role)
// Public (anon) cannot read resumes — admin uses signed URLs
console.log('✓ Storage setup complete. Admins access resumes via signed URLs.')
