# Subject Images

**Concept**

Every subject gets one AI-generated illustration. The landing cards, the subject page and the city page's top subject show it. A subject without an image shows a placeholder in its topic colour, which the browser draws.

**Architectural Overview**

The feature has three parts.

- The library `@opencouncil/subject-images` (in `packages/subject-images`) turns a subject into an image and stores it. It builds the prompt, calls Gemini, converts the result to WebP 1344×768 with sharp, and reads and writes the object in DigitalOcean Spaces. The library imports no Next, no Prisma and no `env.mjs`. The caller passes the Spaces client, the bucket, the public origin and the Gemini key.
- The app-side service `src/lib/subjectImages.ts` wires the library to the Spaces client and the environment. It guards against duplicate generations for one subject, against a retry storm for a subject that Gemini refuses, and against a generation that paints over an admin upload. The guards are markers in Valkey. The pipeline result handlers and the read route call it.
- One API route, `GET` and `POST /api/subject/{subjectId}/image`, serves the image, answers 404 when there is none, and lets a superadmin replace it.

There is no database column. The object key is the subject id inside a folder that `SUBJECT_IMAGES_PREFIX` names: `subject-images/8bit/{subjectId}.webp` by default. The folder names the style. A later restyle sets a new prefix and leaves the old objects in place.

Images come from three places:

1. **The pipeline.** The `processAgenda` and `summarize` result handlers schedule `generateImagesForMeeting` with `after()` once they save the subjects, so the work outlives the callback response instead of escaping it. The first run draws the agenda subjects days before the meeting. The second run draws the non-agenda subjects, which only exist once there is a transcript. A subject that already has an object is skipped, so the second run costs nothing for the first run's work.
2. **The read route.** A `GET` that finds no object answers 404 and schedules a generation with `after()`. The `<img>` hides itself and the placeholder under it stays. Old subjects get an image as people look at them.
3. **The backfill script.** `scripts/backfill-subject-images.ts` takes the newest `--window` subjects the landing can show (released meetings, public cities, discussed subjects), removes the ones that have an image (one listing of the bucket folder says which), and ranks the rest in the landing page's order of importance through the shared ranker in `src/lib/ranking/subjects.ts`. `--limit 50` then draws the 50 undrawn subjects a visitor is most likely to see, and a second run draws the next 50. The window is bounded because the discussion-time query binds one parameter per subject. The script is optional. It doubles as a test of the prompt across every kind of subject.

**Sequence Diagram**

```mermaid
sequenceDiagram
    participant Browser
    participant Route as GET /api/subject/{id}/image
    participant Service as src/lib/subjectImages.ts
    participant Spaces as DO Spaces
    participant Gemini

    Browser->>Route: <img src>
    Route->>Spaces: HEAD {prefix}/{id}.webp
    alt object exists
        Spaces-->>Route: ETag
        Route-->>Browser: 302 to CDN URL?v={ETag} (cache 5 min)
    else no object
        Route-->>Browser: 404 (cache 1 min); the <img> hides, the placeholder stays
        Route->>Service: after(): generateImageForSubject(id)
        Service->>Gemini: generateContent(prompt)
        Gemini-->>Service: PNG
        Service->>Spaces: PUT WebP 1344×768
    end
```

**Key Component Pointers**

Library
- `SYSTEM_PROMPT`, `buildPrompt`: [`packages/subject-images/src/prompt.ts`](../../packages/subject-images/src/prompt.ts) (the system instruction with the style and the rules, and the user message built from the title and the description)
- `generate`, `toWebp`: [`packages/subject-images/src/generate.ts`](../../packages/subject-images/src/generate.ts) (Gemini call, WebP conversion, the canonical size)
- `resolve`, `store`, `objectKey`: [`packages/subject-images/src/store.ts`](../../packages/subject-images/src/store.ts) (the object key under the configured prefix, and the Spaces reads and writes)

App
- `generateImageForSubject`, `generateImagesForMeeting`: [`src/lib/subjectImages.ts`](../../src/lib/subjectImages.ts) (wiring, in-flight guard, failure back-off, Discord alerts)
- Route: [`src/app/api/subject/[subjectId]/image/route.ts`](../../src/app/api/subject/[subjectId]/image/route.ts)
- Pipeline triggers: [`src/lib/tasks/processAgenda.ts`](../../src/lib/tasks/processAgenda.ts), [`src/lib/tasks/summarize.ts`](../../src/lib/tasks/summarize.ts)
- Backfill: [`scripts/backfill-subject-images.ts`](../../scripts/backfill-subject-images.ts)

