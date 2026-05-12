'use client'

import { useState } from 'react'
import { Settings, Volume2 } from 'lucide-react'
import type { Project } from '@news-tok/shared/schema'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

/**
 * Settings dialog for the project-level knobs that live in the header
 * but only get touched once per project (export preset, SFX master
 * volume). Keeps the editor header focused on per-segment work and
 * frequent toggles.
 */
export function ProjectSettingsDialog({
  exportPreset,
  sfxVolume,
  onChangePreset,
  onChangeSfxVolume,
}: {
  exportPreset: Project['exportPreset']
  sfxVolume: number
  onChangePreset: (preset: Project['exportPreset']) => void
  onChangeSfxVolume: (volume: number) => void
}) {
  const [open, setOpen] = useState(false)
  const sfxPct = Math.round(sfxVolume * 100)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Project settings">
          <Settings />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="size-5" />
            Project settings
          </DialogTitle>
          <DialogDescription>
            Tweaks that apply to the whole project. Per-segment options live
            in the inspector on the right of the editor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Export preset */}
          <div className="space-y-2">
            <Label htmlFor="settings-preset">Export preset</Label>
            <select
              id="settings-preset"
              value={exportPreset}
              onChange={(e) =>
                onChangePreset(e.target.value as Project['exportPreset'])
              }
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm font-medium [color-scheme:dark]"
            >
              <option value="standard" className="bg-background text-foreground">
                Standard (30fps)
              </option>
              <option value="tiktok" className="bg-background text-foreground">
                TikTok (60fps)
              </option>
              <option value="youtube-shorts" className="bg-background text-foreground">
                YouTube Shorts
              </option>
              <option value="reels" className="bg-background text-foreground">
                Reels
              </option>
            </select>
            <p className="text-xs text-muted-foreground">
              Picks the fps + format hints used when rendering the final mp4.
            </p>
          </div>

          {/* SFX master volume */}
          <div className="space-y-2">
            <Label htmlFor="settings-sfx" className="flex items-center gap-2">
              <Volume2 className="size-4" />
              SFX master volume
              <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                {sfxPct}%
              </span>
            </Label>
            <input
              id="settings-sfx"
              type="range"
              min={0}
              max={100}
              step={5}
              value={sfxPct}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10) / 100
                if (Number.isFinite(v)) onChangeSfxVolume(v)
              }}
              className="h-2 w-full cursor-pointer accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              Multiplied into every text-transition SFX cue. 0% silences all
              built-in cues without removing them from the storyboard.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
