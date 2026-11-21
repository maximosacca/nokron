# AGENTS.md

Single-page WebGL art installation ("Fragmento de Memoria") built with Vite, Three.js, and Tone.js. UI copy, code identifiers, and comments are in Spanish — keep that convention.

## Commands

```sh
npm run dev       # Vite dev server; the app is served under /nokron/, not /
npm run build     # production build into dist/ (ignored, never commit it)
npm run preview   # preview the production build
npm run deploy    # predeploy builds, then gh-pages -d dist pushes to origin/gh-pages
```

There are no tests, linter, formatter, or typecheck configured. Do not invent `npm test`/`npm run lint`; verify changes with `npm run build` plus a manual browser check.

## Runtime modes (easy to miss)

- `?dev` enables the dev panel and `#text` from `index.html`, skips the fullscreen request, and defaults the sculpture material to `fresnel` instead of `espejo`.
- Without `?dev` the app runs in kiosk mode: fullscreen on user gesture, wake lock, no selection/context menu. Most styles are injected inline from JS, not in `src/style.css`.
- Five rapid taps in the top-left 70px corner toggles the dev panel at runtime.
- `?idle=5` makes the narrative overlay reappear after 5 idle seconds (default 15s), for testing `src/narrativa.js`.

## Architecture

- `index.html` only holds the canvas and loads `/src/main.js`.
- `src/main.js` is the whole app: Three.js scene (40 planes sharing one geometry, morphing profiles), OrbitControls, gesture handling (tap/double tap/hold/pinch/tilt), dev UI, and Tone.js audio (started only by a user gesture). Audio uses only two FMSynth voices (active + morph target), updates its params at ~10 Hz, and caps `devicePixelRatio` at 1.5 on touch devices — these are deliberate tablet-performance measures, don't revert them casually.
- `src/narrativa.js` exports `iniciarNarrativa()`; edit the stanza texts in `ESTROFAS_POR_DEFECTO` at the top.
- Runtime images (`fondo-nokron.jpg`, `tanques.jpg`, `base-destruida.jpg`) are referenced by bare filename and must live in `public/`. `src/assets/` is unused Vite template leftovers.

## Deployment

`vite.config.js` sets `base: '/nokron/'` for GitHub Pages at `https://maximosacca.github.io/nokron/`. Keep that base in mind for asset paths and never hardcode `/`-absolute URLs expecting a root deployment. The ~800 kB JS chunk warning at build time is expected from Three.js + Tone.js.
