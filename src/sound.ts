// Tiny synthesized sound effects (Web Audio, no audio files, works offline).
// iOS: audio can only start after a user gesture, so unlock() is called on the first touch.
// Web Audio follows the iPhone's silent switch by default.

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let enabled = true;
let noiseBuf: AudioBuffer | null = null;

export function setSound(on: boolean): void {
  enabled = on;
}

export function unlock(): void {
  if (!enabled) return;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function ready(): Ctx | null {
  if (!enabled || !ctx || ctx.state !== 'running') return null;
  return ctx;
}

function noise(c: Ctx): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function envelope(c: Ctx, at: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(c.destination);
  return g;
}

function tone(c: Ctx, freq: number, at: number, dur: number, peak: number, type: OscillatorType = 'sine', glideTo?: number): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  o.connect(envelope(c, at, peak, 0.004, dur));
  o.start(at);
  o.stop(at + dur + 0.05);
}

function hiss(c: Ctx, at: number, dur: number, peak: number, filter: BiquadFilterType, freq: number, freqTo?: number): void {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, at);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
  s.connect(f);
  f.connect(envelope(c, at, peak, 0.003, dur));
  s.start(at);
  s.stop(at + dur + 0.05);
}

export const sfx = {
  /** Pencil tap on paper. */
  dig(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    hiss(c, t, 0.035, 0.25, 'bandpass', 3200);
    tone(c, 520, t, 0.05, 0.05, 'triangle', 380);
  },
  /** Soft paper rustle for a larger opening; louder for bigger cascades. */
  cascade(cells: number): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const amt = Math.min(1, cells / 40);
    hiss(c, t, 0.18 + amt * 0.25, 0.08 + amt * 0.12, 'bandpass', 2400, 900);
    tone(c, 660, t + 0.02, 0.12, 0.04, 'sine', 880);
  },
  /** Rubber-stamp thock. */
  flag(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(c, 190, t, 0.09, 0.22, 'sine', 120);
    hiss(c, t, 0.03, 0.12, 'lowpass', 1800);
  },
  unflag(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    hiss(c, t, 0.06, 0.1, 'highpass', 2500);
  },
  /** Low rumble with a crack on top. */
  boom(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    hiss(c, t, 0.9, 0.55, 'lowpass', 1400, 80);
    tone(c, 75, t, 0.6, 0.45, 'sine', 35);
    hiss(c, t, 0.05, 0.3, 'highpass', 3000);
  },
  /** Small ascending chime. */
  win(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => tone(c, f, t + k * 0.09, 0.5, 0.12, 'triangle'));
  },
  /** The rubber stamp hitting the page. */
  stamp(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(c, 140, t, 0.12, 0.3, 'sine', 90);
    hiss(c, t, 0.08, 0.2, 'lowpass', 900);
  }
};
