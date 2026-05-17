import { NextResponse, type NextRequest } from 'next/server'
import {
  FAVORITE_KINDS,
  readFavorites,
  toggleFavorite,
  type FavoriteKind,
} from '@/lib/favorites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/favorites
 *
 * Returns the full per-user favorites file from
 * `~/.news-tok/favorites.json`. Missing / corrupt → empty defaults.
 * Used by `useFavorites()` once on Studio mount and on hot reload.
 */
export async function GET() {
  const file = await readFavorites()
  return NextResponse.json(file)
}

/**
 * POST /api/favorites { kind, id }
 *
 * Toggles `id` inside `file[kind]` and persists. Returns the updated
 * full file so the client can keep its in-memory store in sync without
 * a refetch. Validates kind against `FAVORITE_KINDS` so a typoed
 * `?kind=fnots` doesn't silently write a junk array.
 */
export async function POST(req: NextRequest) {
  let body: { kind?: string; id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const kind = body.kind
  const id = body.id
  if (typeof kind !== 'string' || typeof id !== 'string' || id.length === 0) {
    return NextResponse.json(
      { error: 'kind (string) + id (non-empty string) required' },
      { status: 400 }
    )
  }
  if (!FAVORITE_KINDS.includes(kind as FavoriteKind)) {
    return NextResponse.json(
      { error: `unknown kind "${kind}" — expected ${FAVORITE_KINDS.join(' | ')}` },
      { status: 400 }
    )
  }
  const updated = await toggleFavorite(kind as FavoriteKind, id)
  return NextResponse.json(updated)
}
