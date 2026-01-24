"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface GradientCollapsibleProps {
  icon?: React.ReactNode
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}

export function GradientCollapsible({
  icon,
  title,
  children,
  defaultOpen = false,
  className = "",
}: GradientCollapsibleProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      {({ open }) => (
        <div className={`relative rounded-lg overflow-hidden group ${className}`}>
          {/* Gradient border effect */}
          <div
            className={`absolute inset-0 rounded-lg transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            style={{
              background: 'linear-gradient(135deg, hsl(var(--gradient-orange)), hsl(var(--gradient-blue)), hsl(var(--gradient-orange)))',
              backgroundSize: '200% 200%',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
              padding: '1px'
            }}
          />

          <div className="relative bg-card rounded-lg overflow-hidden">
            {/* Animated gradient overlay on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--gradient-orange))]/5 via-[hsl(var(--gradient-blue))]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

            <CollapsibleTrigger asChild>
              <button className="relative w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {icon && (
                    <div className="text-muted-foreground group-hover:text-[hsl(var(--gradient-orange))] transition-colors shrink-0">
                      {icon}
                    </div>
                  )}
                  <span className="font-medium text-sm text-left truncate">{title}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ml-2 ${open ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t">
              {children}
            </CollapsibleContent>
          </div>
        </div>
      )}
    </Collapsible>
  )
}
