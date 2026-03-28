'use client'

import { useEffect, useState, useMemo } from 'react'
import { createAnonClient } from '@/lib/supabase/server'
import type { Job } from '@/lib/supabase/server'

const supabase = createAnonClient()
import { JobCard, JobCardSkeleton } from '@/components/JobCard'
import { Search, SlidersHorizontal } from 'lucide-react'

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('All')

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('jobs')
          .select('*')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
        if (error) console.error('[jobs] supabase error:', error.message)
        setJobs(data ?? [])
      } catch (err) {
        console.error('[jobs] fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const departments = useMemo(() => {
    const teams = Array.from(new Set(jobs.map((j) => j.team)))
    return ['All', ...teams]
  }, [jobs])

  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      const matchSearch =
        search === '' ||
        job.title.toLowerCase().includes(search.toLowerCase()) ||
        job.team.toLowerCase().includes(search.toLowerCase()) ||
        job.location.toLowerCase().includes(search.toLowerCase())
      const matchDept = department === 'All' || job.team === department
      return matchSearch && matchDept
    })
  }, [jobs, search, department])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      {/* Hero */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Build the future of work with us
        </h1>
        <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
          Explore open roles across engineering, design, and operations.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search roles, teams, or locations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-card-border dark:bg-card dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-700 dark:focus:ring-indigo-900/30"
          />
        </div>
        <div className="relative flex items-center gap-2 shrink-0">
          <SlidersHorizontal size={15} className="text-slate-400 dark:text-slate-500" />
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 appearance-none cursor-pointer dark:border-card-border dark:bg-card dark:text-slate-300 dark:focus:border-indigo-700"
          >
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="mb-4 text-sm text-slate-400 dark:text-slate-500">
          {filtered.length} {filtered.length === 1 ? 'role' : 'roles'} found
        </p>
      )}

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <JobCardSkeleton key={i} />)
          : filtered.length === 0
          ? (
            <div className="col-span-full py-16 text-center text-slate-400 dark:text-slate-500">
              No roles match your search. Try adjusting your filters.
            </div>
          )
          : filtered.map((job) => <JobCard key={job.id} job={job} />)}
      </div>
    </div>
  )
}
