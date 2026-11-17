"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { Board, GameState } from "@/lib/game";

type Props = {
  board: Board;
  state: GameState;
  colors: string[];
  interactive: boolean;
  onBand: (from: number, to: number) => void;
  /** tutorial only: a band that pulls itself from one peg to another */
  ghost?: { from: number; to: number; key: number } | null;
  /** bump to put the camera back to the starting angle */
  resetView?: number;
};

const PEG_H = 0.34;
const BAND_Y = 0.24;

/** Camera orbit state, shared by the camera rig and the pointer handlers. */
type View = { yaw: number; pitch: number; zoom: number; ty: number; tp: number; tz: number };
const BASE_PITCH = Math.atan2(11.5, 7.5);
const PITCH_MIN = 0.42;   // lowest tilt: board seen from the side
const PITCH_MAX = 1.48;   // highest tilt: almost straight down
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 1.7;
const freshView = (): View => ({ yaw: 0, pitch: BASE_PITCH, zoom: 1, ty: 0, tp: BASE_PITCH, tz: 1 });

/** Keeps the whole board in view on portrait phones as well as wide screens, and eases toward the target orbit. */
function Rig({ radius, view }: { radius: number; view: RefObject<View> }) {
  const { camera, size } = useThree();
  useFrame((_, dt) => {
    const v = view.current;
    const k = 1 - Math.exp(-dt * 12);
    v.yaw += (v.ty - v.yaw) * k;
    v.pitch += (v.tp - v.pitch) * k;
    v.zoom += (v.tz - v.zoom) * k;
    const aspect = size.width / size.height;
    const fit = ((radius + 1.4) / 4.6) * Math.max(1, 0.82 / aspect);
    const d = Math.hypot(11.5, 7.5) * fit * v.zoom;
    camera.position.set(
      Math.sin(v.yaw) * Math.cos(v.pitch) * d,
      Math.sin(v.pitch) * d,
      Math.cos(v.yaw) * Math.cos(v.pitch) * d
    );
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/** Drag on anything that isn't a band drag to orbit; pinch or scroll to zoom. */
function OrbitInput({ view, claimed }: { view: RefObject<View>; claimed: RefObject<boolean> }) {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const spread = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.target !== el) return;
      // a band drag started on a peg in this same event: leave it alone
      if (claimed.current) { claimed.current = false; return; }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) pinch = spread();
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const v = view.current;
      if (pts.size === 1) {
        v.ty -= ((e.clientX - p.x) / el.clientWidth) * Math.PI * 1.6;
        v.tp = Math.min(PITCH_MAX, Math.max(PITCH_MIN, v.tp + ((e.clientY - p.y) / el.clientHeight) * 2.2));
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 2) {
        const s = spread();
        if (pinch > 0) v.tz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.tz * (pinch / s)));
        pinch = s;
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = pts.size === 2 ? spread() : 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      v.tz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.tz * Math.exp(e.deltaY * 0.0015)));
    };
    // window listeners run after three-fiber's own handlers for the same event
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, view, claimed]);
  return null;
}

