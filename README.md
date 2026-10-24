# Story Canvas

An iPad-first PWA: an infinite canvas for planning fiction with Apple Pencil.
See `Story Canvas Requirements` for the full spec. This is **phase 1: canvas foundation**.

## What's in phase 1

- Infinite canvas: two-finger pan, pinch zoom 10%–400% (tap the % to reset to 100%)
- Pen and highlighter with pressure, colors and three sizes; a finger never draws
- Stroke eraser (removes whole strokes)
- Undo/redo (100 steps; ⌘Z / ⇧⌘Z with a keyboard)
- Autosave to IndexedDB within 0.4 s of every change, and immediately when the app is hidden
- JSON backup export (share sheet → Save to Files) and import
- Installable PWA, works offline after first load; install prompt on first visit
- Follows system light/dark mode; the default "Ink" color flips with it

Palm rejection: one finger does nothing; three or more contacts, very wide contacts,
touches while the pen is down, and touches within 0.5 s of the pen lifting are ignored.

On desktop (for development) the mouse draws, scroll pans, ⌘/ctrl+scroll or trackpad
pinch zooms, and space+drag pans.

## Develop

```bash
npm install
npm run dev      # also prints a LAN URL for the iPad
npm test
npm run build    # outputs dist/
```

The dev server over plain http on your LAN is fine for checking drawing, but iPad Safari
only enables the service worker (offline + reliable install) over HTTPS. For the phase 1
exit test, deploy `dist/` to any static HTTPS host (Netlify, Cloudflare Pages, GitHub Pages).

## Phase 1 exit test (on a real iPad + Pencil)

1. Open the HTTPS URL in Safari → Share → Add to Home Screen, then launch from the icon.
2. Draw for 10 minutes: no lag, no stray marks from your palm.
3. Force-quit the app mid-drawing, reopen: at most the last second is missing.
4. Turn on Airplane Mode and relaunch: it still opens and draws.
5. Export a backup, import it: identical ink.

## Layout

- `src/engine/` — canvas engine (input, rendering, hit-testing, undo). No framework.
- `src/db.ts` — IndexedDB storage and autosave
- `src/io.ts` — JSON export/import with `schemaVersion` migrations
- `src/model.ts`, `src/templates.ts` — data model and default card templates (used from phase 2)
- `src/app.tsx` — toolbar and app shell (Preact)
