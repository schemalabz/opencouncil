'use client'

import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Link } from '@/i18n/routing'
import { cn } from '@/lib/utils'

/** Roboto, the face the product uses for numerals and the record. */
export const recordFont: CSSProperties = { fontFamily: 'var(--font-roboto), Roboto, sans-serif' }

/** The page's measure: every section lays out inside it, so full-bleed backgrounds stay outside. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('mx-auto w-full max-w-[1200px] px-5 sm:px-6 lg:px-8', className)}>{children}</div>
}

/** One reveal for the whole page: a short rise as a block scrolls into view, once. */
export const reveal = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px 0px' },
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
}

export const revealDelayed = (delay: number) => ({
    ...reveal,
    transition: { ...reveal.transition, delay },
})

/** The section eyebrow: the city page's tracked 11px label, with the brand dot. */
export function Kicker({
    children,
    tone = 'orange',
    className,
}: {
    children: ReactNode
    tone?: 'orange' | 'muted' | 'dark'
    className?: string
}) {
    return (
        <div
            className={cn(
                'flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em]',
                tone === 'orange' && 'text-[hsl(var(--orange-deep))]',
                tone === 'muted' && 'text-muted-foreground',
                tone === 'dark' && 'text-white/60',
                className,
            )}
        >
            {tone !== 'muted' && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--orange))]" />}
            <span>{children}</span>
        </div>
    )
}

/**
 * Kicker, title and lead of a section. The title is an h2 with `!` on the three
 * properties the global `h2:not(.prose h2)` rule in globals.css sets: that rule
 * outranks utilities, and without the override every heading here renders at
 * 24px, centered.
 */
export function SectionHeading({
    kicker,
    title,
    subtitle,
    align = 'left',
    dark = false,
    className,
}: {
    kicker?: string
    title: ReactNode
    subtitle?: ReactNode
    align?: 'left' | 'center'
    dark?: boolean
    className?: string
}) {
    const centered = align === 'center'
    return (
        <motion.div
            {...reveal}
            className={cn(
                'flex max-w-[720px] flex-col gap-4 md:gap-[18px]',
                centered && 'mx-auto items-center text-center',
                className,
            )}
        >
            {kicker && <Kicker tone={dark ? 'dark' : 'orange'}>{kicker}</Kicker>}
            <h2
                className={cn(
                    '!text-[28px] !font-normal !leading-[1.12] tracking-[-0.02em] text-balance md:!text-[40px]',
                    centered ? '!text-center' : '!text-left',
                    dark ? 'text-white' : 'text-foreground',
                )}
            >
                {title}
            </h2>
            {subtitle && (
                <p className={cn('text-base leading-relaxed text-pretty md:text-lg', dark ? 'text-white/60' : 'text-muted-foreground')}>
                    {subtitle}
                </p>
            )}
        </motion.div>
    )
}

type PillVariant = 'primary' | 'outline'

interface PillButtonProps {
    children: ReactNode
    icon?: LucideIcon
    variant?: PillVariant
    /** On the dark closing band the primary pill is white and the outline pill is white-on-ink. */
    dark?: boolean
    size?: 'md' | 'lg'
    className?: string
    /** An internal path (rendered through the i18n Link), a `tel:`/`mailto:` or an external URL. */
    href?: string
    external?: boolean
    onClick?: () => void
    type?: ComponentProps<'button'>['type']
    disabled?: boolean
}

const pillBase =
    'inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-full font-semibold no-underline transition-[background-color,color,opacity,transform,box-shadow] duration-200 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 active:scale-[0.98]'

const pillSize = {
    md: 'h-10 px-5 text-sm',
    lg: 'h-12 px-6 text-[15px]',
}

const pillLook: Record<PillVariant, { light: string; dark: string }> = {
    primary: {
        light: 'bg-foreground text-background hover:bg-foreground/85',
        dark: 'bg-white text-[#0a0a0a] hover:bg-white/90',
    },
    outline: {
        light: 'border border-border bg-card text-foreground hover:border-foreground/30 hover:bg-muted',
        dark: 'border border-white/30 text-white hover:bg-white/10',
    },
}

/** The page's one button shape: the product's pill, in the two weights the page needs. */
export function PillButton({
    children,
    icon: Icon,
    variant = 'primary',
    dark = false,
    size = 'lg',
    className,
    href,
    external,
    onClick,
    type = 'button',
    disabled,
}: PillButtonProps) {
    const classes = cn(pillBase, pillSize[size], pillLook[variant][dark ? 'dark' : 'light'], className)
    const inner = (
        <>
            {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />}
            <span>{children}</span>
        </>
    )
    if (href && (external || /^(https?:|tel:|mailto:)/.test(href))) {
        return (
            <a href={href} className={classes} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {inner}
            </a>
        )
    }
    if (href) {
        return (
            <Link href={href} className={classes}>
                {inner}
            </Link>
        )
    }
    return (
        <button type={type} onClick={onClick} disabled={disabled} className={cn(classes, 'disabled:pointer-events-none disabled:opacity-60')}>
            {inner}
        </button>
    )
}

/** A quiet inline link with the arrow that nudges on hover, for "see it live" links. */
export function ArrowLink({
    href,
    children,
    external,
    className,
}: {
    href: string
    children: ReactNode
    external?: boolean
    className?: string
}) {
    const classes = cn(
        'group/link inline-flex items-center gap-1.5 text-[13px] font-semibold text-[hsl(var(--orange-deep))] no-underline transition-colors hover:text-[hsl(var(--orange))] hover:no-underline',
        className,
    )
    const arrow = (
        <svg
            aria-hidden
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
        </svg>
    )
    if (external || /^(https?:|mailto:)/.test(href)) {
        return (
            <a href={href} className={classes} target="_blank" rel="noopener noreferrer">
                {children}
                {arrow}
            </a>
        )
    }
    return (
        <Link href={href} className={classes}>
            {children}
            {arrow}
        </Link>
    )
}
