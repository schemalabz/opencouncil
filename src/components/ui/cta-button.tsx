import type { ComponentProps, ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { TrackedLink } from '@/components/analytics/TrackedLink';
import { cn } from '@/lib/utils';

/**
 * The focus ring and the disabled state that `Button` gives, without its
 * `default` variant, whose own orange background, shadow and hover opacity
 * would each need an override here.
 */
const BASE =
    'inline-flex items-center justify-center whitespace-nowrap ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

interface CtaCommonProps {
    children: ReactNode;
    /**
     * `solid` is the filled orange pill. `text` is the same call to action as
     * bare orange text, for a quieter second action beside a solid one.
     */
    variant?: 'solid' | 'text';
    /** `solid` only: `sm` is the height inside a card, `md` the height in a flow. */
    size?: 'sm' | 'md';
    arrow?: boolean;
    className?: string;
}

type CtaLinkProps = CtaCommonProps & {
    href: ComponentProps<typeof Link>['href'];
    /** Set this to capture one event on click. The link then tracks. */
    event?: string;
    eventProps?: Record<string, unknown>;
};

type CtaActionProps = CtaCommonProps & {
    href?: undefined;
    onClick?: () => void;
    type?: 'button' | 'submit';
    disabled?: boolean;
    'aria-describedby'?: string;
};

export type CtaButtonProps = CtaLinkProps | CtaActionProps;

/**
 * The orange call to action, as a link or as a button.
 *
 * `globals.css` underlines every anchor on hover, so each call to action that
 * renders an anchor has to turn that off. This component carries the guard, so
 * no caller has to remember it.
 */
export function CtaButton(props: CtaButtonProps) {
    const { children, variant = 'solid', size = 'sm', arrow = true, className } = props;

    const content = (
        <>
            {children}
            {arrow && (
                <ArrowRight
                    className={cn(
                        'transition-transform group-hover/cta:translate-x-0.5',
                        variant === 'solid' ? 'h-4 w-4' : 'h-[15px] w-[15px]',
                    )}
                    aria-hidden
                />
            )}
        </>
    );

    const classes = cn(
        'group/cta hover:no-underline',
        variant === 'solid'
            ? cn(
                  BASE,
                  'gap-2 rounded-[10px] bg-[hsl(var(--orange-deep))] text-sm font-medium text-white hover:bg-[hsl(var(--orange-deep))]/90',
                  size === 'md' ? 'h-12 px-5 text-[15px]' : 'h-10 px-4',
              )
            : 'inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-[hsl(var(--orange-deep))]',
        className,
    );

    if (props.href !== undefined) {
        const { href, event, eventProps } = props;
        if (event) {
            return (
                <TrackedLink href={href} event={event} eventProps={eventProps} className={classes}>
                    {content}
                </TrackedLink>
            );
        }
        return (
            <Link href={href} className={classes}>
                {content}
            </Link>
        );
    }

    const { onClick, type = 'button', disabled, 'aria-describedby': describedBy } = props;
    return (
        <button type={type} onClick={onClick} disabled={disabled} aria-describedby={describedBy} className={classes}>
            {content}
        </button>
    );
}
