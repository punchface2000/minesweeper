import './style.css';
import { Game, PRESETS, type Difficulty } from './game';
import { loadBest, loadSettings, recordTime, saveSettings, type Theme } from './storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const boardEl = $('board');
const minesEl = $('mines');
const timeEl = $('time');
const faceEl = $('face');
const modeBtn = $('mode');
const themeBtn = $('theme');
const sheet = $('sheet');

const settings = loadSettings();
let game: Game;
let cellEls: HTMLElement[] = [];
let flagMode = false;
let timer = 0;
let startedAt = 0;
let elapsed = 0;

const pad = (n: number) => String(Math.max(0, Math.min(999, n))).padStart(3, '0');

/* ---------- theme ---------- */
const THEME_LABEL: Record<Theme, string> = { auto: '◐ Auto', dark: '☾ Dark', light: '☀ Light' };
function applyTheme(): void {
  const root = document.documentElement;
  if (settings.theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = settings.theme;
  themeBtn.textContent = THEME_LABEL[settings.theme];
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1115' : '#f4f5f8');
}

/* ---------- timer ---------- */
function stopTimer(): void {
  clearInterval(timer);
  timer = 0;
}
function startTimer(): void {
  startedAt = Date.now();
  timer = window.setInterval(() => {
    elapsed = Math.floor((Date.now() - startedAt) / 1000);
    timeEl.textContent = pad(elapsed);
  }, 250);
}

/* ---------- board ---------- */
const GAP = 3;
function sizeBoard(): void {
  const wrap = boardEl.parentElement!;
  const maxW = wrap.clientWidth - GAP * (game.cols - 1);
  const maxH = wrap.clientHeight - GAP * (game.rows - 1);
  const cell = Math.floor(Math.min(maxW / game.cols, maxH / game.rows, 46));
  boardEl.style.setProperty('--size', `${cell}px`);
}

function newGame(): void {
  stopTimer();
  elapsed = 0;
  game = new Game(PRESETS[settings.difficulty]);
  timeEl.textContent = pad(0);
  boardEl.style.gridTemplateColumns = `repeat(${game.cols}, var(--size))`;
  boardEl.replaceChildren();
  cellEls = [];
  for (let i = 0; i < game.cols * game.rows; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.i = String(i);
    el.setAttribute('role', 'gridcell');
    boardEl.appendChild(el);
    cellEls.push(el);
  }
  document.querySelectorAll<HTMLButtonElement>('#difficulty button').forEach((b) => b.classList.toggle('on', b.dataset.d === settings.difficulty));
  sizeBoard();
  render();
}

function render(): void {
  game.cells.forEach((c, i) => {
    const el = cellEls[i];
    let cls = 'cell';
    let text = '';
    if (c.revealed) {
      cls += ' open';
      if (c.mine) {
        cls += i === game.explodedIndex ? ' boom' : ' mine';
        text = '✹';
      } else if (c.adjacent) {
        cls += ` n${c.adjacent}`;
        text = String(c.adjacent);
      }
    } else if (c.flagged) {
      cls += ' flag';
      text = game.status === 'lost' && !c.mine ? '✕' : '⚑';
      if (game.status === 'lost' && !c.mine) cls += ' wrong';
    }
    el.className = cls;
    if (el.textContent !== text) el.textContent = text;
  });
  minesEl.textContent = pad(game.minesLeft);
  faceEl.textContent = game.status === 'won' ? '😎' : game.status === 'lost' ? '😵' : '🙂';
}

function afterMove(prev: string): void {
  if (prev === 'ready' && game.status === 'playing') startTimer();
  render();
  if (game.status === 'won' || game.status === 'lost') finish();
}

function finish(): void {
  stopTimer();
  elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
  timeEl.textContent = pad(elapsed);
  if (game.status === 'won') {
    const rank = recordTime(settings.difficulty, elapsed);
    setTimeout(() => showSheet('You win! 🎉', `Cleared in <b>${elapsed}s</b>.` + (rank ? `<br>New #${rank} on ${label(settings.difficulty)}.` : '')), 350);
  } else {
    setTimeout(() => showSheet('Boom 💥', 'Tap the face to try again.'), 600);
  }
}

const label = (d: Difficulty) => ({ beginner: 'Easy', intermediate: 'Medium', expert: 'Hard' })[d];

/* ---------- input: tap = dig, long-press = flag ---------- */
const LONG_PRESS_MS = 320;
const MOVE_TOLERANCE = 10;
let press: { i: number; x: number; y: number; id: number; t: number; long: boolean } | null = null;

function act(i: number, secondary: boolean): void {
  const prev = game.status;
  const useFlag = flagMode !== secondary;
  const cell = game.cells[i];
  if (useFlag) {
    // flagging an opened number acts as a chord, which is handy on touch screens
    if (cell.revealed) game.chord(i);
    else game.toggleFlag(i);
  } else {
    game.reveal(i);
  }
  if (secondary && navigator.vibrate) navigator.vibrate(12);
  afterMove(prev);
}

boardEl.addEventListener('pointerdown', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.cell');
  if (!el) return;
  e.preventDefault();
  const i = Number(el.dataset.i);
  if (e.pointerType === 'mouse' && e.button === 2) {
    act(i, true);
    return;
  }
  const p = { i, x: e.clientX, y: e.clientY, id: e.pointerId, t: 0, long: false };
  p.t = window.setTimeout(() => {
    p.long = true;
    act(i, true);
  }, LONG_PRESS_MS);
  press = p;
});

