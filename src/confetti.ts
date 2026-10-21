/** Lightweight canvas confetti burst. Removes itself when finished. */
export function confetti(originX = innerWidth / 2, originY = innerHeight / 2.2): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti';
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const colors = ['#6ea2ff', '#4fd99a', '#ff6b6b', '#ffb547', '#c08cff', '#3fd6d6'];
  const parts = Array.from({ length: 140 }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = 6 + Math.random() * 9;
    return {
      x: originX, y: originY,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 7,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 5,
      r: Math.random() * Math.PI, vr: (Math.random() - .5) * .4,
      c: colors[(Math.random() * colors.length) | 0]
    };
  });

  const start = performance.now();
  const DURATION = 2600;
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION * .6) / (DURATION * .4));
    for (const p of parts) {
      p.vx *= .985; p.vy = p.vy * .985 + .35;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
