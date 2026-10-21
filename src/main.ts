import './style.css';
import { Game, LIMITS, PRESETS, clampConfig, type Config, type Difficulty } from './game';
import { loadBest, loadSettings, recordTime, saveSettings, type Mode, type Theme } from './storage';
import { AUTO, CROSS, FLAG, FLAG_ICON, MINE, MOON, SHOVEL, SUN, TROPHY } from './icons';
import { confetti } from './confetti';

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

let press: { i: number; x: number; y: number; id: number; t: number; long: boolean } | null = null;
const pad = (n: number) => String(Math.max(0, Math.min(999, n))).padStart(3, '0');

/* ---------- theme ---------- */
const THEME_LABEL: Record<Theme, string> = { auto: `${AUTO}Auto`, dark: `${MOON}Dark`, light: `${SUN}Light` };
function applyTheme(): void {
  const root = document.documentElement;
  if (settings.theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = settings.theme;
  themeBtn.innerHTML = THEME_LABEL[settings.theme];
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d1017' : '#e9edf4');
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
const GAP = 4; // keep in sync with --gap in style.css
const PAD = 8; // keep in sync with --pad in style.css
function sizeBoard(): void {
  const wrap = boardEl.parentElement!;
  const maxW = wrap.clientWidth - 2 * PAD - GAP * (game.cols - 1);
  const maxH = wrap.clientHeight - 2 * PAD - GAP * (game.rows - 1) - 4;
  const cell = Math.floor(Math.min(maxW / game.cols, maxH / game.rows, 46));
  boardEl.style.setProperty('--size', `${cell}px`);
}

/* ---------- face ---------- */
let face = '🙂';
function setFace(f: string, bump = false): void {
  const span = faceEl.firstElementChild as HTMLElement;
  if (face !== f) span.textContent = face = f;
  if (bump) {
    faceEl.classList.remove('bump');
    void faceEl.offsetWidth; // restart animation
    faceEl.classList.add('bump');
  }
}
const restingFace = () => (game.status === 'won' ? '😎' : game.status === 'lost' ? '😵' : '🙂');

function newGame(): void {
  stopTimer();
  elapsed = 0;
  game = new Game(settings.difficulty === 'custom' ? clampConfig(settings.custom) : PRESETS[settings.difficulty]);
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
  const segBtns = [...document.querySelectorAll<HTMLButtonElement>('#difficulty button')];
  segBtns.forEach((b) => b.classList.toggle('on', b.dataset.d === settings.difficulty));
  document.querySelector<HTMLElement>('#difficulty .thumb')!.style.setProperty('--i', String(segBtns.findIndex((b) => b.dataset.d === settings.difficulty)));
  sizeBoard();
  render();
  setFace('🙂', true);
}

const dist = (a: number, b: number) =>
  Math.max(Math.abs((a % game.cols) - (b % game.cols)), Math.abs(Math.floor(a / game.cols) - Math.floor(b / game.cols)));

function animate(el: HTMLElement, name: string, delay = 0): void {
  el.style.setProperty('--delay', `${delay}ms`);
  el.dataset.anim = name;
}

/** Sync the DOM with the game. `origin` is the cell the player touched; animations ripple out from it. */
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
        cls += ' wrong';
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
    if (prev === undefined) return; // fresh board, no animation
    if (key === 'm' || key === 'x') {
      animate(el, 'mine', i === game.explodedIndex ? 0 : 250 + Math.min(dist(i, game.explodedIndex) * 70, 1600));
    } else if (c.revealed) {
      animate(el, 'reveal', origin < 0 ? 0 : Math.min(dist(i, origin) * 24, 480));
    } else if (key === 'f') {
      animate(el, 'flag');
    } else if (prev === 'f') {
      animate(el, 'unflag');
    }
  });
  minesEl.textContent = pad(game.minesLeft);
  if (!press) setFace(restingFace());
}

function afterMove(prev: string, origin: number): void {
  // the very first move can already end the game (e.g. a nearly full board), so always stamp the start
  if (prev === 'ready') startTimer();
  render(origin);
  if ((game.status === 'won' || game.status === 'lost') && prev !== game.status) finish(origin);
}

