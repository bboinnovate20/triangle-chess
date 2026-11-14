// Triangle Chess — pure game logic (no React, no Three).
// Board: a hexagon of pegs on a triangular lattice. Players stretch rubber
// bands between pegs; whoever closes a small triangle claims it.

export const MAX_BAND = 3; // a band may span 1–3 peg gaps in a straight line

export type Peg = { id: number; q: number; r: number; x: number; z: number };
export type Tri = {
  id: number;
  pegs: [number, number, number];
  edges: [string, string, string];
  cx: number;
  cz: number;
  up: boolean;
};
export type Board = {
  radius: number;
  pegs: Peg[];
  tris: Tri[];
  pegAt: Map<string, number>;
  edgeTris: Map<string, number[]>;
  edgeCount: number;
};
export type Move = { from: number; to: number; edges: string[] };
export type Band = { from: number; to: number; player: number };
export type GameState = {
  edges: Record<string, true>;
  bands: Band[];
  owners: (number | null)[];
  scores: number[];
  current: number;
  over: boolean;
  lastClaimed: number[];
};

const DIRS: [number, number][] = [
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1],
];
const SQ3 = Math.sqrt(3) / 2;

export const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function createBoard(radius: number): Board {
  const pegs: Peg[] = [];
  const pegAt = new Map<string, number>();
  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      if (Math.abs(q + r) > radius) continue;
      const id = pegs.length;
      pegs.push({ id, q, r, x: q + r / 2, z: r * SQ3 });
      pegAt.set(`${q},${r}`, id);
    }
  }
  const tris: Tri[] = [];
  const edgeTris = new Map<string, number[]>();
  const add = (a?: number, b?: number, c?: number, up = true) => {
    if (a === undefined || b === undefined || c === undefined) return;
    const id = tris.length;
    const edges: [string, string, string] = [edgeKey(a, b), edgeKey(b, c), edgeKey(a, c)];
    const P = [pegs[a], pegs[b], pegs[c]];
    tris.push({
      id, pegs: [a, b, c], edges, up,
      cx: (P[0].x + P[1].x + P[2].x) / 3,
      cz: (P[0].z + P[1].z + P[2].z) / 3,
    });
    for (const e of edges) {
      if (!edgeTris.has(e)) edgeTris.set(e, []);
      edgeTris.get(e)!.push(id);
    }
  };
  for (let r = -radius - 1; r <= radius; r++)
    for (let q = -radius - 1; q <= radius; q++) {
      const g = (dq: number, dr: number) => pegAt.get(`${q + dq},${r + dr}`);
      add(g(0, 0), g(1, 0), g(0, 1), true);
      add(g(1, 0), g(0, 1), g(1, 1), false);
    }
  return { radius, pegs, tris, pegAt, edgeTris, edgeCount: edgeTris.size };
}

export function newGame(board: Board, players: number): GameState {
  return {
    edges: {},
    bands: [],
    owners: board.tris.map(() => null),
    scores: Array(players).fill(0),
    current: 0,
    over: false,
    lastClaimed: [],
  };
}

/** Every legal band that starts on `from`. */
export function movesFrom(board: Board, edges: Record<string, true>, from: number): Move[] {
  const out: Move[] = [];
  const p = board.pegs[from];
  for (const [dq, dr] of DIRS) {
    let prev = from;
    const path: string[] = [];
    for (let n = 1; n <= MAX_BAND; n++) {
      const next = board.pegAt.get(`${p.q + dq * n},${p.r + dr * n}`);
      if (next === undefined) break;
      const k = edgeKey(prev, next);
      if (edges[k]) break; // bands may not overlap
      path.push(k);
      out.push({ from, to: next, edges: [...path] });
      prev = next;
    }
  }
  return out;
}

export function allMoves(board: Board, edges: Record<string, true>): Move[] {
  const out: Move[] = [];
  for (const p of board.pegs)
    for (const m of movesFrom(board, edges, p.id)) if (m.from < m.to) out.push(m);
  return out;
}

export function applyMove(board: Board, s: GameState, m: Move): GameState {
  const edges = { ...s.edges };
  for (const e of m.edges) edges[e] = true;
  const owners = [...s.owners];
  const scores = [...s.scores];
  const claimed: number[] = [];
  for (const e of m.edges)
    for (const t of board.edgeTris.get(e) ?? []) {
      if (owners[t] !== null) continue;
      if (board.tris[t].edges.every((k) => edges[k])) {
        owners[t] = s.current;
        scores[s.current]++;
        claimed.push(t);
      }
    }
  const over = Object.keys(edges).length >= board.edgeCount;
  return {
    edges,
    bands: [...s.bands, { from: m.from, to: m.to, player: s.current }],
    owners,
    scores,
    current: over ? s.current : (s.current + 1) % s.scores.length,
    over,
    lastClaimed: claimed,
  };
}

/** Greedy CPU: grab triangles, avoid leaving two-sided triangles for the next player. */
export function cpuMove(board: Board, s: GameState): Move | null {
  const moves = allMoves(board, s.edges);
  if (!moves.length) return null;
  let best: Move[] = [];
  let bestScore = -Infinity;
  for (const m of moves) {
    const added = new Set(m.edges);
    const seen = new Set<number>();
    let gain = 0;
    let gifts = 0;
    for (const e of m.edges)
      for (const t of board.edgeTris.get(e) ?? []) {
        if (seen.has(t) || s.owners[t] !== null) continue;
        seen.add(t);
        const n = board.tris[t].edges.filter((k) => s.edges[k] || added.has(k)).length;
        if (n === 3) gain++;
        else if (n === 2) gifts++;
      }
    const score = gain * 10 - gifts * 6 + Math.random();
    if (score > bestScore + 1) { bestScore = score; best = [m]; }
    else if (Math.abs(score - bestScore) <= 1) best.push(m);
  }
  return best[Math.floor(Math.random() * best.length)];
}

export const PALETTE = [
  { name: "Green", color: "#3ddc5a" },
  { name: "Orange", color: "#ff6a2b" },
  { name: "Blue", color: "#2f8cff" },
  { name: "Yellow", color: "#ffd21f" },
  { name: "Purple", color: "#b46bff" },
];
