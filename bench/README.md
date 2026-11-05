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
Vue 3.5.39, Svelte 5, Preact 11, React 19. Kreft 0.0.19-beta: "before" is the runtime before the list-rendering work, "after" is the
current one (row plans, batch insertion, minimal moves, selector classes, minified runtime).

| Benchmark | vanilla | Svelte | Vue | Preact | React | Kreft before | Kreft after |
|---|---|---|---|---|---|---|---|
| 01 create 1,000 rows | 33.9 | 36.9 | 40.7 | 42.3 | 42.7 | 78.3 | 51.0 |
| 02 replace 1,000 rows | 36.2 | 40.5 | 44.2 | 48.8 | 49.3 | 84.6 | 51.8 |
| 03 update every 10th row | 17.6 | 19.5 | 22.3 | 35.8 | 26.1 | 22.0 | 20.6 |
| 04 select a row | 5.2 | 8.2 | 6.8 | 22.2 | 9.0 | 21.7 | 5.3 |
| 05 swap two rows | 19.9 | 22.4 | 23.0 | 36.8 | 157.5 | 169.3 | 27.1 |
| 06 remove a row | 17.2 | 17.9 | 21.1 | 25.4 | 19.1 | 24.0 | 21.9 |
| 07 create 10,000 rows | 353.0 | 382.6 | 409.9 | 459.1 | 594.2 | 816.4 | 510.4 |
| 08 append 1,000 rows | 39.0 | 42.9 | 45.9 | 51.6 | 49.3 | 100.8 | 64.0 |
| 09 clear | 14.9 | 17.9 | 20.4 | 24.4 | 28.4 | 38.5 | 23.3 |
| **Geometric mean vs vanilla** | 1.00 | 1.15 | 1.23 | 1.69 | 1.75 | 2.58 | **1.36** |

The "select a row" result comes from a special case: a class binding written as `class={a === row.key ? 'x' : 'y'}` on a simple
row. One watcher follows `a`, and a row is told only when its own key is the old or the new value, so a selection touches two rows,
not a thousand. Other ways of writing the same thing still evaluate in every row.

What is left: creating and appending many rows are still clearly behind Vue and Svelte (the rows are bound one effect per
binding). Summed over the nine benchmarks, Kreft's time above vanilla fell from 819 ms to 239 ms.
(An earlier run of the same suite, before the row plans, gave a geomean of 1.58 for Kreft; the re-check described above was of
that earlier version.)

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
