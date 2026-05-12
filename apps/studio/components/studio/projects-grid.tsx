'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Film,
  Layers,
  Languages,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import type { ProjectSummary } from '@news-tok/render'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ProjectActions } from '@/components/studio/project-actions'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'rendered' | 'draft'
type LangFilter = 'all' | 'vi' | 'en'
type AspectFilter = 'all' | '9:16' | '16:9' | '1:1'

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} h ago`
  const d = Math.floor(hr / 24)
  return `${d} d ago`
}

function isRendered(p: ProjectSummary): boolean {
  return p.hasOutput || p.outputVariantIds.length > 0
}

function PillGroup<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (next: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  ariaLabel: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-input bg-transparent p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function ProjectsGrid({ projects }: { projects: ProjectSummary[] }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [lang, setLang] = useState<LangFilter>('all')
  const [aspect, setAspect] = useState<AspectFilter>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects
      .map((p) => {
        const matchesTitle = q ? p.title.toLowerCase().includes(q) : true
        const matchesBody = q ? p.searchHaystack.includes(q) : true
        return { project: p, matchesTitle, matchesBody }
      })
      .filter(({ project: p, matchesTitle, matchesBody }) => {
        if (q && !matchesBody) return false
        if (status === 'rendered' && !isRendered(p)) return false
        if (status === 'draft' && isRendered(p)) return false
        if (lang !== 'all' && p.language !== lang) return false
        if (aspect !== 'all' && p.aspect !== aspect) return false
        // matchesTitle stays around so the card can flag "matched in body".
        void matchesTitle
        return true
      })
  }, [projects, query, status, lang, aspect])

  const anyFilterActive =
    query.trim() !== '' || status !== 'all' || lang !== 'all' || aspect !== 'all'

  return (
    <>
      <div className="mb-5 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or segment text (keypoints, outro)..."
            className="pl-8"
            aria-label="Search projects"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PillGroup
            ariaLabel="Filter by render status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All' },
              { value: 'rendered', label: 'Rendered' },
              { value: 'draft', label: 'Draft' },
            ]}
          />
          <PillGroup
            ariaLabel="Filter by language"
            value={lang}
            onChange={setLang}
            options={[
              { value: 'all', label: 'Any lang' },
              { value: 'vi', label: 'VI' },
              { value: 'en', label: 'EN' },
            ]}
          />
          <PillGroup
            ariaLabel="Filter by aspect ratio"
            value={aspect}
            onChange={setAspect}
            options={[
              { value: 'all', label: 'Any aspect' },
              { value: '9:16', label: '9:16' },
              { value: '16:9', label: '16:9' },
              { value: '1:1', label: '1:1' },
            ]}
          />
          {anyFilterActive ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setStatus('all')
                setLang('all')
                setAspect('all')
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
              Clear
            </button>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {projects.length}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No projects match these filters</CardTitle>
            <CardDescription>
              Try clearing the search or switching the filters back to All.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ project: p, matchesTitle }) => (
            <Card
              key={p.projectId}
              className="group relative h-full transition-colors hover:border-primary/60"
            >
              <Link href={`/projects/${p.projectId}`} className="block">
                <CardHeader>
                  <CardTitle className="line-clamp-2 break-words pr-20 text-base">
                    {p.title}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <span>{relativeTime(p.updatedAt)}</span>
                    {query.trim() !== '' && !matchesTitle ? (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        matched in text
                      </span>
                    ) : null}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Film className="size-4" />
                    {p.aspect}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Layers className="size-4" />
                    {p.segmentCount} segs
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Languages className="size-4" />
                    {p.language}
                  </span>
                  {p.outputVariantIds.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      {p.outputVariantIds.length}
                      {p.declaredVariantIds.length > 0
                        ? `/${p.declaredVariantIds.length}`
                        : ''}{' '}
                      rendered
                    </span>
                  ) : p.hasOutput ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      rendered
                    </span>
                  ) : p.declaredVariantIds.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground/80">
                      <Sparkles className="size-4" />
                      {p.declaredVariantIds.length} variants
                    </span>
                  ) : (
                    <span />
                  )}
                </CardContent>
              </Link>
              <div className="absolute right-3 top-3">
                <ProjectActions projectId={p.projectId} title={p.title} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
