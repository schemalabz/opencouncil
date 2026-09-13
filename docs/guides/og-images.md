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

## Load and caching

Every route renders inside one concurrency slot per process (`src/lib/og/concurrency.ts`). At capacity the route answers 429, and the crawler tries again. `ogCacheControl` in `src/lib/og/render.ts` sets the cache policy of a public image: a week for an image with every picture in place, an hour for an image drawn while an illustration was still being generated. `shareCacheControl` caches a sharing image for ten minutes; an answer that is not an image is never cached.

## One frame

`src/components/og/frame.tsx` holds the vocabulary of every image: the frame, the lockup, the context chip with the city seal, the topic pill, the fact line, the tile, the avatar, the chip, the headline and the foot gradient. The tokens are the site's own, resolved to plain values, because satori reads no CSS variables. Every box with children sets `display: flex`, which satori requires. A block that holds text alone sets `display: block`, the one display satori clamps lines on. No style value is ever `undefined`, which satori rejects.

The text is set in Relative Book Pro at its one weight. Size and colour carry the hierarchy. Inter follows in the font list for the glyphs the brand font lacks, such as Cyrillic. `src/lib/og/serverAssets.ts` loads both.

## Pictures

- **Illustrations.** `src/lib/og/illustration.ts` fetches a subject's illustration from the CDN and hands it to the renderer as an embedded PNG, sized to the box it fills. The PNG is quantised to a palette, which keeps the pixel art crisp at a third of the bytes. The URL carries the object's ETag, so a replaced picture is fetched anew. A subject with no illustration gets its topic's wash and glyph, as the pages draw the placeholder.
- **Seals, logos and portraits.** `src/lib/og/remoteImage.ts` fetches a picture from one of our public origins only, bounds the download and the decoded pixels, and embeds it as a PNG. `getPortraitData` in `src/lib/og/portrait.ts` is the portrait-sized form.
- **The static set.** `public/og/illustrations/` holds a few illustrations that ship with the build. The landing and about images draw them, so the unfurl of the bare domain reads nothing from the database. Replace the files to change the set.

## Adding an image

1. Write a builder in `src/app/api/og/route.tsx` that returns the frame with the header and the body.
2. Fetch the pictures it draws through `src/lib/og/remoteImage.ts` or `src/lib/og/illustration.ts` before the render. The renderer must not fetch anything itself.
3. Add its strings to `messages/{locale}/og.json` for every locale.
4. Select it in `GET` by its query parameter.
5. Build the URL on the page with `buildOgImageUrl`.
