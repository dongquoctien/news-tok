import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatePrompt } from '@/components/home/create-prompt'
import { BrandLogo } from '@/components/brand-logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Nav-style header: brand left, controls right. The brand
          anchors the layout so Theme + Projects don't read as
          floating chrome. */}
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <BrandLogo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/projects">
              <FolderOpen />
              Projects
            </Link>
          </Button>
        </div>
      </header>

      {/* Tight top padding on desktop (py-8) keeps the hero in the first
          viewport instead of pushing it half-way down. Loosens to py-12 on
          large screens where the extra breathing room actually helps.
          Brand identity has moved up into the header, so the hero leads
          with the headline now. */}
      <section className="flex flex-1 flex-col items-center justify-start gap-5 px-6 py-10 text-center lg:justify-center lg:py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Biến bài báo thành video ngắn
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Dán link bài báo hoặc nội dung. AI lên kịch bản, chọn ảnh và
          giọng đọc. Bạn xem trước trong Studio rồi bấm Render khi ưng.
        </p>
        <CreatePrompt />
      </section>
    </main>
  )
}
