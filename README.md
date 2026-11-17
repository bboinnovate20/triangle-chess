# Triangle Chess

3D rubber-band triangle game built with Next.js 15 (App Router), React 19, Three.js and React Three Fiber.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static site in ./out (deploy anywhere, or push to Vercel)
```

- `lib/game.ts` — pure game logic: board lattice, legal moves, triangle capture, CPU player
- `components/Scene.tsx` — the 3D board, pegs, bands and pieces
- `components/Game.tsx` — game state, HUD, setup menu, sounds
- `app/globals.css` — UI styling

Play: 2–5 players on one device or against CPU players; drag a band or tap two pegs.
Drag anywhere off the pegs to turn and tilt the board, pinch or scroll to zoom, ⟲ resets the view.

Rules: stretch one band per turn in a straight line (1–3 gaps), no overlapping bands;
closing a small triangle claims it; most triangles wins. Change `MAX_BAND` in `lib/game.ts` to tune.