boardEl.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) {
    clearTimeout(press.t);
    press = null;
  }
});

boardEl.addEventListener('pointerup', (e) => {
  if (!press || e.pointerId !== press.id) return;
  clearTimeout(press.t);
  const { i, long } = press;
  press = null;
  if (!long) act(i, false);
});

boardEl.addEventListener('pointercancel', () => {
  if (press) clearTimeout(press.t);
  press = null;
});
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------- controls ---------- */
faceEl.addEventListener('click', newGame);

document.querySelectorAll<HTMLButtonElement>('#difficulty button').forEach((b) =>
  b.addEventListener('click', () => {
    settings.difficulty = b.dataset.d as Difficulty;
    saveSettings(settings);
    newGame();
  })
);

modeBtn.addEventListener('click', () => {
  flagMode = !flagMode;
  modeBtn.textContent = flagMode ? '⚑ Flag' : '⛏ Dig';
  modeBtn.setAttribute('aria-pressed', String(flagMode));
  modeBtn.classList.toggle('on', flagMode);
});

themeBtn.addEventListener('click', () => {
  const order: Theme[] = ['auto', 'dark', 'light'];
  settings.theme = order[(order.indexOf(settings.theme) + 1) % order.length];
  saveSettings(settings);
  applyTheme();
});

function showSheet(title: string, html: string): void {
  $('sheet-title').textContent = title;
  $('sheet-body').innerHTML = html;
  sheet.hidden = false;
}
$('sheet-close').addEventListener('click', () => {
  sheet.hidden = true;
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) sheet.hidden = true;
});

$('best').addEventListener('click', () => {
  const best = loadBest();
  const rows = (['beginner', 'intermediate', 'expert'] as Difficulty[])
    .map((d) => {
      const list = best[d] ?? [];
      const times = list.length ? list.map((s, k) => `<li><span>${k + 1}.</span><b>${s}s</b></li>`).join('') : '<li class="none">No wins yet</li>';
      return `<section><h3>${label(d)}</h3><ol>${times}</ol></section>`;
    })
    .join('');
  showSheet('Best times', rows);
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
window.addEventListener('resize', sizeBoard);
window.addEventListener('orientationchange', () => setTimeout(sizeBoard, 200));

applyTheme();
newGame();
