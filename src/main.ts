import './style.css';
import { Game, LIMITS, PRESETS, clampConfig, type Config, type Difficulty } from './game';
import {
  clearCurrent,
  loadBest,
  loadCurrent,
  loadSettings,
  loadStats,
  recordTime,
  saveCurrent,
  saveSettings,
  saveStats,
  type Mode,
  type Theme
} from './storage';
import { applyResult, avgWin, totalPlayed, winRate, type StatKey } from './stats';
import { CROSS, FLAG, MINE } from './icons';
import { setSound, sfx, unlock } from './sound';
import { attachZoom } from './zoom';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const boardEl = $('board');
const frameEl = boardEl.parentElement!; // .board-frame
const wrapEl = frameEl.parentElement!; // .board-wrap
const minesEl = $('mines');
const timeEl = $('time');
const modeBtn = $('mode');
const stampEl = $('stamp');
const fitBtn = $('fit');
const sheet = $('sheet');

const settings = loadSettings();
let stats = loadStats();
let game: Game;
let cellEls: HTMLElement[] = [];
let flagMode = false;
let press: { i: number; x: number; y: number; id: number; t: number; long: boolean } | null = null;
let pending: number[] = []; // timeouts belonging to the current round (stamp, sheets)

const LABEL: Record<Mode, string> = { beginner: 'Easy', intermediate: 'Medium', expert: 'Hard', custom: 'Custom' };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const later = (fn: () => void, ms: number) => pending.push(window.setTimeout(fn, ms));

