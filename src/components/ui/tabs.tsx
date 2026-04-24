"use client";

import { cn } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";

interface Context {
  defaultValue: string;
  hrefFor: ((value: string) => string) | null;
  onSelect: ((value: string) => void) | null;
  selected: string;
}
const TabsContext = React.createContext<Context>(null as any);

export function Tabs(props: {
  children: React.ReactNode;
  className?: string;
  /**
   * The default tab
   */
  defaultValue: string;
  /**
   * Which search param to use (URL mode only)
   * @default "tab"
   */
  searchParam?: string;
  /**
   * When true, tab state is managed in-memory instead of via URL search params.
   * Use this for tabs inside dialogs or other contexts where URL changes are undesirable.
   */
  local?: boolean;
}) {
  const { children, className, searchParam = "tab", local, ...other } = props;

  // Local (in-memory) state
  const [localSelected, setLocalSelected] = React.useState(props.defaultValue);

  // URL-based state
  const searchParams = useSearchParams()!;
  const pathname = usePathname();

  const selected = local
    ? localSelected
    : searchParams.get(searchParam) || props.defaultValue;

  const buildHref = React.useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams);
      if (value === props.defaultValue) {
        params.delete(searchParam);
      } else {
        params.set(searchParam, value);
      }

      const asString = params.toString();

      return pathname + (asString ? "?" + asString : "");
    },
    [searchParams, searchParam, pathname, props.defaultValue],
  );

  const hrefFor: Context["hrefFor"] = local ? null : buildHref;
  const onSelect: Context["onSelect"] = local ? setLocalSelected : null;

  return (
    <TabsContext.Provider value={{ ...other, hrefFor, onSelect, selected }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

const useContext = () => {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error(
      "Tabs compound components cannot be rendered outside the Tabs component",
    );
  }

  return context;
};

export function TabsList(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      {...props}
      className={cn(
        "flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground overflow-x-auto scrollbar-none",
        props.className,
      )}
    />
  );
}

const triggerClassName =
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

export const TabsTrigger = (props: {
  children: React.ReactNode;
  className?: string;
  value: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}) => {
  const context = useContext();
  const isActive = context.selected === props.value;
  const ref = React.useRef<HTMLAnchorElement & HTMLSpanElement>(null);

  React.useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    }
  }, [isActive]);

  const sharedClassName = cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
    props.disabled && "pointer-events-none opacity-50 cursor-not-allowed",
    props.className,
  );

  if (context.onSelect) {
    return (
      <button
        type="button"
        className={cn(triggerClassName, props.className, props.disabled && "pointer-events-none opacity-50 cursor-not-allowed")}
        data-state={isActive ? "active" : "inactive"}
        disabled={props.disabled}
        onClick={() => !props.disabled && context.onSelect!(props.value)}
      >
        {props.children}
      </button>
    );
  }

  if (props.disabled) {
    return (
      <span
        ref={ref}
        className={sharedClassName}
        data-state={isActive ? "active" : "inactive"}
        style={props.style}
      >
        {props.children}
      </span>
    );
  }

  return (
    <Link
      ref={ref}
      className={sharedClassName}
      data-state={isActive ? "active" : "inactive"}
      href={context.hrefFor?.(props.value) || "#"}
      scroll={false}
      shallow={true}
      style={props.style}
    >
      {props.children}
    </Link>
  );
};

export function TabsContent(props: {
  children: React.ReactNode;
  className?: string;
  value: string;
}) {
  const context = useContext();

  if (context.selected !== props.value) {
    return null;
  }

  return (
    <div
      {...props}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        props.className,
      )}
    />
  );
}
