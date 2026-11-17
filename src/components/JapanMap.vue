<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { geoMercator, geoPath, geoGraticule } from 'd3-geo'
import { aggregatePrefectures, eventDateFormatter, timeFormatter, intensityColor, intensityLabels, prefectureNames } from '../utils'

const props = defineProps({ events: { type: Array, required: true }, selected: Object, loading: Boolean, motion: Boolean })
const emit = defineEmits(['select'])
const features = ref([])
const error = ref('')
const hovered = ref(null)
const stage = ref(null)
const tooltip = ref(null)
const tooltipPosition = ref({ left: '12px', top: '12px' })
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
let drag = null
const projection = geoMercator().center([137.4, 37.6]).scale(1840).translate([465, 360])
const insetProjection = geoMercator().center([127.6, 26.1]).scale(2250).translate([126, 562])
const path = geoPath(projection)
const insetPath = geoPath(insetProjection)
const graticule = path(geoGraticule().step([4, 4])())
const scaleWidth = 200 * projection.scale() / (6371 * Math.cos(37.6 * Math.PI / 180))
const aggregate = computed(() => aggregatePrefectures(props.events))
const activity = computed(() => props.selected
  ? Object.fromEntries(props.selected.observations.map(o => [o.prefecture, { intensity: o.intensity, count: 1 }]))
  : aggregate.value)
const points = computed(() => (props.selected ? [props.selected] : props.events).map(event => {
  const coordinates = (event.latitude < 30 ? insetProjection : projection)([event.longitude, event.latitude])
  return { ...event, x: coordinates[0], y: coordinates[1] }
}))
const label = computed(() => {
  if (!hovered.value) return null
  if (hovered.value.type === 'event') {
    const event = hovered.value.event
    return { name: event.location_ja, english: event.location, intensity: event.max_intensity, event, caption: 'Epicenter', timeLabel: 'Event time' }
  }
  const name = hovered.value.name
  const observations = (props.selected ? [props.selected] : props.events).flatMap(event => {
    const observation = event.observations.find(row => row.prefecture === name)
    return observation ? [{ event, intensity: observation.intensity }] : []
  })
  const strongest = observations.reduce((best, row) => !best || row.intensity > best.intensity ||
    (row.intensity === best.intensity && new Date(row.event.occurred_at) > new Date(best.event.occurred_at)) ? row : best, null)
  return {
    name, english: prefectureNames[name], intensity: strongest?.intensity || 0, event: strongest?.event,
    caption: props.selected ? 'Event observation' : `${observations.length} recorded ${observations.length === 1 ? 'event' : 'events'}`,
    timeLabel: props.selected ? 'Event time' : 'Strongest event',
  }
})
function positionTooltip(clientX, clientY) {
  if (!stage.value || !tooltip.value) return
  const bounds = stage.value.getBoundingClientRect()
  const card = tooltip.value.getBoundingClientRect()
  const left = Math.max(12, Math.min(clientX - bounds.left + 18, bounds.width - card.width - 12))
  const top = Math.max(12, Math.min(clientY - bounds.top + 18, bounds.height - card.height - 12))
  tooltipPosition.value = { left: `${left}px`, top: `${top}px` }
}
async function showTooltip(value, event) {
  hovered.value = value
  const bounds = event.currentTarget.getBoundingClientRect()
  const x = event.type === 'focus' ? bounds.right : event.clientX
  const y = event.type === 'focus' ? bounds.top : event.clientY
  await nextTick()
  positionTooltip(x, y)
}
watch(() => props.events, () => { hovered.value = null })
const cities = [
  { name: 'SAPPORO', ja: '札幌', coordinate: [141.35, 43.06] },
  { name: 'SENDAI', ja: '仙台', coordinate: [140.87, 38.27] },
  { name: 'TOKYO', ja: '東京', coordinate: [139.69, 35.68] },
  { name: 'OSAKA', ja: '大阪', coordinate: [135.5, 34.69] },
  { name: 'FUKUOKA', ja: '福岡', coordinate: [130.4, 33.59] },
].map(city => ({ ...city, point: projection(city.coordinate) }))

