# Minesweeper

An offline Minesweeper PWA for iPhone, designed like a printed puzzle book.

**Play:** https://punchface2000.github.io/minesweeper/

## Install on iPhone
Open the link in Safari → Share → **Add to Home Screen**. It then runs fullscreen and offline.

## Controls
- Tap: dig
- Long-press: flag (or switch the **Dig / Flag** mode button)
- Flag/long-press an opened number whose flags match: chord (opens the remaining neighbours)
- First tap is always safe
- Pinch to zoom on big boards, drag with one finger to move around, "Fit board" to zoom out
- Your game is saved automatically and the timer pauses when you leave the app
- Records shows best times, win rate, streaks and recent games
- Settings: theme (auto/light/dark) and sound (follows the silent switch)

## Develop
```bash
npm install
npm run dev      # local dev server
npm test         # game logic tests
npm run build    # production build into dist/
npm run icons    # regenerate PNG icons from public/favicon.svg
```

## Structure
- `src/game.ts` – pure game logic (no DOM), covered by `src/game.test.ts`
- `src/storage.ts` – settings, best times, statistics and the saved game in `localStorage`
- `src/stats.ts` – pure statistics logic (tested in `src/stats.test.ts`)
- `src/zoom.ts` – pinch-zoom and pan controller
- `src/sound.ts` – synthesized sound effects (Web Audio, no files)
- `src/main.ts` / `src/style.css` – UI
- `.github/workflows/deploy.yml` – builds and publishes to GitHub Pages on every push to `main`
