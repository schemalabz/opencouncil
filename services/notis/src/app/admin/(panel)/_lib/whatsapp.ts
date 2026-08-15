/**
 * WhatsApp's palette, hex-faithful. WhatsAppChat is the canonical surface;
 * anything else that fakes a WhatsApp detail (timeline bubbles, template
 * previews) imports from here so the hexes can't drift apart.
 */
export const WA = {
  chatBg: "#efeae2",
  outBubble: "#d9fdd3",
  panel: "#f0f2f5",
  ink: "#111b21",
  meta: "#667781",
  faint: "#8696a0",
  divider: "#e9edef",
  link: "#027eb5",
  button: "#00a5f4",
  readTick: "#53bdeb",
  sendGreen: "#25d366",
} as const;
