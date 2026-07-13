# Marketing site (`@brain/web`)

One-page marketing site for **Second Brain**: Vite + React + Tailwind v4, matching the desktop app’s warm paper brand (light/dark).

**Live:** [https://muhammaddadu.github.io/second-brain/](https://muhammaddadu.github.io/second-brain/)

## Story (keep honest)

The site sells the **shipped** product only:

- Local vault on disk; desktop app for humans; MCP + `brain` CLI for agents
- `RULES.md`, hybrid search, knowledge graph, databases, wikilinks
- Vision: agents summarise/file the day; the next agent reuses that context

Do **not** market cloud-hosted memory, folderless auto-organisation, or other concepts parked in [E10](../../docs/product/epics/E10-deeper-memory-semantics.md) until those themes are accepted and shipped.

Visual language (card flows, multi-agent fan-in, labeled graph nodes) may borrow grammar from external comps; claims must stay ours.

## Commands

```sh
pnpm --filter @brain/web dev      # http://localhost:5173
pnpm --filter @brain/web build   # dist/ for static hosting
pnpm --filter @brain/web preview
```

From the repo root: `pnpm dev:web`.

## Deploy (GitHub Pages)

The site is published by [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml) on every push to `main` that touches `apps/web/**` (or via **Actions → Deploy marketing site → Run workflow**).

One-time repo setup:

1. **Settings → Pages → Build and deployment → Source:** GitHub Actions  
   (or: `gh api -X POST repos/muhammaddadu/second-brain/pages -f build_type=workflow`)
2. Merge/push to `main` (or run the workflow manually).

The workflow builds with `VITE_BASE=/second-brain/` so asset URLs match the project Pages path. Product docs stay in [`docs/`](../../docs/); they are not the Pages source (that would collide with this site).

Local production-shaped build:

```sh
VITE_BASE=/second-brain/ VITE_SITE_URL=https://muhammaddadu.github.io/second-brain \
  pnpm --filter @brain/web build
```

Download buttons resolve the latest GitHub Release via the public API and link **directly** to installer assets (`browser_download_url`).

## Images

Prefer **WebP** under `public/` (shots, illustrations, demo). Convert with `img2webp`:

```sh
# static
img2webp -lossy -q 82 input.png -o output.webp

# animated (from frames)
img2webp -mixed -q 75 -d 100 frame-01.png frame-02.png -o demo.webp
```

Keep `icon.png` and `og-card.png` as PNG for favicon / Open Graph compatibility.
