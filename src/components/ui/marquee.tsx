import { cn } from "@/lib/utils";
import { ComponentPropsWithoutRef } from "react";

interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
  label?: string;
  /**
   * Optional CSS class name to apply custom styles
   */
  className?: string;
  /**
   * Whether to reverse the animation direction
   * @default false
   */
  reverse?: boolean;
  /**
   * Whether to pause the animation on hover
   * @default false
   */
  pauseOnHover?: boolean;
  /**
   * Content to be displayed in the marquee
   */
  children: React.ReactNode;
  /**
   * Whether to animate vertically instead of horizontally
   * @default false
   */
  vertical?: boolean;
  /**
   * Number of times to repeat the content
   * @default 4
   */
  repeat?: number;
}

export default function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
  label,
  ...props
}: MarqueeProps) {
  // Ensure we have enough copies for seamless infinite scroll
  // With 4+ copies, when one moves out, another identical copy is ready
  const copyCount = Math.max(repeat, 4);

  return (
    <div className="relative w-full">
      <div
        {...props}
        className={cn(
          "group relative flex overflow-hidden p-2 [--duration:40s] [--gap:1rem] [gap:var(--gap)]",
          {
            "flex-row": !vertical,
            "flex-col": vertical,
          },
          className,
        )}
      >
        {Array(copyCount)
          .fill(0)
          .map((_, i) => (
            <div
              key={i}
              className={cn("flex shrink-0 [gap:var(--gap)]", {
                "animate-marquee flex-row items-center": !vertical,
                "animate-marquee-vertical flex-col items-center": vertical,
                "group-hover:[animation-play-state:paused]": pauseOnHover,
                "[animation-direction:reverse]": reverse,
              })}
              style={{
                // Ensure each copy starts in the correct position for seamless looping
                // The animation will move each copy by its own width, creating infinite scroll
                willChange: 'transform',
              }}
            >
              {children}
            </div>
          ))}
      </div>
      {label && (
        <div className="absolute bottom-4 right-4 z-50 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
          {label}
        </div>
      )}
    </div>
  );
}
