import { ArrowUpRight, Briefcase } from 'lucide-react';
import { SiX, SiInstagram, SiGithub, SiDiscord, SiSubstack } from 'react-icons/si';
import { LandingPageData, SubstackPost } from '@/lib/db/landing';
import TimeAgo from 'react-timeago';
// @ts-ignore
import greekStrings from 'react-timeago/lib/language-strings/el';
// @ts-ignore
import buildFormatter from 'react-timeago/lib/formatters/buildFormatter';
import { cn } from '@/lib/utils';
import { HIRING_CONFIG } from '@/lib/features/config';

const formatter = buildFormatter(greekStrings);

interface HeaderBarProps extends Pick<LandingPageData, 'latestPost'> {
    className?: string;
}

export function HeaderBar({ latestPost, className }: HeaderBarProps) {
    const containerClasses = cn(
        "rounded-full",
        "flex items-center",
        "relative",
        "bg-background",
        "text-xs sm:text-sm", // Smaller text on mobile
        className
    );

    return (
        <div className={containerClasses}>
            {/* Custom gradient border */}
            <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                    background: 'linear-gradient(90deg, #fc550a, #a4c0e1, #fc550a)',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                    padding: '1px'
                }}
            />

            {/* Content container to ensure links are clickable */}
            <div className="relative flex items-center z-10">
                {/* Hiring badge (when enabled) or Substack badge */}
                {HIRING_CONFIG.enabled ? (
                    <>
                        <HiringBadge className="hidden sm:flex" />
                        <HiringBadge className="flex sm:hidden" mobile />
                    </>
                ) : latestPost && (
                    <SubstackBadge
                        post={latestPost}
                        className="hidden sm:flex"
                    />
                )}

                {/* Social icons */}
                <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-0.5 sm:gap-1 py-0.5 sm:py-1 sm:pl-1 sm:pr-2">
                    {!HIRING_CONFIG.enabled && latestPost && (
                         <div className="sm:hidden">
                            <SocialIcon
                                href={latestPost.url}
                                aria-label="Substack"
                                icon={<SiSubstack className="w-3 h-3" />}
                            />
                        </div>
                    )}
                    <SocialIcon
                        href="https://twitter.com/opencouncil_gr"
                        aria-label="Twitter"
                        icon={<SiX className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                    />
                    <SocialIcon
                        href="https://instagram.com/opencouncil_gr"
                        aria-label="Instagram"
                        icon={<SiInstagram className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                    />
                    <SocialIcon
                        href="https://github.com/schemalabz/opencouncil"
                        aria-label="GitHub"
                        icon={<SiGithub className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                    />
                    <SocialIcon
                        href="https://discord.gg/VdwtVG43WB"
                        aria-label="Discord"
                        icon={<SiDiscord className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                    />
                </div>
            </div>
        </div>
    );
}

// Subcomponent for social media icons
function SocialIcon({ href, icon, ...props }: { href: string; icon: React.ReactNode;[key: string]: any }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full overflow-hidden transition-colors"
            {...props}
        >
            <div className="flex items-center justify-center w-full h-full text-muted-foreground group-hover:text-foreground transition-colors">
                {icon}
            </div>
        </a>
    );
}

// Subcomponent for Hiring badge
interface HiringBadgeProps {
    className?: string;
    mobile?: boolean;
}

function HiringBadge({ className, mobile = false }: HiringBadgeProps) {
    return (
        <a
            href={HIRING_CONFIG.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "group flex items-center gap-2 py-1.5 px-3 text-sm no-underline hover:no-underline",
                "transition-all hover:bg-white/10 rounded-full",
                className
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <Briefcase className="size-3.5 flex-shrink-0 text-[hsl(var(--orange))]" />
                {!mobile && <span className="text-xs text-muted-foreground">·</span>}
                <div className="flex items-center gap-1 overflow-hidden">
                    <span className={cn(
                        "truncate text-[hsl(var(--orange))] font-medium",
                        mobile && "text-xs"
                    )}>
                        {mobile ? "Προσλαμβάνουμε" : HIRING_CONFIG.text}
                    </span>
                    <ArrowUpRight className="size-3 flex-shrink-0 text-[hsl(var(--orange))] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
            </div>
        </a>
    );
}

// Subcomponent for Substack badge
interface SubstackBadgeProps {
    post: SubstackPost;
    className?: string;
}

function SubstackBadge({ post, className }: SubstackBadgeProps) {
    return (
        <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "group flex items-center gap-2 py-1.5 px-3 text-sm no-underline hover:no-underline",
                "transition-all hover:bg-white/10 rounded-full",
                className
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="hidden sm:inline-flex flex-shrink-0 text-xs text-muted-foreground">
                    substack
                </span>
                <span className="hidden sm:inline-flex text-muted-foreground">·</span>
                <TimeAgo
                    className="text-xs text-muted-foreground flex-shrink-0"
                    date={post.publishDate}
                    formatter={formatter}
                />
                <span className="text-muted-foreground">·</span>
                <div className="flex items-center gap-1 overflow-hidden">
                    <span className="truncate text-foreground">{post.title}</span>
                    <ArrowUpRight className="size-3 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
            </div>
        </a>
    );
}
