import type { Difficulty } from './game';

export type StatKey = Difficulty | 'custom';

export interface ModeStats {
  played: number;
  won: number;
  streak: number; // current win streak
  bestStreak: number;
  totalWinSeconds: number; // for the average winning time
}

export interface HistoryEntry {
  mode: StatKey;
  won: boolean;
  seconds: number;
  date: string; // ISO date (YYYY-MM-DD)
  size?: string; // e.g. "10×14" for custom boards
}

export interface Stats {
  modes: Partial<Record<StatKey, ModeStats>>;
  history: HistoryEntry[]; // newest first
}

export const HISTORY_LENGTH = 20;

export const emptyStats = (): Stats => ({ modes: {}, history: [] });

const emptyMode = (): ModeStats => ({ played: 0, won: 0, streak: 0, bestStreak: 0, totalWinSeconds: 0 });

/** Return new stats with one finished game applied (pure, so it is easy to test). */
export function applyResult(stats: Stats, entry: HistoryEntry): Stats {
  const prev = { ...emptyMode(), ...stats.modes[entry.mode] };
  const next: ModeStats = {
    played: prev.played + 1,
    won: prev.won + (entry.won ? 1 : 0),
    streak: entry.won ? prev.streak + 1 : 0,
    bestStreak: entry.won ? Math.max(prev.bestStreak, prev.streak + 1) : prev.bestStreak,
    totalWinSeconds: prev.totalWinSeconds + (entry.won ? entry.seconds : 0)
  };
  return {
    modes: { ...stats.modes, [entry.mode]: next },
    history: [entry, ...stats.history].slice(0, HISTORY_LENGTH)
  };
}

export function totalPlayed(stats: Stats): number {
  return Object.values(stats.modes).reduce((n, m) => n + (m?.played ?? 0), 0);
}

export const winRate = (m: ModeStats): number => (m.played ? Math.round((m.won / m.played) * 100) : 0);
export const avgWin = (m: ModeStats): number | null => (m.won ? Math.round(m.totalWinSeconds / m.won) : null);
