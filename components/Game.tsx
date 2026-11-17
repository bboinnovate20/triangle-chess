"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PALETTE, applyMove, cpuMove, createBoard, movesFrom, newGame,
  type GameState, type Move,
} from "@/lib/game";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

// Scripted tutorial on a small board: [from peg, to peg, caption, is the move legal]
const DEMO: [[number, number], [number, number], string, boolean][] = [
  [[-1, 0], [1, 0], "Drag a band from peg to peg, or tap the two pegs. Straight lines only, up to 3 gaps.", true],
  [[1, 0], [0, 1], "Players take turns. Orange adds a second side.", true],
  [[0, 1], [0, -1], "Green closes the third side, so the triangle is Green's.", true],
  [[-1, 0], [0, 0], "Bands can't lie on top of each other. This one snaps back.", false],
  [[0, -1], [1, -1], "No hints are shown. Orange tries again somewhere else.", true],
  [[1, -1], [1, 0], "Careful: Green leaves two triangles one side short.", true],
  [[0, 0], [1, -1], "Orange closes both with one band. Most triangles wins!", true],
];

type Seat = { cpu: boolean };
type Config = { size: number; seats: Seat[] };

/** Tiny synth so the game needs no audio files. */
function useSound(enabled: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  return useCallback(
    (kind: "band" | "claim" | "win" | "bad") => {
      if (!enabled) return;
      try {
        ctx.current ??= new AudioContext();
        const ac = ctx.current;
        const notes = kind === "bad" ? [110] : kind === "band" ? [220] : kind === "claim" ? [523, 784] : [523, 659, 784, 1047];
        notes.forEach((f, i) => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          const t0 = ac.currentTime + i * 0.11;
          o.type = kind === "band" ? "triangle" : "sine";
          o.frequency.setValueAtTime(f, t0);
          if (kind === "band") o.frequency.exponentialRampToValueAtTime(f * 0.6, t0 + 0.18);
          g.gain.setValueAtTime(0.16, t0);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
          o.connect(g).connect(ac.destination);
          o.start(t0);
          o.stop(t0 + 0.32);
        });
      } catch {}
    },
    [enabled]
  );
}

