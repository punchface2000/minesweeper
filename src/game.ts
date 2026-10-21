export type Difficulty = 'beginner' | 'intermediate' | 'expert';

export interface Config {
  cols: number;
  rows: number;
  mines: number;
}

export const PRESETS: Record<Difficulty, Config> = {
  beginner: { cols: 9, rows: 9, mines: 10 },
  intermediate: { cols: 9, rows: 16, mines: 25 },
  expert: { cols: 12, rows: 22, mines: 55 }
};

export interface Cell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
}

export type Status = 'ready' | 'playing' | 'won' | 'lost';

export class Game {
  readonly cols: number;
  readonly rows: number;
  readonly mines: number;
  cells: Cell[] = [];
  status: Status = 'ready';
  explodedIndex = -1;
  private revealedCount = 0;
  private rng: () => number;

  constructor(config: Config, rng: () => number = Math.random) {
    this.cols = config.cols;
    this.rows = config.rows;
    this.mines = Math.min(config.mines, config.cols * config.rows - 9);
    this.rng = rng;
    this.cells = Array.from({ length: this.cols * this.rows }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0
    }));
  }

  get flagCount(): number {
    return this.cells.reduce((n, c) => n + (c.flagged ? 1 : 0), 0);
  }

  get minesLeft(): number {
    return this.mines - this.flagCount;
  }

  index(col: number, row: number): number {
    return row * this.cols + col;
  }

  neighbors(i: number): number[] {
    const col = i % this.cols;
    const row = Math.floor(i / this.cols);
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const c = col + dc;
        const r = row + dr;
        if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) out.push(this.index(c, r));
      }
    }
    return out;
  }

  /** Place mines so the first click and its neighbours are always safe. */
  private placeMines(safe: number): void {
    const forbidden = new Set([safe, ...this.neighbors(safe)]);
    const pool: number[] = [];
    for (let i = 0; i < this.cells.length; i++) if (!forbidden.has(i)) pool.push(i);
    for (let k = 0; k < this.mines; k++) {
      const j = k + Math.floor(this.rng() * (pool.length - k));
      [pool[k], pool[j]] = [pool[j], pool[k]];
      this.cells[pool[k]].mine = true;
    }
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].adjacent = this.neighbors(i).filter((n) => this.cells[n].mine).length;
    }
  }

  toggleFlag(i: number): boolean {
    if (this.status === 'won' || this.status === 'lost') return false;
    const cell = this.cells[i];
    if (cell.revealed) return false;
    cell.flagged = !cell.flagged;
    return true;
  }

  /** Reveal a cell. Returns true if the board changed. */
  reveal(i: number): boolean {
    if (this.status === 'won' || this.status === 'lost') return false;
    const cell = this.cells[i];
    if (cell.flagged) return false;
    if (cell.revealed) return this.chord(i);

    if (this.status === 'ready') {
      this.placeMines(i);
      this.status = 'playing';
    }
    this.floodReveal(i);
    this.checkEnd();
    return true;
  }

  /** Clicking a satisfied number reveals its unflagged neighbours. */
  chord(i: number): boolean {
    if (this.status !== 'playing') return false;
    const cell = this.cells[i];
    if (!cell.revealed || cell.adjacent === 0) return false;
    const around = this.neighbors(i);
    const flags = around.filter((n) => this.cells[n].flagged).length;
    if (flags !== cell.adjacent) return false;
    let changed = false;
    for (const n of around) {
      const c = this.cells[n];
      if (!c.flagged && !c.revealed) {
        this.floodReveal(n);
        changed = true;
      }
    }
    if (changed) this.checkEnd();
    return changed;
  }

  private floodReveal(start: number): void {
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      const cell = this.cells[i];
      if (cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      this.revealedCount++;
      if (cell.mine) {
        this.explodedIndex = i;
        this.status = 'lost';
        continue;
      }
      if (cell.adjacent === 0) stack.push(...this.neighbors(i));
    }
  }

  private checkEnd(): void {
    if (this.status === 'lost') {
      for (const c of this.cells) if (c.mine && !c.flagged) c.revealed = true;
      return;
    }
    if (this.revealedCount === this.cells.length - this.mines) {
      this.status = 'won';
      for (const c of this.cells) if (c.mine) c.flagged = true;
    }
  }
}
