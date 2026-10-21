import type { Config, Difficulty, SavedGame } from './game';
import { emptyStats, type Stats } from './stats';

export type Theme = 'auto' | 'dark' | 'light';

export type Mode = Difficulty | 'custom';

export interface Settings {
  difficulty: Mode;
  theme: Theme;
  custom: Config;
  sound: boolean;
}

const KEY_SETTINGS = 'minesweeper.settings';
const KEY_BEST = 'minesweeper.best';
const KEY_STATS = 'minesweeper.stats';
const KEY_CURRENT = 'minesweeper.current';

function readRaw<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function read<T extends object>(key: string, fallback: T): T {
  const v = readRaw<Partial<T>>(key);
  return v && typeof v === 'object' ? { ...fallback, ...v } : fallback;
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: ignore */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const loadSettings = (): Settings =>
  read<Settings>(KEY_SETTINGS, { difficulty: 'beginner', theme: 'auto', custom: { cols: 10, rows: 14, mines: 25 }, sound: true });
export const saveSettings = (s: Settings): void => write(KEY_SETTINGS, s);

/* ---------- best times ---------- */
export type BestTimes = Partial<Record<Difficulty, number[]>>;

export const loadBest = (): BestTimes => read<BestTimes>(KEY_BEST, {});

/** Store a time (seconds) and return its rank (1-based) if it made the top 5. */
export function recordTime(d: Difficulty, seconds: number): number | null {
  const all = loadBest();
  const list = [...(all[d] ?? []), seconds].sort((a, b) => a - b);
  const rank = list.indexOf(seconds) + 1;
  all[d] = list.slice(0, 5);
  write(KEY_BEST, all);
  return rank <= 5 ? rank : null;
}

/* ---------- statistics ---------- */
export const loadStats = (): Stats => read<Stats>(KEY_STATS, emptyStats());
export const saveStats = (s: Stats): void => write(KEY_STATS, s);

/* ---------- game in progress ---------- */
export interface CurrentGame {
  mode: Mode;
  game: SavedGame;
  ms: number; // time already played
}

export const loadCurrent = (): CurrentGame | null => readRaw<CurrentGame>(KEY_CURRENT);
export const saveCurrent = (c: CurrentGame): void => write(KEY_CURRENT, c);
export const clearCurrent = (): void => remove(KEY_CURRENT);
