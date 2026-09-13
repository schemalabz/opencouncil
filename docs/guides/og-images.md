# Open Graph images

Every page that can be shared unfurls with an image. This guide says where the images come from, what they share, and how to add one.

## Where they render

| Image | Route | Data |
|---|---|---|
| Subject | `src/app/[locale]/(city)/[cityId]/(meetings)/[meetingId]/subjects/[subjectId]/opengraph-image.tsx` | The meeting, the subject, its statistics, its illustration |
| Meeting, city, people, person, party, consultation, landing, about, explain, search | `src/app/api/og/route.tsx` | One builder per image; the query string selects it |
| Excerpt, contribution | `src/app/api/og/excerpt/route.tsx`, `src/app/api/og/contribution/route.tsx` | The public content resolvers under `src/lib/sharing/` |
| Story (1080×1920) | `src/app/api/share/story/route.tsx` | The same resolvers |

The pages build their image URL with `buildOgImageUrl` from `src/lib/og/locale.ts`. The party page passes `partyId`; every other page passes the ids it has.

## One frame

`src/components/og/frame.tsx` holds the vocabulary every image is drawn with: the frame, the lockup, the context chip with the city seal, the topic pill, the fact line, the tile, the avatar, the chip, the headline and the foot gradient. The tokens are the site's own, resolved to plain values, because satori reads no CSS variables. Every box sets `display: flex`, which satori requires of a box with children, and no style value is ever `undefined`, which satori rejects.

The text is set in Relative Book Pro at its one weight. Size and colour carry the hierarchy. Inter follows in the font list for the glyphs the brand font lacks, such as Cyrillic. `src/lib/og/serverAssets.ts` loads both.

## Pictures

- **Illustrations.** `src/lib/og/illustration.ts` fetches a subject's illustration from the CDN and hands it to the renderer as an embedded PNG, sized to the box it fills. A subject with no illustration gets its topic's wash and glyph, as the pages draw the placeholder.
- **Seals, logos and portraits.** `src/lib/og/remoteImage.ts` fetches a picture from one of our public origins only, bounds the download and the decoded pixels, and embeds it as a PNG. `getPortraitData` in `src/lib/og/portrait.ts` is the portrait-sized form.
- **The static set.** `public/og/illustrations/` holds a few illustrations that ship with the build. The landing and about images draw them, so the unfurl of the bare domain reads nothing from the database. Replace the files to change the set.

## Adding an image

1. Write a builder in `src/app/api/og/route.tsx` that returns the frame with the header and the body.
2. Fetch the pictures it draws through `src/lib/og/remoteImage.ts` or `src/lib/og/illustration.ts` before the render. The renderer must not fetch anything itself.
3. Add its strings to `messages/{locale}/og.json` for every locale.
4. Select it in `GET` by its query parameter, and build the URL on the page with `buildOgImageUrl`.
