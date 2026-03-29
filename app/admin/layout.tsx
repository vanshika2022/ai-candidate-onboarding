'use client'

import { useRouter, usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  // Don't show sign-out on the login page itself
  const isLoginPage = pathname === '/admin/login'

  async function handleSignOut() {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <div>
      {!isLoginPage && (
        <div className="border-b border-slate-200 bg-white dark:border-card-border dark:bg-[#0a0a12]">
          <div className="mx-auto flex h-10 max-w-7xl items-center justify-end px-4 sm:px-6">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-300"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
