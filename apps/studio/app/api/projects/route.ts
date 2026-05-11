import { NextResponse } from 'next/server'
import { listProjects } from '@news-tok/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const projects = await listProjects()
    return NextResponse.json({ projects, count: projects.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
