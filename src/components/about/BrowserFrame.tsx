import { cn } from '@/lib/utils'

interface BrowserFrameProps {
    url?: string
    children: React.ReactNode
    className?: string
}

export default function BrowserFrame({ url, children, className }: BrowserFrameProps) {
    return (
        <div className={cn('overflow-hidden rounded-xl border border-border/60 bg-white shadow-lg', className)}>
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b border-border/40 bg-gray-50/80 px-4 py-2.5">
                <div className="hidden sm:flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                </div>
                {url && (
                    <div className="ml-3 flex-1 truncate rounded-md bg-white/80 px-3 py-1 text-[11px] text-muted-foreground/60 font-mono">
                        {url}
                    </div>
                )}
            </div>
            {/* Content */}
            <div className="relative">
                {children}
            </div>
        </div>
    )
}