/* ---------- theme ---------- */
function applyTheme(): void {
  const root = document.documentElement;
  if (settings.theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = settings.theme;
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1d1b18' : '#f5f0e6');
}

/* ---------- timer: accumulates only while the app is visible ---------- */
let accumMs = 0;
let runSince = 0; // 0 = paused
let ticker = 0;
let shownSeconds = -1;

const playedMs = () => accumMs + (runSince ? Date.now() - runSince : 0);
function showTime(): void {
  const s = Math.floor(playedMs() / 1000);
  if (s !== shownSeconds) timeEl.textContent = clock((shownSeconds = s));
}
function resumeTimer(): void {
  if (runSince) return;
  runSince = Date.now();
  ticker = window.setInterval(showTime, 250);
}
function pauseTimer(): void {
  if (!runSince) return;
  accumMs += Date.now() - runSince;
  runSince = 0;
  clearInterval(ticker);
  showTime();
}
function resetTimer(ms = 0): void {
  pauseTimer();
  accumMs = ms;
  shownSeconds = -1;
  showTime();
}

/* ---------- persistence of the game in progress ---------- */
function persist(): void {
  if (game.status === 'playing') saveCurrent({ mode: settings.difficulty, game: game.serialize(), ms: playedMs() });
  else clearCurrent();
}

/* ---------- board ---------- */
const GAP = 1; // keep in sync with .board gap in style.css
const FRAME = 2; // keep in sync with .board border in style.css
const TARGET_CELL = 44; // comfortable tap size when zoomed in
let fitCell = 36; // cell size that fits the whole board on screen
function sizeBoard(): void {
  const cs = getComputedStyle(wrapEl);
  const availW = wrapEl.clientWidth - 2 * FRAME - GAP * (game.cols - 1);
  const availH = wrapEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2 * FRAME - GAP * (game.rows - 1);
  fitCell = Math.max(6, Math.floor(Math.min(availW / game.cols, availH / game.rows, 56)));
  zoom.setMaxZoom(TARGET_CELL / fitCell);
  zoom.reset();
  setCellSize(1);
}
function setCellSize(z: number): void {
  boardEl.style.setProperty('--size', `${Math.round(fitCell * z)}px`);
}

function config(): Config {
  return settings.difficulty === 'custom' ? clampConfig(settings.custom) : PRESETS[settings.difficulty];
}

/** Build the DOM for a game (fresh or restored). */
function mount(g: Game, ms: number): void {
  pending.forEach(clearTimeout);
  pending = [];
  press = null;
  game = g;
  resetTimer(ms);
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
  updateMasthead();
  updateTabs();
  sizeBoard();
  render();
  if (game.status === 'playing' && document.visibilityState === 'visible') resumeTimer();
}

function newGame(): void {
  clearCurrent();
  mount(new Game(config()), 0);
}

function updateMasthead(): void {
  $('edition').textContent = `No. ${totalPlayed(stats) + 1} · ${LABEL[settings.difficulty]}`;
  $('today').textContent = `${game.cols} × ${game.rows}`;
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
    if (prev === undefined) return; // fresh or restored board: no animation
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

function finish(): void {
  pauseTimer();
  clearCurrent();
  const seconds = Math.max(1, Math.round(playedMs() / 1000));
  timeEl.textContent = clock(seconds);
  const d = settings.difficulty;
  const won = game.status === 'won';
  stats = applyResult(stats, {
    mode: d as StatKey,
    won,
    seconds,
    date: new Date().toISOString().slice(0, 10),
    size: d === 'custom' ? `${game.cols}×${game.rows}` : undefined
  });
  saveStats(stats);
  const m = stats.modes[d as StatKey]!;
  const streak = m.streak > 1 ? ` ${m.streak} wins in a row.` : '';
  if (won) {
    sfx.win();
    later(() => {
      stampEl.hidden = false;
      sfx.stamp();
    }, 350);
    // best times are only kept for the fixed presets, custom boards aren't comparable
    const rank = d === 'custom' ? null : recordTime(d, seconds);
    const note = rank ? `<p>A new no. ${rank} on ${LABEL[d]}.${streak}</p>` : `<p>${LABEL[d]}, ${game.cols}×${game.rows}, ${game.mines} mines.${streak}</p>`;
    later(() => showSheet('Solved<i>.</i>', `<div class="big-time">${clock(seconds)}</div>${note}`, true), 1300);
  } else {
    sfx.boom();
    boardEl.classList.remove('shake');
    void boardEl.offsetWidth; // restart animation
    boardEl.classList.add('shake');
    const mines = game.cells.filter((c) => c.mine).length;
    const lostStreak = m.won ? ` Win rate on ${LABEL[d]}: ${winRate(m)}%.` : '';
    later(() => showSheet('Boom<i>.</i>', `<p>All mines are marked on the board.${lostStreak}</p>`, true), Math.min(900 + mines * 20, 2000));
  }
}

/* ---------- input: tap = dig, long-press = flag ---------- */
const LONG_PRESS_MS = 320;
const MOVE_TOLERANCE = 10;

function act(i: number, secondary: boolean): void {
  const prev = game.status;
  const openBefore = game.cells.reduce((n, c) => n + (c.revealed ? 1 : 0), 0);
  const useFlag = flagMode !== secondary;
  const cell = game.cells[i];
  const wasFlagged = cell.flagged;
  let changed: boolean;
  if (useFlag && !cell.revealed) {
    changed = game.toggleFlag(i);
    if (changed) (wasFlagged ? sfx.unflag : sfx.flag)();
  } else {
    // dig, or chord on an opened number (in either mode)
    changed = cell.revealed ? game.chord(i) : game.reveal(i);
    const opened = game.cells.reduce((n, c) => n + (c.revealed ? 1 : 0), 0) - openBefore;
    if (changed && game.status !== 'lost' && game.status !== 'won') (opened > 1 ? () => sfx.cascade(opened) : sfx.dig)();
  }
  if (!changed) return;
  if (prev === 'ready') resumeTimer(); // the very first move can already end the game, so start counting anyway
  render(i);
  if ((game.status === 'won' || game.status === 'lost') && prev !== game.status) finish();
  else persist();
}

function release(): void {
  if (!press) return;
  clearTimeout(press.t);
  cellEls[press.i]?.classList.remove('down');
  press = null;
}

const zoom = attachZoom(wrapEl, frameEl, {
  commit: setCellSize,
  onChange: (z) => (fitBtn.hidden = z <= 1.01),
  onGestureStart: release
});

boardEl.style.setProperty('--hold', `${LONG_PRESS_MS}ms`);

boardEl.addEventListener('pointerdown', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.cell');
  if (!el || game.status === 'won' || game.status === 'lost' || zoom.busy()) return;
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
  if (!long && !zoom.busy()) act(i, false);
});

boardEl.addEventListener('pointercancel', release);
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
boardEl.addEventListener('animationend', (e) => {
  if (e.target === boardEl) boardEl.classList.remove('shake');
});
fitBtn.addEventListener('click', () => zoom.reset(true));

// iOS only allows audio after a touch
document.addEventListener('pointerdown', unlock, { capture: true });

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
  const zoomNote = c.cols > 16 || c.rows > 24 ? ' Pinch to zoom on big boards.' : '';
  hint.textContent = `${c.cols}×${c.rows} with ${c.mines} mines, ${density}% density. At most ${c.cols * c.rows - 9} mines fit${adjusted ? ', values will be adjusted' : ''}.${zoomNote}`;
}