async function loadMap() {
  error.value = ''
  try {
    const response = await fetch('/data/japan.geojson')
    if (!response.ok) throw new Error(`Map request failed (${response.status})`)
    const data = await response.json()
    // d3's spherical polygons require clockwise exterior rings.
    features.value = data.features.map(feature => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        type: 'MultiPolygon',
        coordinates: (feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates)
          .map(polygon => polygon.map(ring => [...ring].reverse())),
      },
    }))
  } catch (cause) { error.value = cause.message }
}
function featurePath(feature) {
  const isOkinawa = feature.properties.N03_001 === '沖縄県'
  const coordinates = feature.geometry.coordinates.filter(polygon => isOkinawa
    ? polygon[0][0][0] > 126 && polygon[0][0][0] < 129.5
    : polygon[0][0][1] > 30 && polygon[0][0][0] < 147)
  return (isOkinawa ? insetPath : path)({ ...feature, geometry: { ...feature.geometry, coordinates } })
}
function changeZoom(delta) { zoom.value = Math.max(1, Math.min(2.5, zoom.value + delta)); if (zoom.value === 1) pan.value = { x: 0, y: 0 } }
function pointerDown(event) {
  if (zoom.value <= 1 || event.target.closest('[data-epicenter]')) return
  drag = { x: event.clientX, y: event.clientY, pan: { ...pan.value } }
  event.currentTarget.setPointerCapture(event.pointerId)
}
function pointerMove(event) {
  if (hovered.value) positionTooltip(event.clientX, event.clientY)
  if (!drag) return
  const factor = 940 / event.currentTarget.getBoundingClientRect().width
  pan.value = { x: drag.pan.x + (event.clientX - drag.x) * factor, y: drag.pan.y + (event.clientY - drag.y) * factor }
}
onMounted(loadMap)
</script>

