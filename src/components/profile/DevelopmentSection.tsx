'use client'

import { Switch } from "@/components/ui/switch"
import { Wrench } from "lucide-react"
import { useQuickLoginVisibility } from "@/hooks/useQuickLoginVisibility"
import { showsDevelopmentSection } from "@/components/profile/dev-tools"

// `isPreview` comes from the server (DEPLOYMENT_ENV is server-only — see src/env.mjs).
export function DevelopmentSection({ isPreview = false }: { isPreview?: boolean }) {
  const { isVisible, isLoaded, toggle } = useQuickLoginVisibility()

  if (!showsDevelopmentSection(isPreview)) {
    return null
  }

  // Don't render until loaded to prevent hydration mismatch
  if (!isLoaded) {
    return null
  }

  return (
    <div className="rounded-2xl border border-dashed border-foreground/20 px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
          {isPreview ? 'Preview only' : 'Dev only'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="quick-login-toggle" className="cursor-pointer text-[13px] leading-snug">
          Show the Quick Login bar
        </label>
        <Switch
          id="quick-login-toggle"
          checked={isVisible}
          onCheckedChange={toggle}
        />
      </div>
    </div>
  )
}
