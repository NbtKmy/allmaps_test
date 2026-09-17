# allmaps_test

A minimal test bed for displaying an [Allmaps](https://allmaps.org/) georeference annotation on top of a [MapLibre GL JS](https://maplibre.org/) basemap.

The demo in `index.js` loads the annotation at
`https://annotations.allmaps.org/maps/751ae05935adba4f` and renders it over a
Carto Voyager basemap centred on Vienna.

## Getting started

```bash
npm install
npm run dev      # dev server on http://localhost:5173/
npm run build    # production build into dist/
npm run preview  # serve the production build
```

## Current versions

| Package             | Version        |
| ------------------- | -------------- |
| `@allmaps/maplibre` | 1.0.0-beta.43  |
| `maplibre-gl`       | 6.10.0         |
| `vite`              | 8.3.0          |
| `zod` (pinned)      | 4.4.3          |

## Known issues and workarounds

These problems are not one-off accidents — they come from the dependency tree
and from how MapLibre loads its worker, so they are likely to reappear after a
fresh `npm install`, a lockfile deletion, or a dependency upgrade. All the
workarounds are already committed; this section records *why* they exist so they
are not removed by accident.

Note that items 2 and 3 are two halves of the same MapLibre worker problem: one
affects `npm run dev`, the other affects `npm run build`. Fixing only one of
them leaves a blank page in the other mode.

### 1. `zod` must stay pinned to 4.4.3

**Symptom.** The app fails at module load time (before any annotation is
fetched) with:

```
Invalid discriminated union option at index '1'
```

The stack trace points into `node_modules/zod/v4/core/schemas.js`.

**Cause.** `@allmaps/annotation` (pulled in by `@allmaps/maplibre`) declares
`GeoreferencedMapAllVersionsSchema` as a discriminated union on the `version`
field, combining `GeoreferencedMap1Schema` and `GeoreferencedMap2Schema`.
`GeoreferencedMap2Schema` does not carry the `version` discriminator in its raw
shape. Zod 4.5.0 tightened discriminated-union validation so that every option
must expose the discriminator at schema-construction time, which turns this into
a hard error the moment the module is imported.

Version bisection:

- Working: 4.3.6, 4.4.0, 4.4.3
- Failing: 4.5.0, 4.5.4, 4.6.0, 4.6.5

`@allmaps/annotation` requests `zod@^4.3.6`, so npm is free to resolve a
4.5.0-or-later release and break the build on its own.

**Workaround.** `package.json` contains an npm `overrides` entry that forces the
exact version across the whole dependency tree:

```json
"overrides": {
  "zod": "4.4.3"
}
```

An override is used rather than a direct dependency because this project does
not import Zod itself; it only needs to constrain what its dependencies get. The
version is given without a caret so that npm cannot drift forward into the
broken range.

If the error comes back, check what actually got installed:

```bash
npm ls zod
```

Expect a single `zod@4.4.3` with no nested duplicates. Note that the string
`Invalid discriminated union option` still appears in the built bundle — those
are Zod's static error messages, and with 4.4.3 that code path is never reached
at runtime.

This can be dropped once Allmaps ships a version of `@allmaps/annotation` whose
schemas satisfy Zod's stricter rules.

### 2. `maplibre-gl` must be excluded from Vite's dependency optimizer

**Symptom.** `npm run dev` serves a blank page and logs:

```
The file does not exist at "<project>/node_modules/.vite/deps/maplibre-gl-worker.mjs"
which is in the optimize deps directory. The dependency might be incompatible
with the dep optimizer. Try adding it to `optimizeDeps.exclude`.
```

**Cause.** MapLibre GL JS 6 ships its web worker as a separate file and loads it
through a URL resolved relative to its own module
(`new URL('./maplibre-gl-worker.mjs', import.meta.url)`). When Vite pre-bundles
`maplibre-gl` into `node_modules/.vite/deps/`, `import.meta.url` points at that
directory, but the worker file is never copied there, so the request 404s and the
map never initialises.

**Workaround.** `vite.config.js` keeps `maplibre-gl` out of the optimizer so it
is served straight from `node_modules`, where the worker sits next to it:

```js
optimizeDeps: {
  exclude: ['maplibre-gl']
}
```

Only `maplibre-gl` may be excluded. Excluding `@allmaps/maplibre` as well breaks
the app with `ReferenceError: exports is not defined` from `ml-matrix`, a
CommonJS transitive dependency that genuinely needs pre-bundling.

After changing this config, clear the stale cache:

```bash
rm -rf node_modules/.vite
```

Note that this only fixes the dev server. The production build needs the
separate workaround in item 3.

### 3. The production build needs an explicit `setWorkerUrl()`

**Symptom.** `npm run dev` looks fine, but the built page in `dist/` renders an
almost blank screen: the basemap background colour and the
`MapLibre | © CARTO, © OpenStreetMap` attribution appear in the bottom-right
corner, and nothing else. No tiles, no labels, no georeferenced map. The browser
console shows a 404 for `dist/assets/maplibre-gl-worker.mjs`.

The attribution is the tell: it comes from `style.json`, so the style request
succeeded and the network is fine. Only the tile pipeline — which runs in the
worker — is dead.

**Cause.** Same worker loader as item 2, seen from the build side. MapLibre
resolves the worker with a *computed* path:

```js
const file = url.endsWith('-dev.mjs') ? 'maplibre-gl-worker-dev.mjs' : 'maplibre-gl-worker.mjs'
return new URL(`./${file}`, import.meta.url).href
```

Rollup cannot statically analyse that template literal, so it never emits the
worker as a build asset. At runtime `import.meta.url` points at
`dist/assets/index-*.js`, the request for a sibling `maplibre-gl-worker.mjs`
404s, and the map paints only its background.

The dev server does not hit this because item 2 keeps `maplibre-gl` out of
`node_modules/.vite/deps/`, so the real worker file is still sitting next to the
module it is resolved against.

**Workaround.** `index.js` lets Vite bundle the worker and hands MapLibre the
resulting URL:

```js
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(maplibreWorkerUrl)
```

The `?worker&url` suffix is what matters. A plain `?url` import would copy the
worker file verbatim, and the copy would still try to import its sibling
`./maplibre-gl-shared.mjs`, which is not emitted either. `?worker` makes Vite
bundle the worker together with that shared chunk, and `&url` returns the emitted
file's URL instead of a `Worker` constructor, which is what `setWorkerUrl()`
expects. In dev, Vite resolves the same import to a served worker module, so both
modes work from one line.

To confirm a build is intact, check that the worker asset exists and that the
bundle references it relatively:

```bash
npm run build
ls dist/assets/   # expect a maplibre-gl-worker-*.js next to index-*.js
grep -o 'maplibre-gl-worker-[A-Za-z0-9_-]*\.js' dist/assets/index-*.js | head -1
```

The `grep` should print the same filename that `ls` shows. MapLibre's own
`maplibre-gl-worker.mjs` string is also present in the bundle — that is the
unreachable fallback inside the library, not the URL the app uses.

### 4. `base: './'` is required for serving `dist/` from a parent directory

**Symptom.** A completely blank page — no attribution, no background — when
`dist/index.html` is opened through a server whose root is the project directory
rather than `dist/` (VS Code Live Server does this). The console shows 404s for
`/assets/index-*.js` and `/assets/index-*.css`.

**Cause.** Vite's default `base` of `/` emits absolute asset URLs, which resolve
to `<root>/assets/…` instead of `<root>/dist/assets/…`, so the bundle is never
loaded and no script runs at all.

**Workaround.** `vite.config.js` sets:

```js
base: './'
```

Assets are then referenced as `./assets/index-*.js` and resolve correctly from
any server root. `npm run preview`, which serves `dist/` as the root, works
either way — so this only shows up with Live Server or a similar setup.

## Beta software notice

`@allmaps/maplibre` is installed at **1.0.0-beta.43** — a pre-release. The
Allmaps MapLibre plugin has not reached a stable 1.0.0, so expect:

- **Breaking API changes between beta releases.** Layer options, method names,
  and event payloads may change without a major-version bump, since the semver
  guarantees that normally prevent this do not apply to `1.0.0-beta.*`.
- **Incomplete feature coverage.** Notably, map pitch is not supported by the
  plugin, which is why `index.js` sets `maxPitch: 0`.
- **Type friction with MapLibre.** The plugin's types do not line up with
  `maplibre-gl` 6, so `index.js` carries `@ts-expect-error` comments on the
  `style` option and the `map.addLayer(warpedMapLayer)` call.
- **Dependency churn like the Zod issue above**, which is a direct consequence of
  loose version ranges in a fast-moving pre-release package.

Because of this, the `package-lock.json` in this repository should be treated as
part of the working configuration. Upgrading `@allmaps/maplibre` is worth doing
deliberately — with the app checked in the browser afterwards — rather than as a
blanket `npm update`.
