import type { Config, Difficulty } from './game';

export type Theme = 'auto' | 'dark' | 'light';

export type Mode = Difficulty | 'custom';

export interface Settings {
  difficulty: Mode;
  theme: Theme;
  custom: Config;
}

const KEY_SETTINGS = 'minesweeper.settings';
const KEY_BEST = 'minesweeper.best';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: ignore */
  }
}

export const loadSettings = (): Settings => read<Settings>(KEY_SETTINGS, { difficulty: 'beginner', theme: 'auto', custom: { cols: 10, rows: 14, mines: 25 } });
export const saveSettings = (s: Settings): void => write(KEY_SETTINGS, s);

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
