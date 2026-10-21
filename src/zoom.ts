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
  /**
   * Re-lay out the board for zoom level z (1 = fits the screen) and return the zoom actually used
   * (cell sizes are whole pixels, so it can differ slightly). Must update the layout synchronously.
   */
  commit(z: number): number;
  /** Distance in layout px from one cell to the next (cell size + grid gap). */
  pitch(): number;
  /** Layout px before the first cell (the frame border). */
  inset: number;
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
  let anchor: { x: number; y: number } | null = null; // last pinch midpoint, the point that must not move
  let settleTimer = 0;

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
    frame.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    opts.onChange(z);
  }

  /** Layout point (frame px, unscaled) currently shown at view point p. */
  const contentAt = (p: { x: number; y: number }) => ({ x: (p.x - frame.offsetLeft - tx) / v(), y: (p.y - frame.offsetTop - ty) / v() });
  /** Choose tx/ty so that layout point q is shown at view point p. */
  const pin = (q: { x: number; y: number }, p: { x: number; y: number }) => {
    tx = p.x - frame.offsetLeft - q.x * v();
    ty = p.y - frame.offsetTop - q.y * v();
  };

  /**
   * Re-lay out at the current zoom without moving anything on screen. Grid gaps and the border keep their
   * pixel size when cells grow, so map positions through the cell pitch instead of the frame size.
   */
  function commit(): void {
    if (Math.abs(z - c) < 0.005) return;
    const p = anchor ?? { x: wrap.clientWidth / 2, y: wrap.clientHeight / 2 };
    const q = contentAt(p);
    const before = opts.pitch();
    z = opts.commit(z);
    c = z;
    const ratio = opts.pitch() / before;
    pin({ x: opts.inset + (q.x - opts.inset) * ratio, y: opts.inset + (q.y - opts.inset) * ratio }, p);
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
        z = rubber(base.z * (d / base.d));
        tx = mid.x - frame.offsetLeft - px * v();
        ty = mid.y - frame.offsetTop - py * v();
        anchor = mid;
        apply();
      } else if (z > 1.001) {
        const dx = list[0].x - base.mid.x;
        const dy = list[0].y - base.mid.y;
        if (!panning && Math.hypot(dx, dy) > PAN_THRESHOLD) {
          panning = true;
          opts.onGestureStart();
        }
        if (panning) {
          anchor = null;
          tx = base.tx + dx;
          ty = base.ty + dy;
          apply();
        }
      }
    },
    true
  );

  /** Past the limits the pinch gets stiffer instead of stopping dead. */
  function rubber(raw: number): number {
    if (raw > maxZoom) return maxZoom * (1 + Math.min(0.15, (raw / maxZoom - 1) * 0.35));
    if (raw < MIN_ZOOM) return MIN_ZOOM * (1 - Math.min(0.15, (1 - raw / MIN_ZOOM) * 0.35));
    return raw;
  }

  const end = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size === 0) {
      base = null;
      const target = Math.min(maxZoom, Math.max(MIN_ZOOM, z));
      clearTimeout(settleTimer);
      if (target !== z) {
        // spring back to the limit around the fingers, not around the board's corner
        const p = anchor ?? { x: wrap.clientWidth / 2, y: wrap.clientHeight / 2 };
        const q = contentAt(p);
        z = target;
        pin(q, p);
        apply(true);
        settleTimer = window.setTimeout(() => {
          commit();
          anchor = null;
        }, 260);
      } else {
        commit();
        anchor = null;
      }
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
      clearTimeout(settleTimer);
      anchor = null;
      z = 1;
      tx = 0;
      ty = 0;
      opts.commit(1);
      c = 1;
      apply(animate);
    },
    setMaxZoom(m: number) {
      maxZoom = Math.max(1, m);
    },
    busy: () => multi || panning || pts.size > 1,
    zoom: () => z
  };
}