export default function Game() {
  const [config, setConfig] = useState<Config>({ size: 4, seats: [{ cpu: false }, { cpu: true }] });
  const [draft, setDraft] = useState<Config>(config);
  const [menu, setMenu] = useState(true);
  const [rules, setRules] = useState(false);
  const [sound, setSound] = useState(true);
  const board = useMemo(() => createBoard(config.size), [config.size]);
  const [state, setState] = useState<GameState>(() => newGame(board, config.seats.length));
  const [gameId, setGameId] = useState(0);
  const [oops, setOops] = useState(0);
  const [resetView, setResetView] = useState(0);
  const [demo, setDemo] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ from: number; to: number; key: number } | null>(null);
  const play = useSound(sound);

  const colors = PALETTE.map((p) => p.color);
  const cpuTurn = !state.over && !menu && config.seats[state.current].cpu;

  const start = () => {
    const b = createBoard(draft.size);
    setConfig(draft);
    setState(newGame(b, draft.seats.length));
    setGameId((g) => g + 1);
    setMenu(false);
    setDemo(null);
    setGhost(null);
  };

  const startDemo = () => {
    const cfg = { size: 2, seats: [{ cpu: false }, { cpu: false }] };
    setConfig(cfg);
    setState(newGame(createBoard(2), 2));
    setGameId((g) => g + 1);
    setMenu(false);
    setRules(false);
    setGhost(null);
    setDemo(0);
  };
  const openMenu = () => {
    if (demo === null) setDraft(config);
    setDemo(null);
    setGhost(null);
    setMenu(true);
  };

  const commit = useCallback(
    (m: Move) => {
      setState((s) => {
        const n = applyMove(board, s, m);
        play(n.over ? "win" : n.lastClaimed.length ? "claim" : "band");
        return n;
      });
    },
    [board, play]
  );

  const onBand = (from: number, to: number) => {
    if (cpuTurn || state.over) return;
    const m = movesFrom(board, state.edges, from).find((x) => x.to === to);
    if (m) return commit(m);
    play("bad");
    setOops((n) => n + 1);
  };
  useEffect(() => {
    if (!oops) return;
    const t = setTimeout(() => setOops(0), 1600);
    return () => clearTimeout(t);
  }, [oops]);

  // tutorial driver: show the band being pulled, then place it (or reject it)
  useEffect(() => {
    if (demo === null || demo >= DEMO.length) return;
    const [a, b, , legal] = DEMO[demo];
    const from = board.pegAt.get(a.join(","))!;
    const to = board.pegAt.get(b.join(","))!;
    setGhost({ from, to, key: demo });
    const t1 = setTimeout(() => {
      setGhost(null);
      const m = movesFrom(board, state.edges, from).find((x) => x.to === to);
      if (legal && m) commit(m);
      else { play("bad"); setOops((n) => n + 1); }
    }, 1900);
    const t2 = setTimeout(() => setDemo((d) => (d === null ? d : d + 1)), 4300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  useEffect(() => {
    if (!cpuTurn) return;
    const t = setTimeout(() => {
      const m = cpuMove(board, state);
      if (m) commit(m);
    }, 850);
    return () => clearTimeout(t);
  }, [cpuTurn, state, board, commit]);

  const names = config.seats.map((s, i) => {
    const humans = config.seats.filter((x) => !x.cpu).length;
    if (s.cpu) return `CPU ${PALETTE[i].name}`;
    return humans === 1 ? "You" : PALETTE[i].name;
  });
  const top = Math.max(...state.scores);
  const winners = state.scores.flatMap((s, i) => (s === top ? [i] : []));
  const total = board.tris.length;
  const claimed = state.scores.reduce((a, b) => a + b, 0);

  const hint = state.over
    ? ""
    : cpuTurn
    ? `${names[state.current]} is thinking…`
    : oops
    ? "That band can't go there"
    : `${names[state.current] === "You" ? "Your" : names[state.current] + "'s"} turn: drag or tap two pegs`;

  return (
    <main className="app">
      <div className="stage">
        <Scene
          key={gameId}
          board={board} state={state} colors={colors}
          interactive={!cpuTurn && !state.over && !menu && demo === null}
          onBand={onBand} ghost={ghost} resetView={resetView}
        />
      </div>

      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path d="M12 3 22 20H2Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
            <circle cx="12" cy="14.5" r="2.2" fill="currentColor" />
          </svg>
          <span>Triangle Chess</span>
        </div>
        <div className="actions">
          <button onClick={() => setResetView((n) => n + 1)} aria-label="Reset view" title="Reset view">⟲</button>
          <button onClick={() => setSound((s) => !s)} aria-label="Toggle sound">{sound ? "🔊" : "🔇"}</button>
          <button onClick={() => setRules(true)}>Rules</button>
          <button onClick={openMenu}>New</button>
        </div>
      </header>

      <section className="scores">
        {config.seats.map((_, i) => (
          <div
            key={i}
            className={`card ${state.current === i && !state.over ? "active" : ""}`}
            style={{ ["--c" as string]: colors[i] }}
          >
            <span className="dot" />
            <span className="name">{names[i]}</span>
            <span className="pts">{state.scores[i]}</span>
          </div>
        ))}
      </section>

      {demo !== null ? (
        <footer className="bottom">
          <div className="coach">
            <div className="steps">
              {DEMO.map((_, i) => <i key={i} className={i <= Math.min(demo, DEMO.length - 1) ? "on" : ""} />)}
            </div>
            <p key={demo}>{DEMO[Math.min(demo, DEMO.length - 1)][2]}</p>
            <div className="row">
              {demo >= DEMO.length && <button className="ghost" onClick={startDemo}>Watch again</button>}
              <button className="primary" onClick={openMenu}>{demo >= DEMO.length ? "Play now" : "Skip & play"}</button>
            </div>
          </div>
        </footer>
      ) : (
      <footer className="bottom">
        <div className="progress"><i style={{ width: `${(claimed / total) * 100}%` }} /></div>
        <p key={oops} className={`hint ${oops ? "shake" : ""}`} style={{ ["--c" as string]: colors[state.current] }}>
          {hint && <span className="dot" />}
          {hint}
          <small>{claimed}/{total} triangles</small>
        </p>
      </footer>
      )}

      {state.over && !menu && (
        <div className="overlay">
          <div className="panel win">
            <div className="trophy" style={{ ["--c" as string]: colors[winners[0]] }}>▲</div>
            <h2>{winners.length > 1 ? "It's a tie!" : `${names[winners[0]]} win${names[winners[0]] === "You" ? "" : "s"}!`}</h2>
            <ul className="final">
              {config.seats.map((_, i) => (
                <li key={i} style={{ ["--c" as string]: colors[i] }}>
                  <span className="dot" /> {names[i]} <b>{state.scores[i]}</b>
                </li>
              ))}
            </ul>
            <button className="primary" onClick={() => { setDraft(config); start(); }}>Play again</button>
            <button className="ghost" onClick={() => { setDraft(config); setMenu(true); }}>Change setup</button>
          </div>
        </div>
      )}

      {menu && (
        <div className="overlay">
          <div className="panel">
            <h1>Triangle Chess</h1>
            <p className="sub">Stretch bands. Close triangles. Claim the board.</p>

            <label>Mode</label>
            <div className="seg">
              <button
                className={draft.seats.every((x) => !x.cpu) ? "on" : ""}
                onClick={() => setDraft((d) => ({ ...d, seats: d.seats.map(() => ({ cpu: false })) }))}
              >Same device</button>
              <button
                className={draft.seats.some((x) => x.cpu) ? "on" : ""}
                onClick={() => setDraft((d) => ({ ...d, seats: d.seats.map((_, i) => ({ cpu: i > 0 })) }))}
              >vs Computer</button>
            </div>

            <label>Players</label>
            <div className="seg">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={draft.seats.length === n ? "on" : ""}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      seats: Array.from({ length: n }, (_, i) => d.seats[i] ?? { cpu: d.seats.some((x) => x.cpu) }),
                    }))
                  }
                >{n}</button>
              ))}
            </div>

            <div className="seats">
              {draft.seats.map((s, i) => (
                <button
                  key={i}
                  className="seat"
                  style={{ ["--c" as string]: colors[i] }}
                  onClick={() =>
                    setDraft((d) => ({ ...d, seats: d.seats.map((x, j) => (j === i ? { cpu: !x.cpu } : x)) }))
                  }
                >
                  <span className="dot" />
                  {PALETTE[i].name}
                  <em>{s.cpu ? "CPU" : "Human"}</em>
                </button>
              ))}
            </div>

            <label>Board</label>
            <div className="seg">
              {[[3, "Small"], [4, "Classic"], [5, "Large"]].map(([n, l]) => (
                <button key={n} className={draft.size === n ? "on" : ""} onClick={() => setDraft((d) => ({ ...d, size: n as number }))}>
                  {l}
                </button>
              ))}
            </div>

            <button className="primary" onClick={start}>Start game</button>
            <button className="ghost" onClick={startDemo}>▶ Watch how to play</button>
          </div>
        </div>
      )}

      {rules && (
        <div className="overlay" onClick={() => setRules(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h2>How to play</h2>
            <ol className="rules">
              <li>On your turn, drag a band from one peg to another, or tap the two pegs one after the other. It must run in a straight line, 1, 2 or 3 gaps long.</li>
              <li>Bands can cross at pegs but can never lie on top of another band.</li>
              <li>Close the third side of a small triangle and it&apos;s yours — your piece drops in. One band can close several.</li>
              <li>Don&apos;t leave a triangle with two sides done: the next player will take it.</li>
              <li>When the board is full, the most triangles wins.</li>
            </ol>
            <p className="sub">No hints: if a band isn&apos;t allowed it snaps back and you try again. Drag anywhere off the pegs to turn and tilt the board; pinch or scroll to zoom; ⟲ resets the view.</p>
            <button className="primary" onClick={() => setRules(false)}>Got it</button>
            <button className="ghost" onClick={startDemo}>▶ Watch how to play</button>
          </div>
        </div>
      )}
    </main>
  );
}
