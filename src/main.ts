import './style.css';
import { Game, LIMITS, PRESETS, clampConfig, type Config, type Difficulty } from './game';
import { loadBest, loadSettings, recordTime, saveSettings, type Mode, type Theme } from './storage';
import { CROSS, FLAG, MINE } from './icons';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const boardEl = $('board');
const minesEl = $('mines');
const timeEl = $('time');
const modeBtn = $('mode');
const themeBtn = $('theme');
const stampEl = $('stamp');
const sheet = $('sheet');

const settings = loadSettings();
let game: Game;
let cellEls: HTMLElement[] = [];
let flagMode = false;
let timer = 0;
let startedAt = 0;
let elapsed = 0;
let press: { i: number; x: number; y: number; id: number; t: number; long: boolean } | null = null;
let pending: number[] = []; // timeouts belonging to the current round (stamp, sheets)

const LABEL: Record<Mode, string> = { beginner: 'Easy', intermediate: 'Medium', expert: 'Hard', custom: 'Custom' };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const later = (fn: () => void, ms: number) => pending.push(window.setTimeout(fn, ms));

/* ---------- theme ---------- */
const THEME_LABEL: Record<Theme, string> = { auto: 'Auto', dark: 'Dark', light: 'Light' };
function applyTheme(): void {
  const root = document.documentElement;
  if (settings.theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = settings.theme;
  themeBtn.textContent = `Theme: ${THEME_LABEL[settings.theme]}`;
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1d1b18' : '#f5f0e6');
}

/* ---------- timer ---------- */
function stopTimer(): void {
  clearInterval(timer);
  timer = 0;
}
function startTimer(): void {
  startedAt = Date.now();
  timer = window.setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    if (s !== elapsed) timeEl.textContent = clock((elapsed = s));
  }, 250);
}

/* ---------- board ---------- */
const GAP = 1; // keep in sync with .board gap in style.css
const FRAME = 2; // keep in sync with .board border in style.css
function sizeBoard(): void {
  const wrap = boardEl.parentElement!.parentElement!; // .board-wrap
  const cs = getComputedStyle(wrap);
  const availW = wrap.clientWidth - 2 * FRAME - GAP * (game.cols - 1);
  const availH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2 * FRAME - GAP * (game.rows - 1);
  const cell = Math.floor(Math.min(availW / game.cols, availH / game.rows, 56));
  boardEl.style.setProperty('--size', `${cell}px`);
}

function config(): Config {
  return settings.difficulty === 'custom' ? clampConfig(settings.custom) : PRESETS[settings.difficulty];
}

function newGame(): void {
  stopTimer();
  pending.forEach(clearTimeout);
  pending = [];
  press = null;
  elapsed = 0;
  game = new Game(config());
  timeEl.textContent = clock(0);
  stampEl.hidden = true;
  sheet.hidden = true;
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
  $('edition').textContent = `${LABEL[settings.difficulty]} · ${game.cols}×${game.rows}`;
  updateTabs();
  sizeBoard();
  render();
}

function updateTabs(): void {
  const btns = [...document.querySelectorAll<HTMLButtonElement>('#difficulty button')];
  btns.forEach((b) => b.classList.toggle('on', b.dataset.d === settings.difficulty));
  const on = btns.find((b) => b.dataset.d === settings.difficulty);
  const line = document.querySelector<HTMLElement>('#difficulty .underline')!;
  if (on) {
    line.style.width = `${on.offsetWidth}px`;
    line.style.transform = `translateX(${on.offsetLeft}px)`;
  }
}

const dist = (a: number, b: number) =>
  Math.max(Math.abs((a % game.cols) - (b % game.cols)), Math.abs(Math.floor(a / game.cols) - Math.floor(b / game.cols)));

function animate(el: HTMLElement, name: string, delay = 0): void {
  el.style.setProperty('--delay', `${delay}ms`);
  el.dataset.anim = name;
}