<template>
  <div ref="stage" class="map-stage" :class="{ 'motion-off': !motion, 'is-previewing': selected }">
    <div v-if="error" class="map-error" role="alert">{{ error }} <v-btn variant="text" @click="loadMap">Retry map</v-btn></div>
    <svg v-else viewBox="0 0 940 700" role="img" aria-label="Interactive map of Japan's 47 prefectures and earthquake epicenters"
      @pointerdown="pointerDown" @pointermove="pointerMove" @pointerleave="hovered = null" @keydown.esc="hovered = null" @pointerup="drag = null" @pointercancel="drag = null">
      <defs>
        <pattern id="ocean-dots" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#b9c9c7" opacity=".35" /></pattern>
        <filter id="halo" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="7" /></filter>
        <clipPath id="map-clip"><rect width="940" height="700" /></clipPath>
      </defs>
      <rect width="940" height="700" fill="url(#ocean-dots)" />
      <g class="map-rising-sun" clip-path="url(#map-clip)" aria-hidden="true" pointer-events="none" fill="#c84332" opacity=".09">
        <path v-for="ray in 16" :key="ray" d="M470 295L385-440H555Z"
          :transform="`rotate(${ray * 22.5} 470 295)`" opacity=".035" />
        <circle cx="470" cy="295" r="118" opacity=".1" />
      </g>
      <g clip-path="url(#map-clip)">
        <g :transform="`translate(${470 + pan.x}, ${350 + pan.y}) scale(${zoom}) translate(-470, -350)`">
          <path :d="graticule" fill="none" stroke="#a8bfbd" stroke-width=".7" stroke-dasharray="3 7" opacity=".28" />
          <text x="720" y="456" class="ocean-label" transform="rotate(-63 720 456)">PACIFIC OCEAN</text>
          <text x="217" y="230" class="ocean-label" transform="rotate(-48 217 230)">SEA OF JAPAN</text>
          <g v-for="feature in features" :key="feature.properties.N03_001">
            <path v-if="activity[feature.properties.N03_001]" :d="featurePath(feature)"
              :fill="intensityColor(activity[feature.properties.N03_001].intensity)" class="prefecture-halo" filter="url(#halo)" />
            <path :d="featurePath(feature)" class="prefecture"
              :class="{ shaking: selected && activity[feature.properties.N03_001], 'is-active': activity[feature.properties.N03_001] }"
              :style="{ '--shake': `${.35 + (activity[feature.properties.N03_001]?.intensity || 0) * .55}px`, '--speed': `${.31 - (activity[feature.properties.N03_001]?.intensity || 0) * .02}s` }"
              :fill="activity[feature.properties.N03_001] ? intensityColor(activity[feature.properties.N03_001].intensity) : '#dedfd2'"
              :aria-label="`${feature.properties.N03_001} · Maximum JMA intensity ${intensityLabels[activity[feature.properties.N03_001]?.intensity || 0]}`"
              :aria-describedby="hovered?.name === feature.properties.N03_001 ? 'map-tooltip' : undefined"
              @mouseenter="showTooltip({ type: 'prefecture', name: feature.properties.N03_001 }, $event)" @mouseleave="hovered = null" />
          </g>
          <path d="M50 489H191L225 524V637H50Z" fill="none" stroke="#98aaa5" stroke-dasharray="4 5" opacity=".55" />
          <text x="65" y="511" class="inset-label">OKINAWA / 沖縄</text>
          <g v-for="city in cities" :key="city.name" class="city" :transform="`translate(${city.point})`" pointer-events="none">
            <circle r="2.7" fill="#424d47" stroke="#fcfbf7" stroke-width="1" />
            <text x="9" y="-3" class="city-ja">{{ city.ja }}</text>
            <text x="9" y="10" class="city-en">{{ city.name }}</text>
          </g>
          <g v-for="(point, index) in points" :key="point.id" :transform="`translate(${point.x}, ${point.y})`"
            class="epicenter" :class="{ 'selected-epicenter': selected }" :style="{ '--epicenter-color': intensityColor(point.max_intensity), '--delay': `${index * -.29}s` }"
            data-epicenter tabindex="0" role="button" :aria-label="`${point.location}, magnitude ${point.magnitude}. Preview shaking`"
            :aria-describedby="hovered?.event?.id === point.id ? 'map-tooltip' : undefined"
            @mouseenter="showTooltip({ type: 'event', event: point }, $event)" @mouseleave="hovered = null"
            @focus="showTooltip({ type: 'event', event: point }, $event)" @blur="hovered = null"
            @click="emit('select', point)" @keydown.enter.prevent="emit('select', point)" @keydown.space.prevent="emit('select', point)">
            <circle class="epicenter-target" r="10" fill="transparent" />
            <circle class="pulse-ring" :r="selected ? 22 : 12" />
            <circle class="pulse-ring second" :r="selected ? 22 : 12" />
            <circle class="epicenter-core" :r="selected ? 5 : 3.5" />
          </g>
        </g>
      </g>
      <g transform="translate(875 45)" class="compass"><path d="M0 26V0M-5 9L0 0 5 9" fill="none" stroke="#586b65" stroke-width="1.3"/><text x="0" y="-10" text-anchor="middle">N</text></g>
      <g transform="translate(756 658)" class="scale"><path :d="`M0-5V0H${scaleWidth}V-5M${scaleWidth / 2} 0V-4`" fill="none" stroke="#74847d"/><text x="0" y="15">0</text><text :x="scaleWidth" y="15" text-anchor="end">~{{ Math.round(200 / zoom) }} km</text></g>
    </svg>
    <div class="map-coordinate">日本列島 <span>36° N &nbsp; 138° E</span></div>
    <div v-if="label" id="map-tooltip" ref="tooltip" class="map-tooltip" role="tooltip" :style="{ ...tooltipPosition, '--tooltip-accent': intensityColor(label.intensity) }">
      <div class="tooltip-caption"><i />{{ label.caption }}</div>
      <div class="tooltip-heading"><div><strong lang="ja">{{ label.name }}</strong><span>{{ label.english }}</span></div><div class="tooltip-intensity"><span>JMA</span><b>{{ intensityLabels[label.intensity] }}</b></div></div>
      <template v-if="label.event">
        <div class="tooltip-event"><span>{{ label.timeLabel }}</span><time :datetime="label.event.occurred_at">{{ eventDateFormatter.format(new Date(label.event.occurred_at)) }}<strong>{{ timeFormatter.format(new Date(label.event.occurred_at)) }} <small>JST</small></strong></time></div>
        <div class="tooltip-footer"><span>M{{ label.event.magnitude.toFixed(1) }} <i /> {{ label.event.depth_km }} km deep</span><span>{{ label.event.location }}</span></div>
      </template>
      <p v-else class="tooltip-empty">{{ selected ? 'No observation for this event.' : 'No observations in this time window.' }}</p>
    </div>
    <div class="map-zoom">
      <v-btn size="small" variant="text" aria-label="Zoom in" :disabled="zoom >= 2.5" @click="changeZoom(.3)">+</v-btn>
      <v-btn size="small" variant="text" aria-label="Zoom out" :disabled="zoom <= 1" @click="changeZoom(-.3)">−</v-btn>
      <v-btn size="small" variant="text" aria-label="Reset map view" @click="zoom = 1; pan = { x: 0, y: 0 }">⌖</v-btn>
    </div>
    <div v-if="selected" class="preview-notice"><span class="live-dot" /> Event preview · intensity-proportional shaking</div>
  </div>
</template>
