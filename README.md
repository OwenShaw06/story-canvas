# Story Canvas

An iPad-first PWA for planning fiction: a Freeform-style infinite board with Apple Pencil
ink, whiteboard objects, and structured story cards. Fully local and offline.

## What it does

**Board (whiteboard)**
- Infinite canvas: one finger pans (with momentum), two fingers pinch-zoom 10%–400%
- Sticky notes (8 colours, text auto-fits), text boxes (4 sizes), shapes (6 kinds, with labels),
  photos (from Photos, paste, or drag-and-drop), frames that carry their contents
- Connectors between any two objects: drag a blue handle onto another object, or onto empty
  canvas to create a linked copy; solid / dashed / arrow, optional label ("sister of")
- Alignment guides while dragging; resize from any corner (photos keep their shape)
- Floating context bar: colour, shape, text size, collapse, duplicate, front/back, delete
- Backgrounds: dots, grid, lines, plain

**Ink**
- Pen and highlighter with Pencil pressure, colours and sizes; whole-stroke eraser; lasso
- Ink that starts on a card or sticky belongs to it and moves with it (clipped to it)
- Fingers never draw; palm rejection ignores wide contacts, resting hands and touches
  around Pencil use

**Story cards**
- Character, Location, Faction, Magic/Tech System, Plot Event, Item, Note, Sketch
- Filled fields show; empty ones collapse into “+ Field” chips while a card is selected
- Tags, tag filter (dims everything else), colours, collapse to a header
- Template editor: rename, recolour, re-icon, add/reorder/remove fields, duplicate templates

**Organise & export**
- World list with thumbnails; rename, duplicate, delete
- Search across every card field, note and frame; tap a result to fly to it
- Export: PNG, PDF, Markdown for Obsidian (one note per card, connections as [[wiki links]]),
  and a complete JSON backup (images included) that can be re-opened as a new world
- Undo/redo for everything (200 steps); two-finger tap = undo, three-finger tap = redo
- Autosave within 0.4 s of any edit; follows system light/dark mode

**Keyboard (Magic Keyboard / desktop)**: V select · P pen · H highlighter · E eraser ·
L lasso · N sticky · T text · ⌘Z / ⇧⌘Z · ⌘D duplicate · ⌘C/X/V · ⌘A · Delete ·
arrows nudge · ⌘0 actual size · ⌘1 fit · space-drag pans · scroll pans · ⌘/pinch zooms

## Develop

```bash
npm install
npm run dev      # also prints a LAN URL for the iPad
npm test
npm run build    # outputs dist/
```

The dev server over plain http is fine for trying things on the iPad, but Safari only
enables offline mode and reliable install over HTTPS. Deploy `dist/` to any static HTTPS
host (Netlify, Cloudflare Pages, GitHub Pages) for real use.

## Layout

- `src/doc.ts` — document store: every edit, undo/redo, change notifications
- `src/board.ts` — one open board: selection, tools, and editing actions
- `src/controller.ts` — all touch, Pencil, mouse, keyboard, paste and drop input
- `src/engine/` — view (pan/zoom/animation) and canvas rendering of ink
- `src/ui/` — Preact components: board screen, nodes, overlays, toolbars, panels, home
- `src/db.ts`, `src/migrate.ts`, `src/io.ts` — IndexedDB storage, migrations, backups
- `src/export.ts` — PNG/PDF rendering, Markdown + zip
- `src/model.ts`, `src/templates.ts`, `src/palette.ts` — data model, default templates, colours

Data model v2 extends the requirements doc: cards are one kind of board node, and links
can join any two nodes. Phase-1 data migrates automatically.