function finish(origin: number): void {
  stopTimer();
  elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
  timeEl.textContent = pad(elapsed);
  setFace(restingFace(), true);
  if (game.status === 'won') {
    // victory wave across the whole board, then confetti
    setTimeout(() => cellEls.forEach((el, i) => animate(el, 'win', dist(i, origin) * 45)), 300);
    const r = boardEl.getBoundingClientRect();
    setTimeout(() => confetti(r.left + r.width / 2, r.top + r.height / 2), 450);
    // best times are only kept for the fixed presets, custom boards aren't comparable
    const rank = settings.difficulty === 'custom' ? null : recordTime(settings.difficulty, elapsed);
    const note = rank && settings.difficulty !== 'custom' ? `<p>🏆 New #${rank} best on ${label(settings.difficulty)}!</p>` : '';
    setTimeout(() => showSheet('You win! 🎉', `<div class="big-time">${elapsed}s</div>${note}`, true), 1500);
  } else {
    boardEl.classList.remove('shake');
    void boardEl.offsetWidth;
    boardEl.classList.add('shake');
    const mines = game.cells.filter((c) => c.mine).length;
    setTimeout(() => showSheet('Boom 💥', '<p>Tap OK for a new game, or tap above to look at the board.</p>', true), Math.min(900 + mines * 25, 2300));
  }
}

const label = (d: Difficulty) => ({ beginner: 'Easy', intermediate: 'Medium', expert: 'Hard' })[d];

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
  const el = cellEls[press.i];
  press = null;
  el?.classList.remove('down');
  setFace(restingFace());
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
  if (!game.cells[i].revealed) setFace('😮');
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
faceEl.addEventListener('click', newGame);

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

/* ---------- custom board ---------- */
function openCustom(): void {
  const c = clampConfig(settings.custom);
  const field = (id: string, name: string, hint: string, v: number) =>
    `<div class="field"><label for="${id}">${name}<small>${hint}</small></label>
     <div class="stepper"><button type="button" data-step="${id}:-1" aria-label="less">−</button>
     <input id="${id}" type="number" inputmode="numeric" value="${v}"><button type="button" data-step="${id}:1" aria-label="more">+</button></div></div>`;
  showSheet(
    'Custom board',
    `<div class="custom-form">
      ${field('c-cols', 'Columns', `${LIMITS.minCols}–${LIMITS.maxCols}`, c.cols)}
      ${field('c-rows', 'Rows', `${LIMITS.minRows}–${LIMITS.maxRows}`, c.rows)}
      ${field('c-mines', 'Mines', 'at least 1', c.mines)}
      <p class="hint" id="c-hint"></p>
      <button type="button" id="c-start" class="primary" style="margin-top:4px">Start game</button>
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
  const maxMines = c.cols * c.rows - 9;
  const density = Math.round((c.mines / (c.cols * c.rows)) * 100);
  hint.textContent = `${c.cols}×${c.rows}, ${c.mines} mines (${density}%). Max ${maxMines} mines on this size${adjusted ? ' — values will be adjusted' : ''}.`;
}

$('sheet-body').addEventListener('input', updateHint);
$('sheet-body').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-step],#c-start');
  if (!t) return;
  if (t.id === 'c-start') {
    settings.custom = readCustom();
    settings.difficulty = 'custom';
    saveSettings(settings);
    sheet.hidden = true;
    newGame();
    return;
  }
  const [id, delta] = t.dataset.step!.split(':');
  const input = document.getElementById(id) as HTMLInputElement;
  input.value = String((Number(input.value) || 0) + Number(delta));
  updateHint();
});

function renderMode(): void {
  modeBtn.innerHTML = flagMode ? `${FLAG_ICON}Flag mode` : `${SHOVEL}Dig mode`;
  modeBtn.setAttribute('aria-pressed', String(flagMode));
  modeBtn.classList.toggle('on', flagMode);
  document.body.classList.toggle('flag-mode', flagMode);
}
modeBtn.addEventListener('click', () => {
  flagMode = !flagMode;
  renderMode();
});
$('best').innerHTML = `${TROPHY}Best`;
renderMode();

themeBtn.addEventListener('click', () => {
  const order: Theme[] = ['auto', 'dark', 'light'];
  settings.theme = order[(order.indexOf(settings.theme) + 1) % order.length];
  saveSettings(settings);
  applyTheme();
});

function showSheet(title: string, html: string, result = false): void {
  sheet.classList.toggle('result', result);
  $('sheet-title').textContent = title;
  $('sheet-body').innerHTML = html;
  $('sheet-close').hidden = false;
  sheet.hidden = false;
}
$('sheet-close').addEventListener('click', () => {
  sheet.hidden = true;
  if (game.status === 'won' || game.status === 'lost') newGame();
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