/** Sync the DOM with the game. `origin` is the touched cell; reveals ink in outward from it. */
function render(origin = -1): void {
  const lost = game.status === 'lost';
  game.cells.forEach((c, i) => {
    const el = cellEls[i];
    let cls = 'cell';
    let key = 'h';
    let html = '';
    if (c.revealed) {
      cls += ' open';
      if (c.mine) {
        cls += i === game.explodedIndex ? ' boom' : ' mine';
        key = 'm';
        html = MINE;
      } else if (c.adjacent) {
        cls += ` n${c.adjacent}`;
        key = `n${c.adjacent}`;
        html = String(c.adjacent);
      } else key = 'o';
    } else if (c.flagged) {
      if (lost && !c.mine) {
        cls += ' flag wrong';
        key = 'x';
        html = CROSS;
      } else {
        cls += ' flag';
        key = 'f';
        html = FLAG;
      }
    }
    if (press?.i === i) cls += ' down';
    if (el.className !== cls) el.className = cls;

    const prev = el.dataset.k;
    if (prev === key) return;
    el.dataset.k = key;
    el.innerHTML = html;
    if (prev === undefined) return; // fresh board: no animation
    if (key === 'm' || key === 'x') {
      animate(el, 'mine', i === game.explodedIndex ? 0 : 200 + Math.min(dist(i, game.explodedIndex) * 60, 1200));
    } else if (c.revealed) {
      animate(el, 'reveal', origin < 0 ? 0 : Math.min(dist(i, origin) * 22, 400));
    } else if (key === 'f') {
      animate(el, 'flag');
    } else if (prev === 'f') {
      animate(el, 'unflag');
    }
  });
  minesEl.textContent = String(game.minesLeft);
}

function afterMove(prev: string, origin: number): void {
  // the very first move can already end the game (e.g. a nearly full board), so always stamp the start
  if (prev === 'ready') startTimer();
  render(origin);
  if ((game.status === 'won' || game.status === 'lost') && prev !== game.status) finish();
}

function finish(): void {
  stopTimer();
  elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
  timeEl.textContent = clock(elapsed);
  if (game.status === 'won') {
    later(() => (stampEl.hidden = false), 350);
    // best times are only kept for the fixed presets, custom boards aren't comparable
    const d = settings.difficulty;
    const rank = d === 'custom' ? null : recordTime(d, elapsed);
    const note = rank ? `<p>A new no. ${rank} on ${LABEL[d]}.</p>` : `<p>${LABEL[d]}, ${game.cols}×${game.rows}, ${game.mines} mines.</p>`;
    later(() => showSheet('Solved<i>.</i>', `<div class="big-time">${clock(elapsed)}</div>${note}`, true), 1300);
  } else {
    boardEl.classList.remove('shake');
    void boardEl.offsetWidth; // restart animation
    boardEl.classList.add('shake');
    const mines = game.cells.filter((c) => c.mine).length;
    later(() => showSheet('Boom<i>.</i>', '<p>All mines are marked on the board.</p>', true), Math.min(900 + mines * 20, 2000));
  }
}

/* ---------- input: tap = dig, long-press = flag ---------- */
const LONG_PRESS_MS = 320;
const MOVE_TOLERANCE = 10;

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
  afterMove(prev, i);
}

function release(): void {
  if (!press) return;
  clearTimeout(press.t);
  cellEls[press.i]?.classList.remove('down');
  press = null;
}

boardEl.style.setProperty('--hold', `${LONG_PRESS_MS}ms`);

boardEl.addEventListener('pointerdown', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.cell');
  if (!el || game.status === 'won' || game.status === 'lost') return;
  e.preventDefault();
  const i = Number(el.dataset.i);
  if (e.pointerType === 'mouse' && e.button === 2) {
    act(i, true);
    return;
  }
  release();
  const p = { i, x: e.clientX, y: e.clientY, id: e.pointerId, t: 0, long: false };
  p.t = window.setTimeout(() => {
    p.long = true;
    el.classList.remove('down');
    act(i, true);
  }, LONG_PRESS_MS);
  press = p;
  el.classList.add('down');
});

boardEl.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) release();
});

boardEl.addEventListener('pointerup', (e) => {
  if (!press || e.pointerId !== press.id) return;
  const { i, long } = press;
  release();
  if (!long) act(i, false);
});

boardEl.addEventListener('pointercancel', release);
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
boardEl.addEventListener('animationend', (e) => {
  if (e.target === boardEl) boardEl.classList.remove('shake');
});

/* ---------- controls ---------- */
$('new').addEventListener('click', newGame);

document.querySelectorAll<HTMLButtonElement>('#difficulty button').forEach((b) =>
  b.addEventListener('click', () => {
    const d = b.dataset.d as Mode;
    if (d === 'custom') {
      openCustom();
      return;
    }
    settings.difficulty = d;
    saveSettings(settings);
    newGame();
  })
);

