<script setup lang="ts">
import { ref, computed } from 'vue'

interface Event {
  id: string
  goroutine: number
  time: number
  label: string
  type: 'write' | 'read' | 'send' | 'receive' | 'lock' | 'unlock' | 'call' | 'return'
}

interface HappensBefore {
  from: string
  to: string
  type: 'channel' | 'mutex' | 'once' | 'goroutine' | 'program-order'
}

interface Scenario {
  name: string
  description: string
  events: Event[]
  relations: HappensBefore[]
  guaranteed: boolean
}

const scenarios: Scenario[] = [
  {
    name: 'Channel Send/Receive',
    description: 'ch <- x happens-before <-ch завершается',
    events: [
      { id: 'g1-write', goroutine: 1, time: 1, label: 'x = 42', type: 'write' },
      { id: 'g1-send', goroutine: 1, time: 2, label: 'ch <- x', type: 'send' },
      { id: 'g2-recv', goroutine: 2, time: 3, label: 'y := <-ch', type: 'receive' },
      { id: 'g2-read', goroutine: 2, time: 4, label: 'print(x)', type: 'read' },
    ],
    relations: [
      { from: 'g1-write', to: 'g1-send', type: 'program-order' },
      { from: 'g1-send', to: 'g2-recv', type: 'channel' },
      { from: 'g2-recv', to: 'g2-read', type: 'program-order' },
    ],
    guaranteed: true
  },
  {
    name: 'Unbuffered Channel',
    description: 'Receive завершается до Send возвращается',
    events: [
      { id: 'g1-prep', goroutine: 1, time: 1, label: 'data = "ready"', type: 'write' },
      { id: 'g1-send', goroutine: 1, time: 2, label: 'ch <- 1', type: 'send' },
      { id: 'g2-recv', goroutine: 2, time: 2, label: '<-ch', type: 'receive' },
      { id: 'g2-use', goroutine: 2, time: 3, label: 'use(data)', type: 'read' },
    ],
    relations: [
      { from: 'g1-prep', to: 'g1-send', type: 'program-order' },
      { from: 'g2-recv', to: 'g1-send', type: 'channel' },
      { from: 'g2-recv', to: 'g2-use', type: 'program-order' },
    ],
    guaranteed: true
  },
  {
    name: 'Mutex Lock/Unlock',
    description: 'Unlock(m) happens-before следующий Lock(m)',
    events: [
      { id: 'g1-lock', goroutine: 1, time: 1, label: 'mu.Lock()', type: 'lock' },
      { id: 'g1-write', goroutine: 1, time: 2, label: 'counter++', type: 'write' },
      { id: 'g1-unlock', goroutine: 1, time: 3, label: 'mu.Unlock()', type: 'unlock' },
      { id: 'g2-lock', goroutine: 2, time: 4, label: 'mu.Lock()', type: 'lock' },
      { id: 'g2-read', goroutine: 2, time: 5, label: 'print(counter)', type: 'read' },
      { id: 'g2-unlock', goroutine: 2, time: 6, label: 'mu.Unlock()', type: 'unlock' },
    ],
    relations: [
      { from: 'g1-lock', to: 'g1-write', type: 'program-order' },
      { from: 'g1-write', to: 'g1-unlock', type: 'program-order' },
      { from: 'g1-unlock', to: 'g2-lock', type: 'mutex' },
      { from: 'g2-lock', to: 'g2-read', type: 'program-order' },
      { from: 'g2-read', to: 'g2-unlock', type: 'program-order' },
    ],
    guaranteed: true
  },
  {
    name: 'sync.Once',
    description: 'f() в once.Do(f) happens-before once.Do возвращается',
    events: [
      { id: 'g1-call', goroutine: 1, time: 1, label: 'once.Do(init)', type: 'call' },
      { id: 'g1-init', goroutine: 1, time: 2, label: 'resource = new()', type: 'write' },
      { id: 'g1-return', goroutine: 1, time: 3, label: 'return', type: 'return' },
      { id: 'g2-call', goroutine: 2, time: 4, label: 'once.Do(init)', type: 'call' },
      { id: 'g2-use', goroutine: 2, time: 5, label: 'use(resource)', type: 'read' },
    ],
    relations: [
      { from: 'g1-call', to: 'g1-init', type: 'program-order' },
      { from: 'g1-init', to: 'g1-return', type: 'program-order' },
      { from: 'g1-return', to: 'g2-call', type: 'once' },
      { from: 'g2-call', to: 'g2-use', type: 'program-order' },
    ],
    guaranteed: true
  },
  {
    name: 'Data Race (NO guarantee)',
    description: 'Без синхронизации нет happens-before!',
    events: [
      { id: 'g1-write', goroutine: 1, time: 1, label: 'x = 1', type: 'write' },
      { id: 'g2-read', goroutine: 2, time: 1, label: 'print(x)', type: 'read' },
    ],
    relations: [],
    guaranteed: false
  },
]

