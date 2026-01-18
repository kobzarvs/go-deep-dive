<script setup lang="ts">
import { ref, computed } from 'vue'

interface Goroutine {
  id: number
  state: 'running' | 'waiting' | 'spinning' | 'starving'
  waitTime: number
}

const locked = ref(false)
const woken = ref(false)
const starving = ref(false)
const waiters = ref<Goroutine[]>([])
const owner = ref<number | null>(null)
const nextId = ref(1)
const tick = ref(0)

const starvationThreshold = 5 // ticks

const stateValue = computed(() => {
  let state = 0
  if (locked.value) state |= 1
  if (woken.value) state |= 2
  if (starving.value) state |= 4
  state |= (waiters.value.length << 3)
  return state
})

const stateBinary = computed(() => {
  const waitersCount = waiters.value.length
  const binary = waitersCount.toString(2).padStart(5, '0') +
    (starving.value ? '1' : '0') +
    (woken.value ? '1' : '0') +
    (locked.value ? '1' : '0')
  return binary
})

function lock() {
  const g: Goroutine = {
    id: nextId.value++,
    state: 'running',
    waitTime: 0
  }

  if (!locked.value && waiters.value.length === 0) {
    // Fast path: unlocked, no waiters
    locked.value = true
    owner.value = g.id
    return
  }

  // Need to wait
  if (!starving.value) {
    // Normal mode: spin first
    g.state = 'spinning'
    // After spin, add to waiters
    g.state = 'waiting'
  } else {
    // Starvation mode: go directly to queue
    g.state = 'starving'
  }
  waiters.value.push(g)
}

function unlock() {
  if (!locked.value) {
    alert('unlock of unlocked mutex')
    return
  }

  locked.value = false
  owner.value = null
  woken.value = false

  if (waiters.value.length > 0) {
    if (starving.value) {
      // Starvation mode: hand off directly to first waiter
      const waiter = waiters.value.shift()!
      locked.value = true
      owner.value = waiter.id

      // Check if should exit starvation mode
      if (waiters.value.length === 0 || waiter.waitTime < starvationThreshold) {
        starving.value = false
      }
    } else {
      // Normal mode: wake one waiter
      woken.value = true
      // First waiter competes with new goroutines
      // Simulate by immediately giving lock to waiter
      const waiter = waiters.value.shift()!
      locked.value = true
      owner.value = waiter.id
    }
  }
}

function advanceTime() {
  tick.value++
  for (const w of waiters.value) {
    w.waitTime++
    if (w.waitTime >= starvationThreshold) {
      starving.value = true
      w.state = 'starving'
    }
  }
}

function reset() {
  locked.value = false
  woken.value = false
  starving.value = false
  waiters.value = []
  owner.value = null
  nextId.value = 1
  tick.value = 0
}
</script>

