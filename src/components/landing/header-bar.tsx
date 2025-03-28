import { ArrowUpRight, Twitter, Instagram } from 'lucide-react';
import { motion } from 'framer-motion';
import { SubstackPost } from '@/lib/db/landing';
import TimeAgo from 'react-timeago';
// @ts-ignore
import greekStrings from 'react-timeago/lib/language-strings/el';
// @ts-ignore
import buildFormatter from 'react-timeago/lib/formatters/buildFormatter';
import { cn } from '@/lib/utils';

const formatter = buildFormatter(greekStrings);

interface HeaderBarProps {
    latestPost?: SubstackPost;
    className?: string;
    isMobile?: boolean;
}

export function HeaderBar({ latestPost, className, isMobile = false }: HeaderBarProps) {
    // Different styling for mobile vs desktop
    const containerClasses = cn(
        "rounded-full",
        "flex items-center",
        "relative",
        "bg-background",
        isMobile ? "flex-col w-full max-w-[calc(100vw-32px)]" : "inline-flex",
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
            <div className="relative flex items-center w-full z-10">
                {/* Substack badge */}
                {latestPost && (
                    <SubstackBadge
                        post={latestPost}
                        className={isMobile ? "w-full truncate" : "flex-1"}
                    />
                )}

                {/* Social icons */}
                <div
                    className={cn(
                        "flex items-center gap-1",
                        isMobile ? "mt-1 mb-1" : "ml-1 py-1 pr-2"
                    )}
                >
                    <SocialIcon
                        href="https://twitter.com/opencouncil_gr"
                        aria-label="Twitter"
                        icon={<Twitter className="w-3.5 h-3.5" />}
                    />
                    <SocialIcon
                        href="https://instagram.com/opencouncil_gr"
                        aria-label="Instagram"
                        icon={<Instagram className="w-3.5 h-3.5" />}
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
            className="group flex items-center justify-center w-7 h-7 rounded-full overflow-hidden transition-colors"
            {...props}
        >
            <div className="flex items-center justify-center w-full h-full text-muted-foreground group-hover:text-foreground transition-colors">
                {icon}
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
        <motion.a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "group flex items-center gap-2 py-1.5 px-3 text-sm no-underline hover:no-underline",
                "transition-all hover:bg-white/10 rounded-full",
                className
            )}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
        >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                    substack
                </span>
                <span className="text-muted-foreground">·</span>
                <TimeAgo
                    className="text-xs text-muted-foreground flex-shrink-0"
                    date={post.publishDate}
                    formatter={formatter}
                />
                <span className="text-muted-foreground">·</span>
                <span className="truncate text-foreground">{post.title}</span>
            </div>
            <ArrowUpRight className="size-3 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </motion.a>
    );
}