/* ---------- settings ---------- */
function openSettings(): void {
  const seg = (name: string, value: string, options: [string, string][]) =>
    `<div class="choice" role="radiogroup">${options
      .map(([v, l]) => `<button type="button" data-set="${name}:${v}" class="${v === value ? 'on' : ''}">${l}</button>`)
      .join('')}</div>`;
  showSheet(
    'Settings',
    `<div class="custom-form">
      <div class="field"><label>Theme<small>AUTO FOLLOWS THE IPHONE</small></label>${seg('theme', settings.theme, [
        ['auto', 'Auto'],
        ['light', 'Light'],
        ['dark', 'Dark']
      ])}</div>
      <div class="field"><label>Sound<small>MUTED BY THE SILENT SWITCH</small></label>${seg('sound', settings.sound ? 'on' : 'off', [
        ['on', 'On'],
        ['off', 'Off']
      ])}</div>
    </div>`
  );
}

$('sheet-body').addEventListener('input', updateHint);
$('sheet-body').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-step],[data-set],#c-start');
  if (!t) return;
  if (t.id === 'c-start') {
    settings.custom = readCustom();
    settings.difficulty = 'custom';
    saveSettings(settings);
    newGame();
    return;
  }
  if (t.dataset.set) {
    const [name, value] = t.dataset.set.split(':');
    if (name === 'theme') {
      settings.theme = value as Theme;
      applyTheme();
    } else if (name === 'sound') {
      settings.sound = value === 'on';
      setSound(settings.sound);
      if (settings.sound) {
        unlock();
        setTimeout(sfx.flag, 30);
      }
    }
    saveSettings(settings);
    t.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === t));
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
  $('sheet-body').scrollTop = 0;
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

/* ---------- records & statistics ---------- */
function openRecords(): void {
  const best = loadBest();
  const keys: StatKey[] = ['beginner', 'intermediate', 'expert', 'custom'];
  const sections = keys
    .map((k) => {
      const m = stats.modes[k];
      if (!m && k === 'custom') return '';
      const avg = m ? avgWin(m) : null;
      const figures = `<div class="figures">
          <div><b>${m?.played ?? 0}</b><span class="mono">Played</span></div>
          <div><b>${m ? winRate(m) : 0}%</b><span class="mono">Won</span></div>
          <div><b>${m?.streak ?? 0}</b><span class="mono">Streak</span></div>
          <div><b>${m?.bestStreak ?? 0}</b><span class="mono">Best run</span></div>
        </div>`;
      const times =
        k === 'custom'
          ? ''
          : (best[k as Difficulty] ?? []).length
            ? `<ol>${best[k as Difficulty]!.map((s, i) => `<li><span>No. ${i + 1}</span><b>${clock(s)}</b></li>`).join('')}</ol>`
            : '<p class="none">No wins yet</p>';
      return `<section class="rec"><h3 class="mono">${LABEL[k]}${avg ? ` · avg ${clock(avg)}` : ''}</h3>${figures}${times}</section>`;
    })
    .join('');
  const recent = stats.history.length
    ? `<section class="rec"><h3 class="mono">Recent games</h3><ol>${stats.history
        .slice(0, 10)
        .map((h) => {
          const date = new Date(h.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          return `<li><span>${date} · ${LABEL[h.mode]}${h.size ? ` ${h.size}` : ''}</span><b class="${h.won ? '' : 'lost'}">${h.won ? clock(h.seconds) : 'Lost'}</b></li>`;
        })
        .join('')}</ol></section>`
    : '';
  showSheet('Records', `<div class="scroll">${sections}${recent}</div>`);
}
$('best').addEventListener('click', openRecords);
$('settings').addEventListener('click', openSettings);

/* ---------- app lifecycle: pause + save when hidden ---------- */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    pauseTimer();
    persist();
  } else if (game.status === 'playing') {
    resumeTimer();
  }
});
window.addEventListener('pagehide', () => {
  pauseTimer();
  persist();
});

/* ---------- boot ---------- */
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
window.addEventListener('resize', () => {
  sizeBoard();
  updateTabs();
});
window.addEventListener('orientationchange', () => setTimeout(sizeBoard, 200));
document.fonts?.ready.then(updateTabs);

applyTheme();
setSound(settings.sound);

const saved = loadCurrent();
const restored = saved ? Game.restore(saved.game) : null;
if (saved && restored && restored.status === 'playing') {
  settings.difficulty = saved.mode;
  mount(restored, saved.ms || 0);
} else {
  newGame();
}