const currentScenarioIndex = ref(0)
const showRelations = ref(true)
const animating = ref(false)
const highlightedRelation = ref<number | null>(null)

const currentScenario = computed(() => scenarios[currentScenarioIndex.value])

const goroutines = computed(() => {
  const events = currentScenario.value.events
  const gIds = [...new Set(events.map(e => e.goroutine))].sort()
  return gIds.map(id => ({
    id,
    events: events.filter(e => e.goroutine === id)
  }))
})

const maxTime = computed(() => {
  return Math.max(...currentScenario.value.events.map(e => e.time))
})

// Компактные размеры
const PADDING_LEFT = 50
const PADDING_TOP = 30
const TIME_STEP = 90
const GOROUTINE_HEIGHT = 50

function getEventPosition(eventId: string): { x: number, y: number } | null {
  const event = currentScenario.value.events.find(e => e.id === eventId)
  if (!event) return null

  const goroutineIndex = goroutines.value.findIndex(g => g.id === event.goroutine)
  const x = PADDING_LEFT + (event.time - 1) * TIME_STEP
  const y = PADDING_TOP + goroutineIndex * GOROUTINE_HEIGHT

  return { x, y }
}

const svgWidth = computed(() => PADDING_LEFT + maxTime.value * TIME_STEP + 30)
const svgHeight = computed(() => PADDING_TOP + goroutines.value.length * GOROUTINE_HEIGHT + 20)

function getRelationColor(type: HappensBefore['type']): string {
  switch (type) {
    case 'channel': return '#60a5fa'
    case 'mutex': return '#a78bfa'
    case 'once': return '#fbbf24'
    case 'goroutine': return '#4ade80'
    case 'program-order': return '#808080'
    default: return '#808080'
  }
}

function getEventColor(type: Event['type']): string {
  switch (type) {
    case 'write': return '#f87171'
    case 'read': return '#4ade80'
    case 'send': return '#60a5fa'
    case 'receive': return '#60a5fa'
    case 'lock': return '#a78bfa'
    case 'unlock': return '#a78bfa'
    case 'call': return '#fbbf24'
    case 'return': return '#fbbf24'
    default: return '#808080'
  }
}

function nextScenario() {
  currentScenarioIndex.value = (currentScenarioIndex.value + 1) % scenarios.length
  highlightedRelation.value = null
}

function prevScenario() {
  currentScenarioIndex.value = (currentScenarioIndex.value - 1 + scenarios.length) % scenarios.length
  highlightedRelation.value = null
}

function calculatePath(from: { x: number, y: number }, to: { x: number, y: number }): string {
  if (from.y === to.y) {
    // Same goroutine - straight line
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  } else {
    // Different goroutines - curved line
    const midX = (from.x + to.x) / 2
    const controlOffset = Math.abs(to.y - from.y) * 0.3
    return `M ${from.x} ${from.y} Q ${midX} ${from.y + (to.y > from.y ? controlOffset : -controlOffset)} ${to.x} ${to.y}`
  }
}
</script>

