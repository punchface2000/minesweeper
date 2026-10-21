// Pinch-to-zoom and pan for the board, built on pointer events.
// Two fingers: pinch + move. One finger while zoomed: pan (taps still work, since a tap barely moves).
//
// During a gesture the board is scaled with a cheap CSS transform. When the fingers lift, the zoom is
// "committed": the app re-lays out the board at the new cell size (crisp text, 1px grid lines) and the
// transform goes back to scale(1) with the same content under the same spot.

export interface ZoomController {
  /** Back to "fit the screen". */
  reset(animate?: boolean): void;
  setMaxZoom(max: number): void;
  /** True while a pinch/pan is in progress; taps should be ignored then. */
  busy(): boolean;
  zoom(): number;
}

interface Options {
  /** Re-lay out the board for zoom level z (1 = fits the screen). Must update the frame's size synchronously. */
  commit(z: number): void;
  onChange(z: number): void;
  onGestureStart(): void;
}

const PAN_THRESHOLD = 10;
const MIN_ZOOM = 1;

export function attachZoom(wrap: HTMLElement, frame: HTMLElement, opts: Options): ZoomController {
  let z = 1; // total zoom relative to "fit"
  let c = 1; // zoom the layout is currently built for
  let tx = 0;
  let ty = 0;
  let maxZoom = 1;
  const pts = new Map<number, { x: number; y: number }>();
  let base: { z: number; tx: number; ty: number; mid: { x: number; y: number }; d: number } | null = null;
  let panning = false;
  let multi = false; // stays true until all fingers lift after a pinch, so lifting one finger doesn't tap

  const v = () => z / c; // visual (transform) scale on top of the layout
  const local = (e: PointerEvent) => {
    const r = wrap.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Keep the board covering the view (or centred when it is smaller than the view). */
  function clamp(): void {
    const fit = (size: number, view: number, origin: number, t: number) => {
      const scaled = size * v();
      if (scaled <= view) return (view - scaled) / 2 - origin;
      return Math.min(-origin, Math.max(view - scaled - origin, t));
    };
    tx = fit(frame.offsetWidth, wrap.clientWidth, frame.offsetLeft, tx);
    ty = fit(frame.offsetHeight, wrap.clientHeight, frame.offsetTop, ty);
  }

  function apply(animate = false): void {
    clamp();
    const s = v();
    frame.style.transition = animate ? 'transform .25s cubic-bezier(.2, 1, .4, 1)' : 'none';
    frame.style.transform = Math.abs(s - 1) < 0.001 && Math.abs(tx) < 1 && Math.abs(ty) < 1 ? '' : `translate(${tx}px, ${ty}px) scale(${s})`;
    opts.onChange(z);
  }

  /** Re-lay out at the current zoom, keeping the content point at the view centre in place. */
  function commit(): void {
    if (Math.abs(z - c) < 0.005) return;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    const fx = (cx - frame.offsetLeft - tx) / (frame.offsetWidth * v());
    const fy = (cy - frame.offsetTop - ty) / (frame.offsetHeight * v());
    opts.commit(z);
    c = z;
    tx = cx - frame.offsetLeft - fx * frame.offsetWidth;
    ty = cy - frame.offsetTop - fy * frame.offsetHeight;
    apply();
  }

  function snapshot(): void {
    const list = [...pts.values()];
    const mid = list.length > 1 ? { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 } : list[0];
    const d = list.length > 1 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 1;
    base = { z, tx, ty, mid, d };
  }

  wrap.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse') return;
      pts.set(e.pointerId, local(e));
      if (pts.size === 2) {
        multi = true;
        opts.onGestureStart();
      }
      snapshot();
    },
    true
  );

  wrap.addEventListener(
    'pointermove',
    (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      if (!base) return;
      const list = [...pts.values()];
      if (list.length >= 2) {
        const mid = { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 };
        const d = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
        const vBase = base.z / c;
        // content point (layout px) under the starting midpoint stays under the fingers
        const px = (base.mid.x - frame.offsetLeft - base.tx) / vBase;
        const py = (base.mid.y - frame.offsetTop - base.ty) / vBase;
        z = Math.min(maxZoom * 1.15, Math.max(MIN_ZOOM * 0.85, base.z * (d / base.d)));
        tx = mid.x - frame.offsetLeft - px * v();
        ty = mid.y - frame.offsetTop - py * v();
        apply();
      } else if (z > 1.001) {
        const dx = list[0].x - base.mid.x;
        const dy = list[0].y - base.mid.y;
        if (!panning && Math.hypot(dx, dy) > PAN_THRESHOLD) {
          panning = true;
          opts.onGestureStart();
        }
        if (panning) {
          tx = base.tx + dx;
          ty = base.ty + dy;
          apply();
        }
      }
    },
    true
  );

  const end = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size === 0) {
      base = null;
      const target = Math.min(maxZoom, Math.max(MIN_ZOOM, z));
      if (target !== z) {
        z = target;
        apply();
      }
      commit();
      // let the board's pointerup (bubbling after this capture listener) still see busy()
      setTimeout(() => {
        panning = false;
        multi = false;
      }, 0);
    } else snapshot();
  };
  wrap.addEventListener('pointerup', end, true);
  wrap.addEventListener('pointercancel', end, true);

  // Safari's own pinch gesture must not zoom the page
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  return {
    reset(animate = false) {
      z = 1;
      tx = 0;
      ty = 0;
      if (c !== 1) {
        opts.commit(1);
        c = 1;
      }
      apply(animate);
    },
    setMaxZoom(m: number) {
      maxZoom = Math.max(1, m);
    },
    busy: () => multi || panning || pts.size > 1,
    zoom: () => z
  };
}
