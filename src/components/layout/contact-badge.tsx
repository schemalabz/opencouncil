import { Phone, Mail, MapPin } from 'lucide-react'
import { cn } from "@/lib/utils"
import { env } from '@/env.mjs'

const CONTACT_INFO = {
    Phone: {
        icon: Phone,
        text: env.NEXT_PUBLIC_CONTACT_PHONE,
        href: `tel:${env.NEXT_PUBLIC_CONTACT_PHONE}`,
    },
    Email: {
        icon: Mail,
        text: env.NEXT_PUBLIC_CONTACT_EMAIL,
        href: `mailto:${env.NEXT_PUBLIC_CONTACT_EMAIL}`,
    },
    Location: {
        icon: MapPin,
        text: env.NEXT_PUBLIC_CONTACT_ADDRESS,
        href: `https://maps.google.com/?q=${encodeURIComponent(env.NEXT_PUBLIC_CONTACT_ADDRESS || '')}`,
    },
}

const SIZE_STYLES = {
    sm: "text-xs py-1 px-2",
    md: "text-sm py-1.5 px-3",
    lg: "text-base py-2 px-4",
}

interface ContactBadgeProps {
    type: keyof typeof CONTACT_INFO
    size?: keyof typeof SIZE_STYLES
    className?: string
}

export function ContactBadge({ type, size = "md", className }: ContactBadgeProps) {
    const { icon: Icon, text, href } = CONTACT_INFO[type]

    return (
        <a
            href={href}
            target={type === "Location" ? "_blank" : undefined}
            rel={type === "Location" ? "noopener noreferrer" : undefined}
            className={cn("inline-block", className)}
        >
            <div className={cn(
                "inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 text-primary",
                "transition-all duration-300 ease-in-out",
                "hover:bg-primary hover:text-primary-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                SIZE_STYLES[size]
            )}>
                <Icon className={cn("flex-shrink-0", {
                    "w-3 h-3": size === "sm",
                    "w-4 h-4": size === "md",
                    "w-5 h-5": size === "lg"
                })} />
                <span className="font-medium">{text}</span>
            </div>
        </a>
    )
}

