import { ReactNode, MouseEvent } from 'react';
import { Card } from './card';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ClickableCardProps {
    children: ReactNode;
    className?: string;
    onClick?: (e: MouseEvent<HTMLDivElement>) => void;
    href?: string;
    style?: React.CSSProperties;
}

export function ClickableCard({
    children,
    className,
    onClick,
    href,
    style
}: ClickableCardProps) {
    const cardClassName = cn(
        "group relative h-full overflow-hidden transition-all duration-300",
        "hover:shadow-lg hover:scale-[1.01] cursor-pointer",
        className
    );

    if (href) {
        return (
            <Link href={href} className="no-underline hover:no-underline">
                <Card className={cardClassName} style={style}>
                    {children}
                </Card>
            </Link>
        );
    }

    return (
        <Card
            className={cardClassName}
            onClick={onClick}
            style={style}
        >
            {children}
        </Card>
    );
} 