<template>
  <div class="happens-before-viz">
    <div class="viz-header">
      <h3>Happens-Before Relationships</h3>
      <div class="controls">
        <button class="btn btn-nav" @click="prevScenario">←</button>
        <span class="scenario-name">{{ currentScenario.name }}</span>
        <button class="btn btn-nav" @click="nextScenario">→</button>
      </div>
    </div>

    <div class="scenario-description" :class="{ warning: !currentScenario.guaranteed }">
      <span v-if="currentScenario.guaranteed">✅</span>
      <span v-else>⚠️</span>
      {{ currentScenario.description }}
    </div>

    <div class="viz-container">
      <svg class="timeline-svg" :width="svgWidth" :height="svgHeight" :viewBox="`0 0 ${svgWidth} ${svgHeight}`">
        <!-- Goroutine lanes -->
        <g v-for="(g, idx) in goroutines" :key="g.id">
          <text :x="15" :y="PADDING_TOP + idx * GOROUTINE_HEIGHT + 4" class="goroutine-label">G{{ g.id }}</text>
          <line
            :x1="40"
            :y1="PADDING_TOP + idx * GOROUTINE_HEIGHT"
            :x2="PADDING_LEFT + maxTime * TIME_STEP"
            :y2="PADDING_TOP + idx * GOROUTINE_HEIGHT"
            class="timeline-line"
          />
        </g>

        <!-- Happens-before relations -->
        <g v-if="showRelations">
          <g
            v-for="(rel, idx) in currentScenario.relations"
            :key="`rel-${idx}`"
            class="relation"
            :class="{ highlighted: highlightedRelation === idx }"
            @mouseenter="highlightedRelation = idx"
            @mouseleave="highlightedRelation = null"
          >
            <defs>
              <marker
                :id="`arrow-${idx}`"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path
                  d="M0,0 L0,6 L6,3 z"
                  :fill="getRelationColor(rel.type)"
                />
              </marker>
            </defs>
            <path
              v-if="getEventPosition(rel.from) && getEventPosition(rel.to)"
              :d="calculatePath(getEventPosition(rel.from)!, getEventPosition(rel.to)!)"
              fill="none"
              :stroke="getRelationColor(rel.type)"
              :stroke-width="highlightedRelation === idx ? 2 : 1.5"
              :stroke-dasharray="rel.type === 'program-order' ? '3,3' : 'none'"
              :marker-end="`url(#arrow-${idx})`"
              class="relation-path"
            />
          </g>
        </g>

        <!-- Events -->
        <g v-for="event in currentScenario.events" :key="event.id">
          <circle
            :cx="PADDING_LEFT + (event.time - 1) * TIME_STEP"
            :cy="PADDING_TOP + goroutines.findIndex(g => g.id === event.goroutine) * GOROUTINE_HEIGHT"
            r="6"
            :fill="getEventColor(event.type)"
            class="event-circle"
          />
          <text
            :x="PADDING_LEFT + (event.time - 1) * TIME_STEP"
            :y="PADDING_TOP + goroutines.findIndex(g => g.id === event.goroutine) * GOROUTINE_HEIGHT + 18"
            class="event-label"
          >
            {{ event.label }}
          </text>
        </g>
      </svg>
    </div>

    <!-- Legend -->
    <div class="legend">
      <div class="legend-section">
        <div class="legend-title">Event Types</div>
        <div class="legend-items">
          <div class="legend-item">
            <span class="legend-dot" style="background: #f87171"></span>
            <span>Write</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot" style="background: #4ade80"></span>
            <span>Read</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot" style="background: #60a5fa"></span>
            <span>Send/Receive</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot" style="background: #a78bfa"></span>
            <span>Lock/Unlock</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot" style="background: #fbbf24"></span>
            <span>Call/Return</span>
          </div>
        </div>
      </div>

      <div class="legend-section">
        <div class="legend-title">Relations</div>
        <div class="legend-items">
          <div class="legend-item">
            <span class="legend-line" style="background: #60a5fa"></span>
            <span>Channel</span>
          </div>
          <div class="legend-item">
            <span class="legend-line" style="background: #a78bfa"></span>
            <span>Mutex</span>
          </div>
          <div class="legend-item">
            <span class="legend-line" style="background: #fbbf24"></span>
            <span>Once</span>
          </div>
          <div class="legend-item">
            <span class="legend-line dashed" style="background: #808080"></span>
            <span>Program Order</span>
          </div>
        </div>
      </div>
    </div>

    <div class="toggle-container">
      <label class="toggle">
        <input type="checkbox" v-model="showRelations" />
        <span class="toggle-label">Show happens-before arrows</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.happens-before-viz {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.viz-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.viz-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  transition: all 0.2s ease;
}

.btn-nav {
  background: #3a3a5e;
  color: #e0e0e0;
  border: 1px solid #4a4a7e;
  padding: 6px 12px;
}

.btn-nav:hover {
  background: #4a4a7e;
}

.scenario-name {
  font-size: 14px;
  color: #60a5fa;
  min-width: 180px;
  text-align: center;
}

.scenario-description {
  background: #252545;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 16px;
  border-left: 3px solid #4ade80;
}

.scenario-description.warning {
  border-left-color: #f87171;
  background: #2d1f1f;
}

.viz-container {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  margin-bottom: 16px;
  display: flex;
  justify-content: center;
}

.timeline-svg {
  max-width: 100%;
  height: auto;
}

.goroutine-label {
  fill: #a0a0a0;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
}

.timeline-line {
  stroke: #3a3a5e;
  stroke-width: 2;
}

.event-circle {
  transition: all 0.2s ease;
  cursor: pointer;
}

.event-circle:hover {
  r: 10;
}

.event-label {
  fill: #a0a0a0;
  font-size: 10px;
  text-anchor: middle;
  font-family: 'JetBrains Mono', monospace;
}

.relation-path {
  transition: all 0.2s ease;
}

.relation.highlighted .relation-path {
  filter: drop-shadow(0 0 4px currentColor);
}

.legend {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  padding: 16px;
  background: #252545;
  border-radius: 6px;
  margin-bottom: 16px;
}

.legend-section {
  flex: 1;
  min-width: 200px;
}

.legend-title {
  font-size: 11px;
  color: #808080;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-line {
  width: 20px;
  height: 3px;
  border-radius: 2px;
}

.legend-line.dashed {
  background: linear-gradient(90deg, #808080 50%, transparent 50%);
  background-size: 6px 100%;
}

.toggle-container {
  display: flex;
  justify-content: flex-end;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
}

.toggle input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.toggle-label {
  color: #a0a0a0;
}

@media (max-width: 768px) {
  .viz-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .legend {
    flex-direction: column;
    gap: 16px;
  }
}
</style>
