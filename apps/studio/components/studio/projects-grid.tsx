'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  FileText,
  Image as ImageIcon,
  Mic,
  Search,
  X,
} from 'lucide-react'
import type { ProjectSummary } from '@news-tok/render'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ProjectActions } from '@/components/studio/project-actions'
import { assetUrl } from '@/lib/asset-url'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'rendered' | 'draft'
type LangFilter = 'all' | 'vi' | 'en'
type AspectFilter = 'all' | '9:16' | '16:9' | '1:1'

function formatDate(iso: string): string {
  const d = new Date(iso)
  // Format like YupClip: "5/14/2026, 13:04 GMT+7"
  const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const offset = -d.getTimezoneOffset() / 60
  const sign = offset >= 0 ? '+' : ''
  return `${date}, ${time} GMT${sign}${offset}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
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

/**
 * Width budget for the inline <video> based on the project aspect.
 * 9:16 portrait gets a narrow column so the rest of the meta has
 * room to breathe; 16:9 needs a wider lane; 1:1 sits between.
 */
function videoWidthClass(aspect: ProjectSummary['aspect']): string {
  if (aspect === '16:9') return 'w-[360px]'
  if (aspect === '1:1') return 'w-[280px]'
  return 'w-[260px]' // 9:16 default
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
        <div className="flex flex-col gap-4">
          {filtered.map(({ project: p, matchesTitle }) => (
            <ProjectRow key={p.projectId} project={p} matchedInTitle={matchesTitle} />
          ))}
        </div>
      )}
    </>
  )
}

/**
 * One row in the projects list. Left = inline <video> playing
 * `output.mp4` (or the first variant). Right = meta + downloads +
 * publish placeholder + close X. Aspect drives the video lane width
 * so the row looks balanced across 9:16 / 16:9 / 1:1.
 */
function ProjectRow({
  project,
  matchedInTitle,
}: {
  project: ProjectSummary
  matchedInTitle: boolean
}) {
  const videoSrc = project.outputPath ? assetUrl(project.outputPath) : null

  return (
    <Card className="relative overflow-hidden">
      {/* Top-right action cluster — both buttons live in one absolute
          group so they share a stacking context and never collide.
          The meta header below reserves matching right padding so the
          title can't run underneath them at any title length. */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/projects/${project.projectId}`}>
            <ArrowUpRight />
            Open in Studio
          </Link>
        </Button>
        <ProjectActions projectId={project.projectId} title={project.title} />
      </div>

      <div className="flex flex-col gap-6 p-4 md:flex-row md:p-6">
        {/* Video lane */}
        <div className={cn('shrink-0', videoWidthClass(project.aspect))}>
          {videoSrc ? (
            <video
              src={videoSrc}
              controls
              preload="metadata"
              className="block w-full rounded-md bg-black"
              style={{
                aspectRatio:
                  project.aspect === '16:9'
                    ? '16 / 9'
                    : project.aspect === '1:1'
                      ? '1 / 1'
                      : '9 / 16',
              }}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded-md border border-dashed bg-muted/40 text-xs text-muted-foreground"
              style={{
                aspectRatio:
                  project.aspect === '16:9'
                    ? '16 / 9'
                    : project.aspect === '1:1'
                      ? '1 / 1'
                      : '9 / 16',
              }}
            >
              Not rendered yet
            </div>
          )}
        </div>

        {/* Meta lane */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Title gets its own padding-right so it clears the
              absolute action cluster (Open in Studio + Duplicate +
              Delete). Description / downloads / publish below run
              full width because the action cluster sits next to the
              title vertically, not on top of every line of meta. */}
          <h3 className="break-words pr-[210px] text-xl font-semibold leading-tight">
            {project.title}
          </h3>

          {project.description ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {project.description}
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground/80">
            <span
              className={cn(
                'mr-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                isRendered(project)
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {isRendered(project) ? (
                <>
                  <CheckCircle2 className="size-3" />
                  Done
                </>
              ) : (
                'Draft'
              )}
            </span>
            {formatDate(project.updatedAt)}
            {query(matchedInTitle)}
          </p>

          {isRendered(project) ? (
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Downloads
              </div>
              <div className="flex flex-wrap gap-2">
                <DownloadPill
                  href={
                    project.outputPath
                      ? assetUrl(project.outputPath) ?? '#'
                      : '#'
                  }
                  filename={`${project.projectId}.mp4`}
                  icon={<Download />}
                  label="MP4"
                />
                <DownloadPill
                  href={`/api/projects/${encodeURIComponent(project.projectId)}/downloads/thumbnail`}
                  icon={<ImageIcon />}
                  label="Thumbnail"
                />
                <DownloadPill
                  href={`/api/projects/${encodeURIComponent(project.projectId)}/downloads/voice`}
                  icon={<Mic />}
                  label="Voice"
                />
                <DownloadPill
                  href={`/api/projects/${encodeURIComponent(project.projectId)}/downloads/subtitles`}
                  icon={<FileText />}
                  label="Subtitles"
                />
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Publish to platforms
            </div>
            <p className="text-sm text-muted-foreground/80">
              Connect at least one social platform first.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

/** Tiny helper: a pill-shaped link that triggers a file download.
 *  Using `download` plus `target` makes the browser fetch the URL with
 *  the streaming response Content-Disposition we set server-side. */
function DownloadPill({
  href,
  filename,
  icon,
  label,
}: {
  href: string
  filename?: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <a
      href={href}
      download={filename ?? ''}
      className="inline-flex items-center gap-1.5 rounded-full border border-input px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
    >
      {icon}
      {label}
    </a>
  )
}

/** Pull "matched in text" pill out of the row meta line so the
 *  template above stays readable. Returns a Fragment, not a string,
 *  so it can carry markup. */
function query(matchedInTitle: boolean): React.ReactNode {
  if (matchedInTitle) return null
  return (
    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
      matched in text
    </span>
  )
}
