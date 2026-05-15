import { NextResponse, type NextRequest } from 'next/server'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { projectDir } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reveal the project folder in the OS file manager. We don't return any
 * file content — just fire the platform's native "open folder" command
 * so the user can grab `output.mp4`, swap in a custom scene, or browse
 * cached assets.
 *
 * Restrictions: only opens directories under data/projects/<id>/. The
 * `id` is the URL segment, so traversal (`..`) lands in a different
 * routing rule and never reaches this handler.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  // Defence-in-depth: still reject anything that smells like traversal
  // before we hand a path to the shell.
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
  }

  const dir = projectDir(id)
  if (!existsSync(dir)) {
    // Auto-create on first call so a brand-new project that hasn't
    // been rendered yet still opens to an empty folder rather than 404.
    try {
      await mkdir(dir, { recursive: true })
    } catch (err) {
      return NextResponse.json(
        { error: `Could not create project folder: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      )
    }
  }

  try {
    openInFileManager(dir)
    return NextResponse.json({ opened: dir })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

function openInFileManager(absPath: string): void {
  const platform = process.platform
  // Detached + ignored stdio so the child outlives this Node request and
  // we don't pipe the file manager's chatter back through the API.
  const opts = { detached: true, stdio: 'ignore' as const }
  if (platform === 'win32') {
    // explorer.exe always exits with code 1 even on success — fire and forget.
    spawn('explorer.exe', [absPath], opts).unref()
    return
  }
  if (platform === 'darwin') {
    spawn('open', [absPath], opts).unref()
    return
  }
  // Linux / BSD — xdg-open is the de facto launcher.
  spawn('xdg-open', [absPath], opts).unref()
}
