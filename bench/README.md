# Benchmarks for Kreft's list rendering

Two tools, both for developers of Kreft (nothing here is published to npm).

## 1. js-framework-benchmark (the public benchmark)

`js-framework-benchmark/kreft/` is Kreft's implementation of
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark). It is **not** submitted to that project.

```bash
git clone --depth 1 https://github.com/krausest/js-framework-benchmark.git
cp -R bench/js-framework-benchmark/kreft js-framework-benchmark/frameworks/keyed/kreft
cd js-framework-benchmark
(cd server && npm ci --ignore-scripts)                    # scripts of third-party packages are not needed
(cd webdriver-ts && npm ci --ignore-scripts && npx tsc)
(cd frameworks/keyed/kreft && KREFT_CLI=/path/to/kreftjs/bin/kreftjs.js \
  ESBUILD_DIR=/folder/with/node_modules/esbuild npm run build-prod)   # needs esbuild
(cd server && npm start) &                                # http://localhost:8080
cd webdriver-ts
node dist/benchmarkRunner.js --headless true --runner puppeteer \
  --chromeBinary "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --framework keyed/kreft keyed/vanillajs keyed/vue keyed/svelte \
  --benchmark 01_ 02_ 03_ 04_ 05_ 06_ 07_ 08_ 09_ --count 8
```

If the puppeteer runner fails with `Requesting main frame too early` (this upstream runner launches Chrome with `headless: false`
plus `--headless=new`, which trips a puppeteer target-attachment race), use `--runner playwright` and point `--chromeBinary` at
Playwright's Chrome for Testing (e.g.
`~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`).
The results above were re-checked this way on 2026-11-05 (Chrome for Testing 153, 8 iterations): Kreft's geomean was
1.62x vanilla vs 1.58x in the table, and per-benchmark medians were within the usual run-to-run spread.

`KREFT_RUNTIME=/path/to/old/kreftjs.js` builds the app with another runtime, to compare two versions of Kreft (copy the folder as
`kreft-before`, change `name` in its `package.json`, and give it its own `package-lock.json`).

### Result of the run on 2026-11-05

Chrome 156 headless, Apple M5, the runner's CPU throttling, 8 iterations, median of the "total" time in ms (lower is better).
Vue 3.5.39, Svelte 5, Preact 11, React 19. Kreft 0.0.19-beta, before and after the list-rendering work.

| Benchmark | vanilla | Svelte | Vue | Preact | React | Kreft before | Kreft after |
|---|---|---|---|---|---|---|---|
| 01 create 1,000 rows | 32.9 | 36.0 | 39.6 | 41.6 | 41.4 | 76.0 | 53.1 |
| 02 replace 1,000 rows | 37.8 | 40.4 | 47.1 | 48.5 | 49.0 | 84.3 | 57.0 |
| 03 update every 10th row | 18.0 | 19.0 | 22.6 | 36.1 | 25.8 | 21.8 | 21.3 |
| 04 select a row | 7.0 | 9.7 | 8.9 | 23.7 | 11.3 | 23.8 | 19.5 |
| 05 swap two rows | 22.9 | 27.5 | 27.8 | 41.3 | 186.8 | 202.3 | 32.3 |
| 06 remove a row | 18.9 | 20.4 | 23.0 | 27.4 | 20.8 | 26.9 | 24.5 |
| 07 create 10,000 rows | 359.6 | 386.7 | 406.6 | 464.4 | 607.5 | 797.9 | 590.2 |
| 08 append 1,000 rows | 37.4 | 40.8 | 43.7 | 49.1 | 46.7 | 96.3 | 70.5 |
| 09 clear | 16.1 | 20.7 | 24.0 | 24.1 | 32.4 | 35.0 | 21.9 |
| **Geometric mean vs vanilla** | 1.00 | 1.15 | 1.24 | 1.61 | 1.74 | 2.46 | **1.58** |

Limits: one machine, one browser, 8 iterations (the project's default is 15), CPU benchmarks only (no memory, startup or size runs),
and the Kreft app was written by the Kreft team, not reviewed upstream. These are local numbers, not published results.

## 2. Regression test for the list renderer

`regression/snap.js` renders about 100 list situations (keyed and unkeyed lists, moves, big shuffles, nested lists, root `k-if`,
several roots, tables, components with slots, animations, clearing) and prints the HTML after every step.
Run it with the old and the new `kreftjs.js` and compare the files; they must be identical.

```bash
npm i puppeteer-core
node bench/regression/snap.js old/kreftjs.js > old.json
node bench/regression/snap.js kreftjs.js     > new.json
cmp old.json new.json && echo identical
```

One difference is allowed: clearing a whole list in a table or list removes the blank text around it. The snapshots ignore the
white space between tags for that reason.
