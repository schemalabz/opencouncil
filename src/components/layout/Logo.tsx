"use client"
import Image from 'next/image'
import { Link } from '@/i18n/routing';
import { cn } from "@/lib/utils"

interface LogoProps {
    className?: string;
    imageClassName?: string;
    textClassName?: string;
    hideText?: boolean;
}

/**
 * The lockup: the butterfly beside the wordmark.
 *
 * The mark's stroke has to read as thick as the wordmark's stem, which is a
 * measurement rather than a matter of taste. logo.png is 1606x1354 with the
 * glyph occupying 777x646 of it, and that glyph is drawn at a stroke of 7.82%
 * of its own height. Relative Book Pro — the brand face, and the app's default
 * sans — has a stem of 8.2% of its font-size and ships a single 400 weight, so
 * a weight class on the wordmark only asks the browser to synthesise one.
 *
 *     font-size = 0.954 x the butterfly's INK height
 *
 * and the ink is a fraction of the CSS box, which depends on how the box is set:
 *
 *     square box, object-contain (letterboxed) -> ink = 0.402 x the side
 *     height set, width auto (natural aspect)  -> ink = 0.477 x the height
 *
 * So a 48px square box carries an 18px wordmark, and a 40px `w-auto` one carries
 * 18px too. Change one, recompute the other.
 */
const Logo = ({ className, imageClassName, textClassName, hideText = false }: LogoProps) => {
    return (
        <Link href="/" className={cn("flex items-center", className)}>
            <div className={cn("relative w-12 h-12", imageClassName)}>
                <Image
                    src="/logo.png"
                    alt="OpenCouncil Logo"
                    fill
                    sizes="(max-width: 768px) 40px, 48px, 128px"
                    style={{ objectFit: 'contain' }}
                    className="transition-transform"
                    priority
                />
            </div>
            {!hideText && (
                <span className={cn("text-lg text-primary", textClassName)}>OpenCouncil</span>
            )}
        </Link>
    )
}

export default Logo
