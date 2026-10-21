// Inline SVG icons so they render identically on every device (emoji/glyph rendering varies on iOS).
// Drawn as simple printed marks to match the puzzle-book look.

/** Red pennant on an ink pole with a small base. */
export const FLAG = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M7 21V3" stroke="currentColor" stroke-width="1.8"/>
  <path d="M7.5 3.5L19 8l-11.5 4.5z" fill="var(--red)"/>
  <path d="M4 21h7" stroke="currentColor" stroke-width="1.8"/>
</svg>`;

/** Ink mine: solid round body with eight spikes and a paper highlight. */
export const MINE = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8"/>
  </g>
  <circle cx="12" cy="12" r="6" fill="currentColor"/>
  <circle cx="10" cy="10" r="1.6" fill="var(--paper)"/>
</svg>`;

/** Crossed-out mark for a wrongly placed flag. */
export const CROSS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