Frontend
- `SubjectImage`: [`src/components/subject/SubjectImage.tsx`](../../src/components/subject/SubjectImage.tsx) (the topic wash and icon, with a plain `<img>` at the route URL over them; the `<img>` hides itself on a 404)
- `SubjectImageAdminControls`: [`src/components/subject/SubjectImageAdminControls.tsx`](../../src/components/subject/SubjectImageAdminControls.tsx) (the regenerate and replace overlay on the subject page)
- Surfaces: [`src/components/landing/v2/SubjectCard.tsx`](../../src/components/landing/v2/SubjectCard.tsx), [`src/components/meetings/subject/subject.tsx`](../../src/components/meetings/subject/subject.tsx), [`src/components/cities/overview/HotTopicLead.tsx`](../../src/components/cities/overview/HotTopicLead.tsx)

**Business Rules & Assumptions**

- Generation runs only where `GEMINI_API_KEY` is set. Without it, every subject shows the placeholder and nothing is spent. Each environment writes to its own `DO_SPACES_BUCKET` and reads through its own `CDN_URL`.
- `POST` is superadmin only, and answers 404 for a subject that does not exist. `{ "mode": "generate" }` redraws the subject and replaces whatever is stored, including a manual upload. That is how an upload is undone. A multipart `file` upload replaces the image with the file, normalised to WebP 1344×768. The file may weigh at most `MAX_IMAGE_BYTES` (5 MB). Its type is read from its bytes, not from the declared content type: JPEG, PNG, WebP, GIF or AVIF, and nothing that would decode past 16 times the canonical size. Anything else is a 400.
- The route caches the redirect for 5 minutes and a miss for 1 minute. Cloudflare and the browser absorb repeat loads, so one subject costs at most one `HEAD` request per 5 minutes. The ETag in the target URL means a replaced image never serves stale from the CDN. The admin overlay adds a `?v=` parameter after a change, so the admin sees the new image at once.
- A subject whose generation fails waits 10 minutes before a page view can retry it. After 3 failures in a row the subject is left alone for 30 days: the prompt refuses some subjects for good, and each retry is a billed call. A forced regenerate ignores both. Every attempt that fails alerts Discord through `sendErrorAdminAlert`, so one subject alerts at most 3 times a month unless an admin forces it.
- One generation per subject runs at a time, across containers. A forced regenerate waits for a run in progress, so the forced image is the one that lands last. A write that lands while the model draws, such as an admin upload, is kept; the generation then reports `superseded`.
- The guards are markers in Valkey, under `subject-images:`. Without `CACHE_URL` there are no markers: one container then guards its own runs in memory, and the back-off does not apply.
- A bucket that cannot be read (a wrong region, a bad key, an outage) serves misses and draws nothing. The route alerts Discord once per 10 minutes. A bucket that refuses a write (a missing bucket, a bad key) pauses every generation for 10 minutes after the first failed write, so a misconfiguration costs one billed call and one alert, not one per subject. A key that may read and write objects but not list the bucket gets 403 for an object that is not there. That reads as a miss, so such a key works.
- The subject id in the URL must match `^[A-Za-z0-9_-]+$`. Anything else is a 400 before the bucket is touched, and the library refuses to build a key from it, so an upload cannot leave the folder.
- The "AI-generated image" label on the landing card does not know about manual uploads. The object carries no source metadata yet.
- The hot-topic rows and lead on the city page draw the illustration where they drew the speaker avatars. Nothing on that page opens a person now, so the `person_opened` event with `surface: 'avatar_stack'` no longer fires and nothing replaces it. A dashboard segmented on that surface reads zero from this release on.
- Cost is about $0.034 per image. See the issue for the totals.

**See also**

- [meeting-lifecycle.md](./meeting-lifecycle.md) for where `processAgenda` and `summarize` sit in the pipeline
- [../task-architecture.md](../task-architecture.md) for the result handler pattern the triggers hook into
- [../admin-alerts.md](../admin-alerts.md) for the Discord webhook the failures go to
- [../environment-variables.md](../environment-variables.md) for `GEMINI_API_KEY`, `SUBJECT_IMAGES_PREFIX`, `DO_SPACES_BUCKET` and `CDN_URL`; [../task-architecture.md](../task-architecture.md) for `CACHE_URL`