modeBtn.addEventListener('click', () => {
  flagMode = !flagMode;
  modeBtn.setAttribute('aria-pressed', String(flagMode));
});

themeBtn.addEventListener('click', () => {
  const order: Theme[] = ['auto', 'light', 'dark'];
  settings.theme = order[(order.indexOf(settings.theme) + 1) % order.length];
  saveSettings(settings);
  applyTheme();
});

/* ---------- custom board ---------- */
function openCustom(): void {
  const c = clampConfig(settings.custom);
  const field = (id: string, name: string, hint: string, v: number) =>
    `<div class="field"><label for="${id}">${name}<small>${hint}</small></label>
     <div class="stepper"><button type="button" data-step="${id}:-1" aria-label="less">−</button>
     <input id="${id}" type="number" inputmode="numeric" value="${v}"><button type="button" data-step="${id}:1" aria-label="more">+</button></div></div>`;
  showSheet(
    'Custom <i>board</i>',
    `<div class="custom-form">
      ${field('c-cols', 'Columns', `${LIMITS.minCols}–${LIMITS.maxCols}`, c.cols)}
      ${field('c-rows', 'Rows', `${LIMITS.minRows}–${LIMITS.maxRows}`, c.rows)}
      ${field('c-mines', 'Mines', 'AT LEAST 1', c.mines)}
      <p class="hint" id="c-hint"></p>
      <button type="button" id="c-start" class="primary">Start game</button>
    </div>`
  );
  $('sheet-close').hidden = true;
  updateHint();
}

function readCustom(): Config {
  const v = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value);
  return clampConfig({ cols: v('c-cols'), rows: v('c-rows'), mines: v('c-mines') });
}

function updateHint(): void {
  const hint = document.getElementById('c-hint');
  if (!hint) return;
  const raw = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value);
  const c = readCustom();
  const adjusted = c.cols !== raw('c-cols') || c.rows !== raw('c-rows') || c.mines !== raw('c-mines');
  const density = Math.round((c.mines / (c.cols * c.rows)) * 100);
  hint.textContent = `${c.cols}×${c.rows} with ${c.mines} mines, ${density}% density. At most ${c.cols * c.rows - 9} mines fit${adjusted ? ', values will be adjusted' : ''}.`;
}

$('sheet-body').addEventListener('input', updateHint);
$('sheet-body').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-step],#c-start');
  if (!t) return;
  if (t.id === 'c-start') {
    settings.custom = readCustom();
    settings.difficulty = 'custom';
    saveSettings(settings);
    newGame();
    return;
  }
  const [id, delta] = t.dataset.step!.split(':');
  const input = document.getElementById(id) as HTMLInputElement;
  input.value = String((Number(input.value) || 0) + Number(delta));
  updateHint();
});

/* ---------- sheet ---------- */
function showSheet(titleHtml: string, html: string, result = false): void {
  sheet.classList.toggle('result', result);
  $('sheet-title').innerHTML = titleHtml;
  $('sheet-body').innerHTML = html;
  $('sheet-close').hidden = false;
  $('sheet-close').textContent = result ? 'New game' : 'Close';
  sheet.hidden = false;
}
$('sheet-close').addEventListener('click', () => {
  if (sheet.classList.contains('result')) newGame();
  else sheet.hidden = true;
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) sheet.hidden = true;
});

$('best').addEventListener('click', () => {
  const best = loadBest();
  const rows = (['beginner', 'intermediate', 'expert'] as Difficulty[])
    .map((d) => {
      const list = best[d] ?? [];
      const times = list.length
        ? list.map((s, k) => `<li><span>No. ${k + 1}</span><b>${clock(s)}</b></li>`).join('')
        : '<li class="none">No wins yet</li>';
      return `<section><h3 class="mono">${LABEL[d]}</h3><ol>${times}</ol></section>`;
    })
    .join('');
  showSheet('Records', rows);
});

/* ---------- boot ---------- */
$('today').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
window.addEventListener('resize', () => {
  sizeBoard();
  updateTabs();
});
window.addEventListener('orientationchange', () => setTimeout(sizeBoard, 200));
document.fonts?.ready.then(updateTabs);

applyTheme();
newGame();
