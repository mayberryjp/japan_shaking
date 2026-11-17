<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import JapanMap from './components/JapanMap.vue'
import { aggregatePrefectures, dateFormatter, eventDateFormatter, timeFormatter, intensityColor, intensityLabels, matchesEarthquake } from './utils'

const days = ref(7)
const payload = ref(null)
const loading = ref(true)
const error = ref('')
const hovering = ref(null)
const pinned = ref(null)
const selected = computed(() => hovering.value || pinned.value)
const motion = ref(true)
const about = ref(false)
const search = ref('')
const minimum = ref(0)
const tableSection = ref(null)
const activeNav = ref('map')
let requestId = 0
const events = computed(() => (payload.value?.events || []).filter(event =>
  event.magnitude >= minimum.value && matchesEarthquake(event, search.value)))
const aggregate = computed(() => aggregatePrefectures(events.value))
const strongest = computed(() => events.value.length ? Math.max(...events.value.map(event => event.magnitude)).toFixed(1) : '—')
const detail = computed(() => selected.value || events.value[0])
const latestTime = computed(() => payload.value ? timeFormatter.format(new Date(payload.value.end)) : '—')
async function loadEvents() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  hovering.value = null
  pinned.value = null
  payload.value = null
  try {
    const response = await fetch(`/api/earthquakes?days=${days.value}`)
    if (!response.ok) throw new Error(`Earthquake data could not be loaded (${response.status}).`)
    const data = await response.json()
    if (id === requestId) payload.value = data
  } catch (cause) {
    if (id === requestId) error.value = `${cause.message} Check that the SQLite API is running, then retry.`
  } finally { if (id === requestId) loading.value = false }
}
function togglePin(event) { pinned.value = pinned.value?.id === event.id ? null : event }
function navigate(section) {
  activeNav.value = section
  if (section === 'archive') tableSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  else document.getElementById('atlas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function clearSelection() { hovering.value = null; pinned.value = null }
watch(days, loadEvents)
watch([search, minimum], clearSelection)
onMounted(loadEvents)
</script>

<template>
  <v-app>
    <div class="site-shell">
      <header class="site-header">
        <a class="brand" href="#" aria-label="Yure home" @click.prevent="navigate('map')">
          <span class="brand-mark"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="currentColor"/><path d="M2 19h8l4-8 6 16 4-11 3 3h7" fill="none" stroke="#f5f3ed" stroke-width="1.8"/></svg></span>
          <span class="brand-name">YURE<span class="brand-ja">揺れ</span></span>
          <span class="brand-divider" /><span class="brand-caption">JAPAN<br>SEISMIC ATLAS</span>
        </a>
        <nav class="main-nav" aria-label="Main navigation">
          <button :class="{ active: activeNav === 'map' }" @click="navigate('map')">Map <span>地図</span></button>
          <button :class="{ active: activeNav === 'archive' }" @click="navigate('archive')">History <span>記録</span></button>
          <button @click="about = true">About <span>概要</span></button>
        </nav>
      </header>

      <main>
        <section id="atlas" class="atlas-section">
          <div class="section-toolbar">
            <div class="section-title"><h1>Japan earthquakes <span lang="ja">日本の地震</span></h1></div>
            <div class="period-control"><span>TIME WINDOW</span><v-btn-toggle v-model="days" mandatory color="primary" variant="text" aria-label="Earthquake time window"><v-btn v-for="period in [1, 7, 30, 365]" :key="period" :value="period" size="small">{{ period === 1 ? '24 hours' : `${period} days` }}</v-btn></v-btn-toggle></div>
          </div>

          <div v-if="error" class="data-error" role="alert"><span>{{ error }}</span><v-btn variant="outlined" size="small" @click="loadEvents">Retry</v-btn></div>
          <div class="workspace-grid" :aria-busy="loading">
            <div class="map-panel">
              <div class="map-topline">
                <div class="map-heading"><span class="live-dot" /><strong>{{ selected ? 'EARTHQUAKE REPLAY' : 'SEISMIC ACTIVITY' }}</strong><span class="map-range">{{ selected ? dateFormatter.format(new Date(selected.occurred_at)) : `PAST ${days === 1 ? '24 HOURS' : `${days} DAYS`}` }}</span></div>
                <span class="demo-label">{{ payload?.demo ? 'DEMONSTRATION DATA' : loading ? 'CONNECTING…' : error ? 'DATA UNAVAILABLE' : 'SQLITE ARCHIVE' }}</span>
              </div>
              <div class="map-stat-row">
                <div><span class="stat-value">{{ loading ? '—' : events.length }}<span class="stat-unit">events</span></span><span class="stat-label">Recorded earthquakes</span></div>
                <div><span class="stat-value"><span class="magnitude-prefix">M</span>{{ loading ? '—' : strongest }}</span><span class="stat-label">Largest magnitude</span></div>
                <div><span class="stat-value">{{ loading ? '—' : Object.keys(aggregate).length }}<span class="stat-unit">/ 47</span></span><span class="stat-label">Prefectures affected</span></div>
              </div>
              <JapanMap :events="events" :selected="selected" :loading="loading" :motion="motion" @select="togglePin" />
              <div v-if="loading" class="map-loading" role="status"><v-progress-circular indeterminate size="24" width="2" color="primary" /><span>Loading earthquakes…</span></div>
              <div class="map-bottomline"><div class="intensity-legend"><span>JMA INTENSITY</span><span v-for="rank in [1, 2, 3, 4, 5, 7, 9]" :key="rank" class="legend-item"><i :style="{ background: intensityColor(rank) }" />{{ intensityLabels[rank] }}</span></div><button class="motion-button" :aria-pressed="motion" @click="motion = !motion"><span>{{ motion ? 'Ⅱ' : '▷' }}</span> {{ motion ? 'Pause motion' : 'Enable motion' }}</button></div>
            </div>

            <aside ref="tableSection" class="history-panel" aria-label="Earthquake history">
              <div class="history-heading"><h2>Earthquake history <span lang="ja">地震記録</span></h2><span class="log-count">{{ events.length }}</span></div>
              <div class="search-row"><span aria-hidden="true">⌕</span><input v-model="search" aria-label="Search locations or affected prefectures" placeholder="Place or prefecture · 東京 / Tokyo" /><select v-model.number="minimum" aria-label="Minimum magnitude"><option :value="0">All M</option><option :value="3">M 3+</option><option :value="4">M 4+</option><option :value="5">M 5+</option><option :value="6">M 6+</option></select></div>
              <div class="table-hint">Hover to preview · Click to pin</div>
              <div class="event-table-scroll">
                <table class="event-table"><thead><tr><th>TIME / EPICENTER</th><th>MAG.</th><th>JMA</th></tr></thead>
                  <tbody @mouseleave="hovering = null">
                    <tr v-for="event in events" :key="event.id" :class="{ 'selected-row': selected?.id === event.id, 'pinned-row': pinned?.id === event.id }"
                      @mouseenter="hovering = event">
                      <td><button class="event-select" :aria-pressed="pinned?.id === event.id" @click="togglePin(event)" @focus="hovering = event" @blur="hovering = null" @keydown.esc="clearSelection">
                        <span class="event-date">{{ dateFormatter.format(new Date(event.occurred_at)) }} <span>{{ timeFormatter.format(new Date(event.occurred_at)).slice(0, 5) }}</span><span v-if="pinned?.id === event.id" class="pinned-label">PINNED</span></span>
                        <span class="event-name">{{ event.location }}</span><span class="event-ja" lang="ja">{{ event.location_ja }}</span>
                      </button></td>
                      <td class="event-mag">{{ event.magnitude.toFixed(1) }}</td>
                      <td><span class="intensity-badge" :style="{ '--intensity-color': intensityColor(event.max_intensity) }">{{ intensityLabels[event.max_intensity] }}</span></td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="loading" class="empty-state">Loading earthquake records…</div>
                <div v-else-if="!events.length" class="empty-state">{{ error ? 'Records unavailable. Retry the request above.' : 'No earthquakes match this window and filters.' }}<button v-if="search || minimum" @click="search = ''; minimum = 0">Clear filters ↗</button></div>
              </div>
              <div class="table-footer"><span>{{ events.length }} events in this window</span><span>ALL TIMES JST <span class="tiny-clock">◷</span></span></div>
              <div class="event-detail">
                <div class="detail-eyebrow"><span>{{ selected ? 'SELECTED EVENT' : 'LATEST EVENT' }}</span><button v-if="selected" aria-label="Clear selected earthquake" @click="clearSelection">Clear ×</button></div>
                <template v-if="detail">
                  <h3>{{ detail.location_ja }}</h3><p>{{ detail.location }}</p>
                  <time class="detail-time" :datetime="detail.occurred_at">{{ eventDateFormatter.format(new Date(detail.occurred_at)) }} · {{ timeFormatter.format(new Date(detail.occurred_at)) }} JST</time>
                  <div class="detail-metrics"><div><span>DEPTH</span><strong>{{ detail.depth_km }}<small> km</small></strong></div><div><span>MAX. INTENSITY</span><strong>{{ intensityLabels[detail.max_intensity] }}<small> JMA</small></strong></div><div><span>FELT IN</span><strong>{{ detail.observations.length }}<small> pref.</small></strong></div></div>
                  <div class="coordinates">{{ Math.abs(detail.latitude).toFixed(2) }}°{{ detail.latitude >= 0 ? 'N' : 'S' }} <span>/</span> {{ Math.abs(detail.longitude).toFixed(2) }}°{{ detail.longitude >= 0 ? 'E' : 'W' }} <span class="coordinate-cross">⌖</span></div>
                </template>
                <p v-else class="no-detail">Select a time window with records to explore an event.</p>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <footer class="site-footer"><span>Colors: maximum JMA intensity · {{ payload?.demo ? 'Synthetic demo data — not a live feed' : 'SQLite archive' }}</span><span>MAP: <a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noreferrer">MLIT NATIONAL LAND NUMERICAL INFORMATION</a> · VIA SMARTNEWS</span><span>{{ latestTime }} JST</span></footer>
    </div>
    <v-dialog v-model="about" scrollable><v-card class="about-card"><v-card-title>Reading the atlas <span lang="ja">地図の読み方</span></v-card-title><v-card-text><p>YURE (揺れ, “shaking”) is a visual exploration of Japan's earthquake archive, not an early-warning or safety service.</p><h3>Magnitude is not intensity.</h3><p>Magnitude describes an earthquake's size. JMA intensity describes shaking observed at a location. Colors show each prefecture's highest recorded intensity; halos highlight activity. Blue is lower intensity, red is higher.</p><h3>Explore an individual tremor.</h3><p>Hover or keyboard-focus an event to preview it. Click an event or epicenter to pin it. Only prefectures with observations shake, with motion scaled by their own intensity. Use “Pause motion” for a still view. Your system's reduced-motion preference is also respected.</p><h3>Data & boundaries</h3><p>{{ payload?.demo ? 'This installation uses synthetic demonstration earthquakes in a local SQLite database. Dates are generated when the demo database is first created. These are not real earthquake reports.' : 'This installation reads a local SQLite earthquake archive through a Node.js API. The time windows end at the time of each request.' }} All displayed times are Japan Standard Time. No automatic live refresh is implied.</p><p>Administrative geometry: MLIT National Land Numerical Information, simplified by SmartNews Media Research Institute. The Okinawa inset shows the main island region; remote islands are omitted from this display. Borders are for visualization, not legal or navigational use.</p><p>JMA scale: 1, 2, 3, 4, 5−, 5+, 6−, 6+, 7. Missing observations are shown as unknown, never as measured zero.</p></v-card-text><v-card-actions><v-spacer/><v-btn color="primary" variant="flat" @click="about = false">Back to the atlas</v-btn></v-card-actions></v-card></v-dialog>
  </v-app>
</template>
