'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Briefcase, LayoutDashboard, Zap, Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

function useDarkMode() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('niural-theme', isDark ? 'dark' : 'light')
    setDark(isDark)
  }

  return { dark, toggle }
}

export function Navbar() {
  const pathname = usePathname()
  const { dark, toggle } = useDarkMode()

  const navLink = (href: string, label: string, Icon: React.ElementType) => {
    const active = pathname.startsWith(href)
    return (
      <Link
        href={href}
        className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
          active
            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/5'
        }`}
      >
        <Icon size={15} />
        {label}
      </Link>
    )
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-sm dark:border-card-border dark:bg-[#0a0a12]/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Zap size={14} fill="white" />
          </span>
          Niural
        </Link>
        <nav className="flex items-center gap-1">
          {navLink('/jobs', 'Open Roles', Briefcase)}
          {navLink('/admin', 'Admin Dashboard', LayoutDashboard)}
          <button
            onClick={toggle}
            aria-label="Toggle dark mode"
            className="ml-1 flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-slate-300 transition-colors"
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </nav>
      </div>
    </header>
  )
}
