# Minesweeper

A modern, offline-capable Minesweeper PWA built for iPhone.

**Play:** https://punchface2000.github.io/minesweeper/

## Install on iPhone
Open the link in Safari → Share → **Add to Home Screen**. It then runs fullscreen and offline.

## Controls
- Tap: dig
- Long-press: flag (or switch the **Dig / Flag** mode button)
- Flag/long-press an opened number whose flags match: chord (opens the remaining neighbours)
- First tap is always safe

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
- `src/storage.ts` – settings and best times in `localStorage`
- `src/main.ts` / `src/style.css` – UI
- `.github/workflows/deploy.yml` – builds and publishes to GitHub Pages on every push to `main`
