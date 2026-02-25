import { getTranscriptControlsDesktopLeftOffset } from "@/components/meetings/transcript-controls-layout";

describe("getTranscriptControlsDesktopLeftOffset", () => {
  it("uses compact offset on mobile", () => {
    expect(getTranscriptControlsDesktopLeftOffset(true, "expanded")).toBe("0.5rem");
  });

  it("uses full sidebar width when sidebar is expanded", () => {
    expect(getTranscriptControlsDesktopLeftOffset(false, "expanded")).toBe(
      "calc(var(--sidebar-width) + 0.5rem)"
    );
  });

  it("uses icon sidebar width when sidebar is collapsed", () => {
    expect(getTranscriptControlsDesktopLeftOffset(false, "collapsed")).toBe(
      "calc(var(--sidebar-width-icon) + 0.5rem)"
    );
  });
});