function BoardBase({ board }: { board: Board }) {
  const slots = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = slots.current;
    if (!m) return;
    const d = new THREE.Object3D();
    let i = 0;
    for (const t of board.tris)
      for (let a = 0; a < 3; a++) {
        const ang = (a * Math.PI * 2) / 3 + (t.up ? Math.PI : 0);
        d.position.set(t.cx + Math.sin(ang) * 0.1, 0.003, t.cz + Math.cos(ang) * 0.1);
        d.rotation.set(0, ang, 0);
        d.updateMatrix();
        m.setMatrixAt(i++, d.matrix);
      }
    m.instanceMatrix.needsUpdate = true;
  }, [board]);
  const R = board.radius + 1.05;
  return (
    <group>
      <mesh position={[0, -0.36, 0]} rotation={[0, Math.PI / 6, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[R + 0.18, R + 0.32, 0.3, 6]} />
        <meshStandardMaterial color="#14171d" roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[0, -0.11, 0]} rotation={[0, Math.PI / 6, 0]} receiveShadow>
        <cylinderGeometry args={[R, R + 0.12, 0.22, 6]} />
        <meshStandardMaterial color="#2b303b" roughness={0.5} metalness={0.1} />
      </mesh>
      <instancedMesh ref={slots} args={[undefined, undefined, board.tris.length * 3]}>
        <boxGeometry args={[0.055, 0.004, 0.2]} />
        <meshStandardMaterial color="#0b0c10" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

function Peg({ x, z, color, held }: { x: number; z: number; color: string; held: boolean }) {
  return (
    <mesh position={[x, PEG_H / 2, z]} castShadow>
      <cylinderGeometry args={[0.058, 0.075, PEG_H, 14]} />
      <meshStandardMaterial
        color={held ? color : "#8690a3"}
        emissive={held ? color : "#000"}
        emissiveIntensity={held ? 0.8 : 0}
        roughness={0.35}
        metalness={0.3}
      />
    </mesh>
  );
}

/** A rubber band looped round two pegs. Snaps into place when first mounted. */
function BandMesh({
  a, b, lift, ghost, color,
}: {
  a: { x: number; z: number }; b: { x: number; z: number };
  lift: number; ghost?: boolean; color?: string;
}) {
  const g = useRef<THREE.Group>(null);
  const t = useRef(ghost ? 1 : 0);
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  useFrame((_, dt) => {
    if (!g.current || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt * 4);
    const e = t.current;
    // overshoot ease: the band twangs slightly as it lands
    const s = 1 + Math.sin(e * Math.PI * 3) * (1 - e) * 0.25;
    g.current.scale.set(e, 1, s);
    g.current.position.y = BAND_Y + lift + (1 - e) * 0.5;
  });
  const mat = (
    <meshStandardMaterial
      color={color ?? "#f4f1e8"}
      roughness={0.6}
      transparent={ghost}
      opacity={ghost ? 0.75 : 1}
      emissive={color ?? "#000"}
      emissiveIntensity={0}
    />
  );
  const w = 0.085;
  return (
    <group
      ref={g}
      position={[(a.x + b.x) / 2, BAND_Y + lift, (a.z + b.z) / 2]}
      rotation={[0, -Math.atan2(dz, dx), 0]}
    >
      {[-w, w].map((o) => (
        <mesh key={o} position={[0, 0, o]} rotation={[0, 0, Math.PI / 2]} castShadow={!ghost}>
          <cylinderGeometry args={[0.022, 0.022, len, 6]} />
          {mat}
        </mesh>
      ))}
      {[-len / 2, len / 2].map((o) => (
        <mesh key={o} position={[o, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[w, 0.022, 6, 18]} />
          {mat}
        </mesh>
      ))}
    </group>
  );
}

/** The leaf-shaped marker a player drops into a triangle they closed. */
function Piece({ x, z, up, color, delay }: { x: number; z: number; up: boolean; color: string; delay: number }) {
  const g = useRef<THREE.Group>(null);
  const t = useRef(-delay);
  useFrame((_, dt) => {
    if (!g.current || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt * 2.6);
    const e = Math.max(0, t.current);
    const bounce = Math.abs(Math.cos(e * Math.PI * 2.5)) * (1 - e);
    g.current.position.y = bounce * 1.6;
    g.current.scale.setScalar(e === 0 ? 0.001 : 0.4 + 0.6 * Math.min(1, e * 2));
    g.current.rotation.y = (up ? 0 : Math.PI) + (1 - e) * 4;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.006, 0]} rotation={[0, up ? 0 : Math.PI, 0]}>
        <cylinderGeometry args={[0.44, 0.44, 0.008, 3]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} />
      </mesh>
      <group ref={g} scale={0.001}>
        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.24, 0.1, 3]} />
          <meshStandardMaterial color={color} roughness={0.3} flatShading />
        </mesh>
        <mesh position={[0, 0.33, 0]} castShadow>
          <coneGeometry args={[0.2, 0.46, 3]} />
          <meshStandardMaterial color={color} roughness={0.25} flatShading emissive={color} emissiveIntensity={0.12} />
        </mesh>
      </group>
    </group>
  );
}

