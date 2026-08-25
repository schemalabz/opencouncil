/**
 * The look every control in the header's right-hand row shares — search, the
 * MCP link, the guide, the account menu.
 *
 * They used to highlight three different ways: search and MCP filled with
 * `bg-accent`, the account menu turned its own label `text-accent`, and the
 * guide sat permanently filled. `--accent` is a sky blue that belongs to the
 * map's floating buttons; the brand's neutral ramp is warm, so the row read as
 * three unrelated widgets in a colour the rest of the page never uses.
 *
 * The hover is a translucent tint of the foreground rather than a solid fill.
 * The header paints `backdrop-blur bg-background/50` over whatever is scrolling
 * beneath it, so an opaque near-white pill would punch a hole in the blur; a
 * tint keeps the same surface, darker. It also needs no dark-mode counterpart.
 *
 * Width is left to each call site: the labels drop at different breakpoints
 * depending on how recoverable the control is from its icon alone.
 */
export const headerControlClass =
    'flex items-center justify-center gap-1.5 h-8 sm:h-9 rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground hover:no-underline';
