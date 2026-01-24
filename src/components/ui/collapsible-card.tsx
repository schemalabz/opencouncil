"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface CollapsibleCardProps {
  icon?: React.ReactNode
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}

const BORDER_RADIUS = "0.5rem"
const BORDER_WIDTH = "1.5px"

export function CollapsibleCard({
  icon,
  title,
  children,
  defaultOpen = false,
  className,
}: CollapsibleCardProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={cn("group rounded-lg shadow-sm overflow-hidden", className)}>
        <div
          className={cn(
            "w-full h-full rounded-lg p-[1.5px] transition-all duration-300 bg-gradient-to-r",
            "from-gray-300/40 via-gray-200/30 to-gray-300/40",
            open && "from-[#fc550a]/30 via-[#a4c0e1]/30 to-[#fc550a]/30",
            "group-hover:from-[#fc550a] group-hover:via-[#a4c0e1] group-hover:to-[#fc550a]",
            "group-hover:bg-[length:200%_100%] group-hover:[animation-play-state:running]"
          )}
          style={{
            animation: "gradientFlow 5s ease infinite",
            animationPlayState: "paused",
            borderRadius: BORDER_RADIUS,
          }}
        >
          <div
            className="w-full h-full bg-card"
            style={{ borderRadius: `calc(${BORDER_RADIUS} - ${BORDER_WIDTH})` }}
          >
            <CollapsibleTrigger asChild>
              <button className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {icon && (
                    <div className="text-muted-foreground group-hover:text-[#fc550a] transition-colors shrink-0">
                      {icon}
                    </div>
                  )}
                  <span className="font-medium text-sm text-left truncate">{title}</span>
                </div>
                <ChevronDown className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform shrink-0 ml-2",
                  open && "rotate-180"
                )} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-border">
              {children}
            </CollapsibleContent>
          </div>
        </div>
      </div>
    </Collapsible>
  )
}
