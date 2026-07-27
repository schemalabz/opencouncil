// src/lib/design-system/content.ts

export const PREAMBLE = `# Designing for OpenCouncil

You are designing for **OpenCouncil** — an open-source civic-transparency platform by Schema Labs that makes Greek municipal council meetings searchable and understandable. Brand register in one line: **square, plain, exact controls — with the Civic Flame orange and the one brand gradient reserved for primary actions and decisive moments. The record is the interface; the UI recedes.**

## Non-negotiable rules
- **Civic Flame Rule** — orange (#ff6600) appears only where the citizen acts or the record demands attention (primary buttons, links, inline emphasis, live/highlight). Never tints backgrounds, resting borders, default icons, or inactive states. If orange covers >~10% of a screen, it's wrong.
- **One Gradient Rule** — exactly one gradient (Flame Deep #fc550a → Marble Blue #a4c0e1 → back), on 1–1.5px borders and brand moments only. Never on text, never as a surface fill.
- **Two Voices Rule** — Relative Book Pro is the interface; Roboto is the verbatim record; Roboto Mono is timestamps/IDs. The font switch is the trust boundary.
- **Sharp Default Rule** — square corners by default; curvature is earned (cards 8px, featured 12px, pills/avatars full-round).
- **AI labelling** — every AI-generated summary/categorization carries an explicit, visually subordinate label ("Κείμενο από ΤΝ"). AI never masquerades as the record.
- **Accessibility** — WCAG 2.1 AA; visible focus (2px Ink ring, offset 2px); reduced-motion alternatives. Greek is the primary locale; sentence case; no emoji.

The full design spec (DESIGN.md) and product context (PRODUCT.md) follow / are linked below. Honour them over any default instinct.`;

export const SKILL = `---
name: opencouncil-design
description: Use this skill to generate well-branded interfaces and assets for OpenCouncil (the Schema Labs civic-transparency platform for Greek municipal council meetings), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

This is the OpenCouncil design system. Its register in one line: **square, plain, exact controls — with the Civic Flame orange and the one brand gradient reserved for primary actions and decisive moments. The record is the interface; the UI recedes.**

Non-negotiables to honor: the Civic Flame Rule (orange only on action/emphasis, never on resting chrome or backgrounds), the One Gradient Rule (Flame→Blue on thin borders only), the Two Voices Rule (Relative Book Pro for UI, Roboto for the verbatim record), the Sharp Default Rule (square corners unless earned), and an explicit AI label on every AI-generated summary. Primary locale is Greek; WCAG 2.1 AA throughout.

Canonical references (always current):
- Design spec: /api/design-context/design (the repo's DESIGN.md)
- Product context: /api/design-context/product (the repo's PRODUCT.md)
- Combined, self-contained context: /api/design-context/combined

If creating visual artifacts (slides, mocks, throwaway prototypes), produce static HTML for the user to view. If working on production code, follow the rules above and the linked specs to design with this brand. If invoked without guidance, ask what to build, then act as an expert OpenCouncil designer.`;
