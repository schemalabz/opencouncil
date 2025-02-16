import { ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { SubstackPost } from '@/lib/db/landing';
import TimeAgo from 'react-timeago';
// @ts-ignore
import greekStrings from 'react-timeago/lib/language-strings/el';
// @ts-ignore
import buildFormatter from 'react-timeago/lib/formatters/buildFormatter';

const formatter = buildFormatter(greekStrings);

interface SubstackBadgeProps {
    post: SubstackPost;
}

export function SubstackBadge({ post }: SubstackBadgeProps) {
    return (
        <motion.a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative mx-auto max-w-2xl flex items-center gap-2 rounded-full border border-primary/20 bg-white/50 px-3 py-1.5 sm:px-4 sm:py-2 text-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-sm"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
        >
            <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
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