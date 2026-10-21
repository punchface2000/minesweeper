import { describe, expect, it } from 'vitest';
import { HISTORY_LENGTH, applyResult, avgWin, emptyStats, totalPlayed, winRate } from './stats';

const game = (won: boolean, seconds = 60, mode: 'beginner' | 'expert' = 'beginner') => ({ mode, won, seconds, date: '2026-10-21' });

describe('stats', () => {
  it('counts games, wins and win rate', () => {
    let s = emptyStats();
    s = applyResult(s, game(true, 50));
    s = applyResult(s, game(false));
    s = applyResult(s, game(true, 70));
    const m = s.modes.beginner!;
    expect(m.played).toBe(3);
    expect(m.won).toBe(2);
    expect(winRate(m)).toBe(67);
    expect(avgWin(m)).toBe(60);
  });

  it('tracks current and best streak', () => {
    let s = emptyStats();
    for (const w of [true, true, true, false, true]) s = applyResult(s, game(w));
    expect(s.modes.beginner!.streak).toBe(1);
    expect(s.modes.beginner!.bestStreak).toBe(3);
  });

  it('keeps modes separate and totals across them', () => {
    let s = emptyStats();
    s = applyResult(s, game(true, 30, 'beginner'));
    s = applyResult(s, game(false, 30, 'expert'));
    expect(s.modes.beginner!.won).toBe(1);
    expect(s.modes.expert!.won).toBe(0);
    expect(totalPlayed(s)).toBe(2);
  });

  it('keeps a bounded, newest-first history and does not mutate input', () => {
    let s = emptyStats();
    const before = s;
    for (let i = 0; i < HISTORY_LENGTH + 5; i++) s = applyResult(s, game(true, i + 1));
    expect(s.history.length).toBe(HISTORY_LENGTH);
    expect(s.history[0].seconds).toBe(HISTORY_LENGTH + 5);
    expect(before.history.length).toBe(0);
  });
});
