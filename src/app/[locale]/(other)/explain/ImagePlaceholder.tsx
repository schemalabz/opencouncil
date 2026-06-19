import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";

/**
 * Image area for explain cards/articles. Renders the supplied image when
 * present, otherwise a subtle branded placeholder. Sizing (and any radius
 * override) is passed via `className`, so a real image can be dropped in per
 * topic later without layout changes.
 */
export function ImagePlaceholder({
    src,
    alt,
    className,
}: {
    src?: string;
    alt: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "relative flex items-center justify-center overflow-hidden rounded-xl",
                src ? "bg-[#F2EFEA]" : "border border-dashed border-border bg-muted/60",
                className,
            )}
            aria-hidden={src ? undefined : true}
        >
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={alt} loading="lazy" className="h-full w-full object-contain" />
            ) : (
                <ImageIcon className="h-7 w-7 text-muted-foreground/40" strokeWidth={1.6} />
            )}
        </div>
    );
}
