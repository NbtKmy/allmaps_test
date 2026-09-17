import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import { WarpedMapLayer } from '@allmaps/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre GL JS 6 resolves its worker as `new URL('./maplibre-gl-worker.mjs',
// import.meta.url)`. Rollup cannot statically analyse that template literal, so the
// worker is never emitted into dist/ and the built page renders an empty canvas.
// Let Vite bundle the worker (it pulls in maplibre-gl-shared.mjs) and hand MapLibre
// the resulting URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(maplibreWorkerUrl)

const map = new MapLibreMap({
  container: 'map',
  // @ts-expect-error MapLibre types are incompatible
  style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  center:  [16.3725, 48.2083],
  zoom: 11.5,
  // Pitch is currently not supported by the Allmaps plugin for MapLibre
  maxPitch: 0
})

const annotationUrl = 'https://annotations.allmaps.org/maps/751ae05935adba4f'
const warpedMapLayer = new WarpedMapLayer()

map.on('load', () => {
  // @ts-expect-error MapLibre types are incompatible
  map.addLayer(warpedMapLayer)
  warpedMapLayer.addGeoreferenceAnnotationByUrl(annotationUrl)
})
