'use server'

import { createAdminClient } from '@/lib/supabase/server'
import type { AppStatus } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type UpdateStatusResult =
  | { success: true }
  | { success: false; error: string }

export async function updateApplicationStatus(
  applicationId: string,
  status: AppStatus,
  adminNote: string
): Promise<UpdateStatusResult> {
  if (!adminNote.trim()) {
    return { success: false, error: 'An admin note is required when overriding status.' }
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('applications')
    .update({ status, admin_override_note: adminNote.trim() })
    .eq('id', applicationId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/applications')
  revalidatePath(`/admin/applications/${applicationId}`)

  return { success: true }
}