/** Tutorial hand: a band stretching itself from peg to peg with a fingertip marker. */
function DemoDrag({ a, b }: { a: { x: number; z: number }; b: { x: number; z: number } }) {
  const t = useRef(-0.3);
  const [end, setEnd] = useState(a);
  useFrame((_, dt) => {
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / 1.1);
    const e = Math.max(0, t.current);
    const k = e * e * (3 - 2 * e);
    setEnd({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
  });
  return (
    <>
      {Math.hypot(end.x - a.x, end.z - a.z) > 0.12 && <BandMesh ghost a={a} b={end} lift={0.1} />}
      <group position={[end.x, 0.5, end.z]}>
        <mesh>
          <sphereGeometry args={[0.16, 20, 20]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.5} transparent opacity={0.9} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
          <ringGeometry args={[0.24, 0.3, 32]} />
          <meshBasicMaterial color="#fff" transparent opacity={0.6} />
        </mesh>
      </group>
    </>
  );
}

function World({ board, state, colors, interactive, onBand, ghost, claimed }: Props & { claimed: RefObject<boolean> }) {
  const group = useRef<THREE.Group>(null);
  // the band being pulled: anchored on a peg, free end follows the finger
  const [drag, setDrag] = useState<{ from: number; x: number; z: number } | null>(null);
  // tap-tap input: the first peg tapped waits here for the second
  const [picked, setPicked] = useState<number | null>(null);
  const portrait = useThree((s) => s.size.width < s.size.height);
  const color = colors[state.current];
  const claimOrder = useMemo(() => new Map(state.lastClaimed.map((t, i) => [t, i])), [state.lastClaimed]);

  const local = (p: THREE.Vector3) => group.current!.worldToLocal(p.clone());
  const nearest = (x: number, z: number, reach: number) => {
    let best = -1, bd = reach * reach;
    for (const p of board.pegs) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  };
  useEffect(() => { if (!interactive) { setDrag(null); setPicked(null); } }, [interactive]);
  useEffect(() => setPicked(null), [state.current]);

  return (
    <group ref={group} rotation={[0, portrait ? Math.PI / 6 : 0, 0]}>
      <BoardBase board={board} />
      {board.pegs.map((p) => (
        <Peg key={p.id} x={p.x} z={p.z} color={color} held={drag?.from === p.id || picked === p.id || ghost?.from === p.id} />
      ))}
      {state.bands.map((b, i) => (
        <BandMesh key={i} a={board.pegs[b.from]} b={board.pegs[b.to]} lift={(i % 4) * 0.018} />
      ))}
      {drag && Math.hypot(drag.x - board.pegs[drag.from].x, drag.z - board.pegs[drag.from].z) > 0.15 && (
        <BandMesh ghost a={board.pegs[drag.from]} b={drag} lift={0.1} />
      )}
      {ghost && <DemoDrag key={ghost.key} a={board.pegs[ghost.from]} b={board.pegs[ghost.to]} />}
      {state.owners.map((o, t) =>
        o === null ? null : (
          <Piece
            key={t} x={board.tris[t].cx} z={board.tris[t].cz} up={board.tris[t].up}
            color={colors[o]} delay={(claimOrder.get(t) ?? 0) * 0.35 + 0.25}
          />
        )
      )}
      {/* invisible sheet at band height that tracks the finger */}
      <mesh
        position={[0, BAND_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          if (!interactive) return;
          const p = local(e.point);
          const from = nearest(p.x, p.z, 0.5);
          if (from < 0) return setPicked(null);
          claimed.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDrag({ from, x: p.x, z: p.z });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const p = local(e.point);
          setDrag({ from: drag.from, x: p.x, z: p.z });
        }}
        onPointerUp={(e) => {
          if (!drag) return;
          const p = local(e.point);
          const to = nearest(p.x, p.z, 0.5);
          setDrag(null);
          if (to >= 0 && to !== drag.from) {
            // dragged from one peg to another
            setPicked(null);
            onBand(drag.from, to);
          } else if (to === drag.from) {
            // a tap: first tap picks the start peg, second tap on another peg stretches the band
            if (picked === null) setPicked(to);
            else {
              if (picked !== to) onBand(picked, to);
              setPicked(null);
            }
          }
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function Scene(props: Props) {
  const view = useRef<View>(freshView());
  const claimed = useRef(false);
  useEffect(() => {
    const v = view.current;
    // spin back the short way round
    v.ty = Math.round(v.yaw / (Math.PI * 2)) * Math.PI * 2;
    v.tp = BASE_PITCH;
    v.tz = 1;
  }, [props.resetView]);
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 38, position: [0, 11.5, 7.5] }}>
      <Rig radius={props.board.radius} view={view} />
      <OrbitInput view={view} claimed={claimed} />
      <hemisphereLight args={["#eef2ff", "#4a3a30", 1.7]} />
      <directionalLight
        position={[5, 10, 4]} intensity={2.1} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8}
      />
      <pointLight position={[-6, 4, -5]} intensity={40} color="#7aa2ff" />
      <pointLight position={[6, 3, 6]} intensity={30} color="#ffb070" />
      <World {...props} claimed={claimed} />
      <ContactShadows position={[0, -0.52, 0]} scale={22} blur={2.6} opacity={0.55} far={3} />
    </Canvas>
  );
}
