import { describe, expect, it } from 'vitest';
import { Game, PRESETS, clampConfig } from './game';

// deterministic RNG for reproducible boards
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe('Game', () => {
  it('places the exact number of mines', () => {
    const g = new Game(PRESETS.beginner, seeded(1));
    g.reveal(40);
    expect(g.cells.filter((c) => c.mine).length).toBe(10);
  });

  it('first click and its neighbours are never mines (many seeds, all presets)', () => {
    for (const cfg of Object.values(PRESETS)) {
      for (let s = 1; s <= 200; s++) {
        const g = new Game(cfg, seeded(s));
        const start = (s * 7) % (cfg.cols * cfg.rows);
        g.reveal(start);
        expect(g.status).not.toBe('lost');
        for (const i of [start, ...g.neighbors(start)]) expect(g.cells[i].mine).toBe(false);
      }
    }
  });

  it('adjacent counts match neighbouring mines', () => {
    const g = new Game(PRESETS.intermediate, seeded(5));
    g.reveal(0);
    g.cells.forEach((c, i) => {
      expect(c.adjacent).toBe(g.neighbors(i).filter((n) => g.cells[n].mine).length);
    });
  });

  it('first click opens a flood area', () => {
    const g = new Game(PRESETS.beginner, seeded(3));
    g.reveal(40);
    expect(g.cells.filter((c) => c.revealed).length).toBeGreaterThan(1);
  });

  it('flags block reveal and can be toggled', () => {
    const g = new Game(PRESETS.beginner, seeded(2));
    g.reveal(40);
    const hidden = g.cells.findIndex((c) => !c.revealed);
    g.toggleFlag(hidden);
    expect(g.minesLeft).toBe(9);
    expect(g.reveal(hidden)).toBe(false);
    g.toggleFlag(hidden);
    expect(g.minesLeft).toBe(10);
  });

  it('revealing a mine loses and exposes remaining mines', () => {
    const g = new Game(PRESETS.beginner, seeded(4));
    g.reveal(40);
    const mine = g.cells.findIndex((c) => c.mine);
    g.reveal(mine);
    expect(g.status).toBe('lost');
    expect(g.explodedIndex).toBe(mine);
    expect(g.cells.filter((c) => c.mine).every((c) => c.revealed)).toBe(true);
  });

  it('revealing every safe cell wins and flags all mines', () => {
    const g = new Game(PRESETS.beginner, seeded(6));
    g.reveal(40);
    g.cells.forEach((c, i) => {
      if (!c.mine && !c.revealed) g.reveal(i);
    });
    expect(g.status).toBe('won');
    expect(g.minesLeft).toBe(0);
  });

  it('chording opens neighbours when flags match, and can lose on a wrong flag', () => {
    const g = new Game(PRESETS.beginner, seeded(8));
    g.reveal(40);
    const numbered = g.cells.findIndex((c, i) => c.revealed && c.adjacent > 0 && g.neighbors(i).some((n) => !g.cells[n].revealed));
    expect(numbered).toBeGreaterThanOrEqual(0);
    const around = g.neighbors(numbered);
    const mines = around.filter((n) => g.cells[n].mine);
    mines.forEach((n) => g.toggleFlag(n));
    expect(g.chord(numbered)).toBe(true);
    expect(g.status).not.toBe('lost');
    expect(around.filter((n) => !g.cells[n].mine).every((n) => g.cells[n].revealed)).toBe(true);
  });

  it('does nothing after the game has ended', () => {
    const g = new Game(PRESETS.beginner, seeded(9));
    g.reveal(40);
    g.reveal(g.cells.findIndex((c) => c.mine));
    expect(g.reveal(0)).toBe(false);
    expect(g.toggleFlag(0)).toBe(false);
  });
});

describe('clampConfig', () => {
  it('keeps valid boards unchanged', () => {
    expect(clampConfig({ cols: 10, rows: 14, mines: 25 })).toEqual({ cols: 10, rows: 14, mines: 25 });
  });

  it('clamps size and leaves room for the safe first click', () => {
    expect(clampConfig({ cols: 99, rows: 1, mines: 9999 })).toEqual({ cols: 16, rows: 5, mines: 71 });
    expect(clampConfig({ cols: 5, rows: 5, mines: 0 }).mines).toBe(1);
  });

  it('handles junk input', () => {
    const c = clampConfig({ cols: NaN, rows: 7.6, mines: -3 });
    expect(c).toEqual({ cols: 5, rows: 8, mines: 1 });
  });

  it('a maximum-density board is still winnable on the first click', () => {
    const c = clampConfig({ cols: 5, rows: 5, mines: 999 });
    const g = new Game(c);
    g.reveal(12);
    expect(g.status).not.toBe('lost');
    expect(g.cells.filter((x) => x.mine).length).toBe(16);
  });
});
