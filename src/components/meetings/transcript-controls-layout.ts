export function getTranscriptControlsDesktopLeftOffset(
  isMobile: boolean,
  sidebarState: "expanded" | "collapsed"
): string | undefined {
  if (isMobile) {
    return undefined;
  }

  if (sidebarState === "collapsed") {
    return "calc(var(--sidebar-width-icon) + 0.5rem)";
  }

  return "calc(var(--sidebar-width) + 0.5rem)";
}