<template>
  <div class="mutex-viz">
    <div class="viz-header">
      <h3>Mutex State Visualizer</h3>
      <div class="controls">
        <button class="btn btn-lock" @click="lock">Lock()</button>
        <button class="btn btn-unlock" @click="unlock" :disabled="!locked">Unlock()</button>
        <button class="btn btn-time" @click="advanceTime">Tick (+1)</button>
        <button class="btn btn-reset" @click="reset">Reset</button>
      </div>
    </div>

    <div class="main-content">
      <!-- State visualization -->
      <div class="state-panel">
        <div class="panel-title">Mutex State (int32)</div>

        <div class="binary-display">
          <div class="binary-section waiters-section">
            <div class="section-label">Waiters (29 bits)</div>
            <div class="binary-bits">
              {{ stateBinary.slice(0, 5) }}...
            </div>
            <div class="section-value">{{ waiters.length }}</div>
          </div>
          <div class="binary-section">
            <div class="section-label">Starving</div>
            <div class="binary-bits" :class="{ active: starving }">{{ starving ? '1' : '0' }}</div>
          </div>
          <div class="binary-section">
            <div class="section-label">Woken</div>
            <div class="binary-bits" :class="{ active: woken }">{{ woken ? '1' : '0' }}</div>
          </div>
          <div class="binary-section">
            <div class="section-label">Locked</div>
            <div class="binary-bits" :class="{ active: locked }">{{ locked ? '1' : '0' }}</div>
          </div>
        </div>

        <div class="state-value">
          state = 0x{{ stateValue.toString(16).toUpperCase().padStart(8, '0') }}
          ({{ stateValue }})
        </div>
      </div>

      <!-- Mode indicator -->
      <div class="mode-panel">
        <div class="panel-title">Current Mode</div>
        <div class="mode-indicator" :class="{ starving: starving }">
          <div class="mode-name">{{ starving ? 'STARVATION MODE' : 'NORMAL MODE' }}</div>
          <div class="mode-desc">
            {{ starving
              ? 'FIFO strictly enforced'
              : 'New goroutines compete with waiters' }}
          </div>
        </div>

        <div class="tick-display">
          Tick: {{ tick }}
          <span class="tick-note">(Starvation after {{ starvationThreshold }} ticks)</span>
        </div>
      </div>
    </div>

    <!-- Visualization -->
    <div class="mutex-visual">
      <div class="mutex-box" :class="{ locked: locked, starving: starving }">
        <div class="mutex-label">Mutex</div>
        <div class="mutex-status">
          {{ locked ? 'LOCKED' : 'UNLOCKED' }}
        </div>
        <div v-if="owner" class="mutex-owner">
          Owner: G{{ owner }}
        </div>
      </div>

      <div class="waiters-queue">
        <div class="queue-label">Wait Queue (semaphore)</div>
        <div class="queue-items">
          <div
            v-for="(w, idx) in waiters"
            :key="w.id"
            class="waiter-item"
            :class="w.state"
          >
            <div class="waiter-id">G{{ w.id }}</div>
            <div class="waiter-state">{{ w.state }}</div>
            <div class="waiter-time">wait: {{ w.waitTime }}</div>
          </div>
          <div v-if="waiters.length === 0" class="queue-empty">
            No waiters
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="legend">
      <div class="legend-item">
        <div class="legend-color normal"></div>
        <span>Normal Mode: Новые горутины спинятся и конкурируют</span>
      </div>
      <div class="legend-item">
        <div class="legend-color starving"></div>
        <span>Starvation Mode: Строгий FIFO после {{ starvationThreshold }}+ ticks ожидания</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mutex-viz {
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
  margin-bottom: 20px;
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
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-lock {
  background: #4ade80;
  color: #0a0a0a;
}

.btn-unlock {
  background: #f87171;
  color: #0a0a0a;
}

.btn-time {
  background: #fbbf24;
  color: #0a0a0a;
}

.btn-reset {
  background: #3a3a5e;
  color: #e0e0e0;
  border: 1px solid #4a4a7e;
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.state-panel,
.mode-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.panel-title {
  font-size: 12px;
  color: #808080;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.binary-display {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.binary-section {
  text-align: center;
}

.waiters-section {
  flex: 1;
}

.section-label {
  font-size: 9px;
  color: #606080;
  margin-bottom: 4px;
}

.binary-bits {
  font-size: 16px;
  font-weight: 600;
  color: #606080;
  padding: 4px 8px;
  background: #1a1a2e;
  border-radius: 4px;
}

.binary-bits.active {
  color: #4ade80;
  background: #1a2a1a;
}

.section-value {
  font-size: 10px;
  color: #808080;
  margin-top: 4px;
}

.state-value {
  font-size: 11px;
  color: #4ecdc4;
  text-align: center;
}

.mode-indicator {
  padding: 16px;
  background: #1a2a1a;
  border: 2px solid #4ade80;
  border-radius: 8px;
  text-align: center;
  margin-bottom: 12px;
}

.mode-indicator.starving {
  background: #2a1a1a;
  border-color: #f87171;
}

.mode-name {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.mode-indicator:not(.starving) .mode-name {
  color: #4ade80;
}

.mode-indicator.starving .mode-name {
  color: #f87171;
}

.mode-desc {
  font-size: 11px;
  color: #808080;
}

.tick-display {
  font-size: 12px;
  color: #808080;
  text-align: center;
}

.tick-note {
  font-size: 10px;
  color: #606080;
}

.mutex-visual {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.mutex-box {
  width: 120px;
  padding: 20px;
  background: #1a2a1a;
  border: 3px solid #4ade80;
  border-radius: 8px;
  text-align: center;
  transition: all 0.2s ease;
}

.mutex-box.locked {
  background: #2a1a1a;
  border-color: #f87171;
}

.mutex-box.starving {
  border-color: #fbbf24;
}

.mutex-label {
  font-size: 11px;
  color: #808080;
  margin-bottom: 8px;
}

.mutex-status {
  font-size: 14px;
  font-weight: 600;
}

.mutex-box:not(.locked) .mutex-status {
  color: #4ade80;
}

.mutex-box.locked .mutex-status {
  color: #f87171;
}

.mutex-owner {
  font-size: 11px;
  color: #808080;
  margin-top: 8px;
}

.waiters-queue {
  flex: 1;
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.queue-label {
  font-size: 11px;
  color: #808080;
  margin-bottom: 12px;
}

.queue-items {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.waiter-item {
  padding: 8px 12px;
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  text-align: center;
}

.waiter-item.waiting {
  border-color: #60a5fa;
}

.waiter-item.spinning {
  border-color: #fbbf24;
}

.waiter-item.starving {
  border-color: #f87171;
  background: #2a1a1a;
}

.waiter-id {
  font-size: 12px;
  font-weight: 600;
}

.waiter-state {
  font-size: 9px;
  color: #808080;
}

.waiter-time {
  font-size: 9px;
  color: #606080;
}

.queue-empty {
  color: #606080;
  font-size: 11px;
  font-style: italic;
}

.legend {
  display: flex;
  gap: 20px;
  padding-top: 16px;
  border-top: 1px solid #2a2a4e;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #808080;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.legend-color.normal {
  background: #4ade80;
}

.legend-color.starving {
  background: #f87171;
}

@media (max-width: 768px) {
  .main-content {
    grid-template-columns: 1fr;
  }

  .mutex-visual {
    flex-direction: column;
  }

  .mutex-box {
    width: 100%;
  }
}
</style>
