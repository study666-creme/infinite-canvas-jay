# AI Handoff Notes

This file is for future AI agents taking over this fork. Read it before editing canvas or Prompt Hub integration code.

## Scope

- Canvas repo: `D:\canvas\infinite-canvas`
- Canvas web app: `D:\canvas\infinite-canvas\web`
- Prompt Hub repo: `D:\prompt-hub`
- Do not mix unrelated Prompt Hub app changes into Canvas commits unless the task explicitly spans both repos.
- The working tree may contain pre-existing user changes. Check `git status --short --branch` first and do not revert files you did not change.

## Recent Canvas / Prompt Hub Generation Fix

User issue: standalone image generation node worked, but generating through a connected image node could fail; generated images were visible in canvas but not in the image generation page.

Important files:

- `web/src/services/prompt-hub-generation.ts`
- `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- `web/src/services/image-generation-logs.ts`
- `web/src/app/(user)/image/page.tsx`
- `web/src/app/(user)/video/page.tsx`
- Prompt Hub backend limit reference: `D:\prompt-hub\server\src\routes\v1\generate.ts`

Root cause found:

- Connected image generation sends upstream images as Prompt Hub reference images.
- Large data URLs can exceed the Prompt Hub `/api/v1/generate` reference-image input limit.
- Prompt Hub `/api/v1/generate` can also fail with `参考图上传失败：Bucket not found` when data URL refs hit the backend Supabase `card-images` upload path on a deployment without that bucket.
- Standalone text-to-image does not send the reference image, so it can succeed while connected generation fails.
- **Additional logic bug (2026-07-06):** image nodes with existing content always used *only* the node’s own image as reference, ignoring connected upstream images. Fixed: connected references now take priority; self-image is fallback when no connections exist.

Implemented behavior:

- Canvas now converts reference images to data URLs, compresses the copy, uploads it through Prompt Hub `/api/v1/media/upload`, then submits the returned `storage://card-images/...` refs to `/api/v1/generate`.
- The original canvas image is not modified.
- Successful canvas image generations are also appended to the shared `image_generation_logs` localforage store, so the `/image` page can show them.
- Prompt Hub API errors are parsed from nested `{ error: { message, code, details } }` envelopes before reaching canvas nodes; seeing `[object Object]` in an image node usually means this parser regressed.

If this path breaks again, inspect:

1. Whether `referenceImagesToRefUrls` returns Prompt Hub `storage://card-images/...` refs instead of raw data URLs.
2. Whether `requestPromptHubCanvasImages` gets a valid Prompt Hub session from `usePromptHubStore`.
3. Whether generated items are uploaded with `uploadImage` and then passed to `recordCanvasImageGeneration`.
4. Whether `/image` history reads `image_generation_logs` and hydrates full media only when a log is opened.

## First-Screen Loading Notes

Recent optimization:

- `/image` and `/video` history lists no longer hydrate all stored media on first paint.
- Lists read lightweight log summaries; full image/video/reference URLs are resolved only when a user opens a log.
- `/api/prompts` now uses Next revalidation and a short remote GitHub fetch timeout to avoid slow prompt repositories blocking first-screen rendering.

Known remaining structural issue:

- Canvas project list still reads the entire `infinite-canvas:canvas_store` JSON from localforage.
- With many projects or large node/chat data, `/canvas` can show `loading canvas` for several seconds.
- A real fix should split project list metadata from project detail data:
  - project index: id, title, counts, updatedAt, small preview
  - project detail: nodes, connections, chatSessions, viewport
- Do not attempt that migration casually; it changes persisted data shape and needs a compatibility plan.

## Validation Commands

From `D:\canvas\infinite-canvas\web`:

```bash
npm run build
```

Useful local smoke checks:

- `/`
- `/image`
- `/video`
- `/canvas`

Expected after the recent fixes:

- `npm run build` succeeds.
- `/image` and `/video` first render should not block on all historical media.
- No broken images in first-screen smoke checks.
- Ant Design Drawer warning for `height` should not be reintroduced; use `size` for bottom drawer custom height.

## Coding Cautions

- Canvas page file is large. Prefer small helper files when adding shared behavior, but avoid broad refactors during bug fixes.
- Media should be stored through `uploadImage` / `uploadMediaFile`, not directly as long-lived base64 in JSON.
- Use `imageToDataUrl` only when an API needs a data URL; do not eagerly convert media during first render.
- For Prompt Hub generated image history, keep `storageKey` and leave `dataUrl` empty in persisted logs when possible.
- Do not document or reuse private user credentials from chat history.

## Canvas Composer UI (2026-07-06)

Large bottom prompt panel under selected nodes (`canvas-node-prompt-panel.tsx`):

- Apple-style glass shell: `.canvas-composer-shell` in `globals.css`, anchored by `.canvas-node-panel-anchor`, width up to `min(1680px, 86vw)`.
- Image nodes now show the same reference strip + `@` picker as video nodes when upstream assets are connected.
- Connection handles (`ConnectionHandlePlus`): visible only on node hover (not when merely selected); hovering one side hides the other; handle expands ~2× while dragging a line.

Key files:

- `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- `web/src/app/(user)/canvas/components/canvas-node.tsx`
- `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx` (`handleGenerateNode` reference priority)
- `web/src/app/globals.css` (`.canvas-composer-*`)

## Creative Director Agent (2026-07-06)

The canvas assistant prompt now treats creative work as a full-chain creative director task, not a generic chat task.

Key files:

- `web/src/app/(user)/canvas/utils/short-drama-agent-prompt.ts`
- `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
- `docs/content/docs/overview/creative-agent.mdx`

Current behavior:

- Creative requests about story, script, characters, IP, directing, shots, color, editing, sound, AI video prompting, thumbnails/titles, retention, comments, platform spread, aesthetics, or internet sense should inject `CREATIVE_KNOWLEDGE_CORE_CONTEXT`.
- Short drama mode always injects the same core plus the short-drama director workflow.
- The core is meant to be applied silently during creation. Do not dump knowledge cards unless the user explicitly asks to list or visualize the knowledge base.
- The quality gate rejects low-quality trend hacks, unverified prompt folklore, generic "cinematic/high-end" wording, and short-lived platform loopholes.
- The internet-sense layer covers hooks, thumbnails/titles, comment triggers, platform adaptation, modern aesthetics, trend decomposition, and A/B alternatives.

Caution:

- Do not claim the agent owns complete books, full video transcripts, or real-time trend data. It has an original summarized knowledge core and can use user-provided samples or notes to specialize further.
