<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

interface Operation {
  goroutine: number
  type: 'read' | 'write'
  value: number
  timestamp: number
}

const sharedValue = ref(0)
const isRunning = ref(false)
const mode = ref<'race' | 'mutex'>('race')
const operations = reactive<Operation[]>([])
const finalResults = ref<number[]>([])
const runCount = ref(0)

// Состояние двух горутин
const goroutine1 = reactive({
  localValue: 0,
  status: 'idle' as 'idle' | 'reading' | 'incrementing' | 'writing' | 'done',
  step: 0
})

const goroutine2 = reactive({
  localValue: 0,
  status: 'idle' as 'idle' | 'reading' | 'incrementing' | 'writing' | 'done' | 'waiting',
  step: 0
})

const mutexHolder = ref<number | null>(null)

function reset() {
  sharedValue.value = 0
  operations.length = 0
  goroutine1.localValue = 0
  goroutine1.status = 'idle'
  goroutine1.step = 0
  goroutine2.localValue = 0
  goroutine2.status = 'idle'
  goroutine2.step = 0
  mutexHolder.value = null
}

function addOperation(goroutine: number, type: 'read' | 'write', value: number) {
  operations.push({
    goroutine,
    type,
    value,
    timestamp: Date.now()
  })
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runWithRace() {
  reset()
  isRunning.value = true
  runCount.value++

  // Goroutine 1: read -> increment -> write
  const g1 = async () => {
    goroutine1.status = 'reading'
    await delay(300)
    goroutine1.localValue = sharedValue.value
    addOperation(1, 'read', goroutine1.localValue)
    goroutine1.step = 1

    await delay(400) // Симуляция работы
    goroutine1.status = 'incrementing'
    goroutine1.localValue++
    goroutine1.step = 2

    await delay(500) // Долгая операция - тут G2 может вклиниться
    goroutine1.status = 'writing'
    sharedValue.value = goroutine1.localValue
    addOperation(1, 'write', goroutine1.localValue)
    goroutine1.step = 3

    await delay(200)
    goroutine1.status = 'done'
  }

  // Goroutine 2: read -> increment -> write (начинает с задержкой)
  const g2 = async () => {
    await delay(200) // Небольшая начальная задержка
    goroutine2.status = 'reading'
    await delay(300)
    goroutine2.localValue = sharedValue.value
    addOperation(2, 'read', goroutine2.localValue)
    goroutine2.step = 1

    await delay(300)
    goroutine2.status = 'incrementing'
    goroutine2.localValue++
    goroutine2.step = 2

    await delay(300)
    goroutine2.status = 'writing'
    sharedValue.value = goroutine2.localValue
    addOperation(2, 'write', goroutine2.localValue)
    goroutine2.step = 3

    await delay(200)
    goroutine2.status = 'done'
  }

  await Promise.all([g1(), g2()])

  finalResults.value.push(sharedValue.value)
  if (finalResults.value.length > 10) {
    finalResults.value.shift()
  }

  isRunning.value = false
}

async function runWithMutex() {
  reset()
  isRunning.value = true
  runCount.value++

  const lock = async (goroutineId: number) => {
    while (mutexHolder.value !== null) {
      await delay(50)
    }
    mutexHolder.value = goroutineId
  }

  const unlock = () => {
    mutexHolder.value = null
  }

  // Goroutine 1: lock -> read -> increment -> write -> unlock
  const g1 = async () => {
    goroutine1.status = 'waiting'
    await lock(1)

    goroutine1.status = 'reading'
    await delay(300)
    goroutine1.localValue = sharedValue.value
    addOperation(1, 'read', goroutine1.localValue)
    goroutine1.step = 1

    await delay(300)
    goroutine1.status = 'incrementing'
    goroutine1.localValue++
    goroutine1.step = 2

    await delay(300)
    goroutine1.status = 'writing'
    sharedValue.value = goroutine1.localValue
    addOperation(1, 'write', goroutine1.localValue)
    goroutine1.step = 3

    await delay(200)
    unlock()
    goroutine1.status = 'done'
  }

  // Goroutine 2: lock -> read -> increment -> write -> unlock
  const g2 = async () => {
    await delay(100) // Небольшая задержка
    goroutine2.status = 'waiting'
    await lock(2)

    goroutine2.status = 'reading'
    await delay(300)
    goroutine2.localValue = sharedValue.value
    addOperation(2, 'read', goroutine2.localValue)
    goroutine2.step = 1

    await delay(300)
    goroutine2.status = 'incrementing'
    goroutine2.localValue++
    goroutine2.step = 2

    await delay(300)
    goroutine2.status = 'writing'
    sharedValue.value = goroutine2.localValue
    addOperation(2, 'write', goroutine2.localValue)
    goroutine2.step = 3

    await delay(200)
    unlock()
    goroutine2.status = 'done'
  }

  await Promise.all([g1(), g2()])

  finalResults.value.push(sharedValue.value)
  if (finalResults.value.length > 10) {
    finalResults.value.shift()
  }

  isRunning.value = false
}

function run() {
  if (mode.value === 'race') {
    runWithRace()
  } else {
    runWithMutex()
  }
}

const statusColor = (status: string) => {
  switch (status) {
    case 'reading': return '#60a5fa'
    case 'incrementing': return '#fbbf24'
    case 'writing': return '#f87171'
    case 'waiting': return '#a78bfa'
    case 'done': return '#4ade80'
    default: return '#808080'
  }
}

const hasRaceCondition = computed(() => {
  // Проверяем: были ли оба read до обоих write?
  const g1Read = operations.findIndex(o => o.goroutine === 1 && o.type === 'read')
  const g1Write = operations.findIndex(o => o.goroutine === 1 && o.type === 'write')
  const g2Read = operations.findIndex(o => o.goroutine === 2 && o.type === 'read')
  const g2Write = operations.findIndex(o => o.goroutine === 2 && o.type === 'write')

  if (g1Read === -1 || g2Read === -1) return false

  // Race если G2 прочитал до того как G1 записал
  return g2Read < g1Write
})
</script>

<template>
  <div class="race-demo">
    <div class="demo-header">
      <h3>Data Race Демонстрация</h3>
      <div class="controls">
        <div class="mode-selector">
          <button
            class="mode-btn"
            :class="{ active: mode === 'race' }"
            @click="mode = 'race'"
            :disabled="isRunning"
          >
            With Race 💥
          </button>
          <button
            class="mode-btn"
            :class="{ active: mode === 'mutex' }"
            @click="mode = 'mutex'"
            :disabled="isRunning"
          >
            With Mutex 🔒
          </button>
        </div>
        <button class="btn btn-run" @click="run" :disabled="isRunning">
          {{ isRunning ? 'Running...' : 'Run' }}
        </button>
      </div>
    </div>

    <div class="main-content">
      <!-- Shared Variable -->
      <div class="shared-panel">
        <div class="panel-label">Shared Variable</div>
        <div class="shared-value" :class="{ racing: mode === 'race' && hasRaceCondition && operations.length > 0 }">
          counter = {{ sharedValue }}
        </div>
        <div v-if="mutexHolder" class="mutex-status">
          🔒 Mutex held by G{{ mutexHolder }}
        </div>
      </div>

      <!-- Goroutines Grid -->
      <div class="goroutines-grid">
        <!-- Goroutine 1 -->
        <div class="goroutine-panel">
          <div class="goroutine-header">
            <span class="goroutine-name">Goroutine 1</span>
            <span class="goroutine-status" :style="{ color: statusColor(goroutine1.status) }">
              {{ goroutine1.status }}
            </span>
          </div>
          <div class="goroutine-code">
            <div class="code-line" :class="{ active: goroutine1.step === 1 }">
              <span class="line-num">1</span>
              <span>local := counter</span>
              <span v-if="goroutine1.step >= 1" class="value-hint">// = {{ goroutine1.localValue - (goroutine1.step > 1 ? 1 : 0) }}</span>
            </div>
            <div class="code-line" :class="{ active: goroutine1.step === 2 }">
              <span class="line-num">2</span>
              <span>local++</span>
              <span v-if="goroutine1.step >= 2" class="value-hint">// = {{ goroutine1.localValue }}</span>
            </div>
            <div class="code-line" :class="{ active: goroutine1.step === 3 }">
              <span class="line-num">3</span>
              <span>counter = local</span>
            </div>
          </div>
        </div>

        <!-- Goroutine 2 -->
        <div class="goroutine-panel">
          <div class="goroutine-header">
            <span class="goroutine-name">Goroutine 2</span>
            <span class="goroutine-status" :style="{ color: statusColor(goroutine2.status) }">
              {{ goroutine2.status }}
            </span>
          </div>
          <div class="goroutine-code">
            <div class="code-line" :class="{ active: goroutine2.step === 1 }">
              <span class="line-num">1</span>
              <span>local := counter</span>
              <span v-if="goroutine2.step >= 1" class="value-hint">// = {{ goroutine2.localValue - (goroutine2.step > 1 ? 1 : 0) }}</span>
            </div>
            <div class="code-line" :class="{ active: goroutine2.step === 2 }">
              <span class="line-num">2</span>
              <span>local++</span>
              <span v-if="goroutine2.step >= 2" class="value-hint">// = {{ goroutine2.localValue }}</span>
            </div>
            <div class="code-line" :class="{ active: goroutine2.step === 3 }">
              <span class="line-num">3</span>
              <span>counter = local</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="timeline-panel">
      <div class="panel-label">Operations Timeline</div>
      <div class="timeline">
        <div
          v-for="(op, idx) in operations"
          :key="idx"
          class="timeline-op"
          :class="[`g${op.goroutine}`, op.type]"
        >
          <span class="op-goroutine">G{{ op.goroutine }}</span>
          <span class="op-type">{{ op.type === 'read' ? 'READ' : 'WRITE' }}</span>
          <span class="op-value">{{ op.value }}</span>
        </div>
        <div v-if="operations.length === 0" class="no-ops">
          Click Run to start
        </div>
      </div>
    </div>

    <!-- Results -->
    <div v-if="finalResults.length > 0" class="results-panel">
      <div class="panel-label">Results History (expected: 2)</div>
      <div class="results-list">
        <span
          v-for="(result, idx) in finalResults"
          :key="idx"
          class="result-item"
          :class="{ correct: result === 2, wrong: result !== 2 }"
        >
          {{ result }}
        </span>
      </div>
      <div class="results-summary">
        <span v-if="mode === 'race'">
          Race detected: {{ finalResults.filter(r => r !== 2).length }} / {{ finalResults.length }} runs lost updates!
        </span>
        <span v-else>
          All {{ finalResults.length }} runs correct with mutex protection.
        </span>
      </div>
    </div>

    <!-- Explanation -->
    <div class="explanation">
      <div v-if="mode === 'race'" class="race-explanation">
        <strong>⚠️ Data Race:</strong> Обе горутины читают counter=0, затем обе инкрементируют
        локальную копию до 1 и записывают. Результат: 1 вместо 2. Lost update!
      </div>
      <div v-else class="mutex-explanation">
        <strong>✅ With Mutex:</strong> Только одна горутина может работать с counter.
        G1 завершает read-increment-write до того, как G2 начнёт. Результат: всегда 2.
      </div>
    </div>
  </div>
</template>

<style scoped>
.race-demo {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.demo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.demo-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.mode-selector {
  display: flex;
  gap: 4px;
}

.mode-btn {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #3a3a5e;
  background: #252545;
  color: #a0a0a0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s ease;
}

.mode-btn.active {
  background: #3a3a5e;
  color: #ffffff;
  border-color: #4a4a7e;
}

.mode-btn:hover:not(:disabled) {
  background: #3a3a5e;
}

.mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn {
  padding: 8px 20px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s ease;
}

.btn-run {
  background: #4ade80;
  color: #0a0a0a;
  font-weight: 600;
}

.btn-run:hover:not(:disabled) {
  background: #22c55e;
}

.btn-run:disabled {
  background: #3a3a5e;
  color: #808080;
  cursor: not-allowed;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.shared-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  text-align: center;
}

.panel-label {
  font-size: 11px;
  color: #808080;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.shared-value {
  font-size: 24px;
  font-weight: bold;
  color: #4ade80;
  padding: 12px;
  border-radius: 6px;
  background: #1a1a2e;
  display: inline-block;
}

.shared-value.racing {
  color: #f87171;
  animation: pulse 0.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.mutex-status {
  margin-top: 8px;
  font-size: 12px;
  color: #a78bfa;
}

.goroutines-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.goroutine-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.goroutine-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.goroutine-name {
  font-weight: 600;
  color: #ffffff;
}

.goroutine-status {
  font-size: 11px;
  text-transform: uppercase;
}

.goroutine-code {
  font-size: 13px;
}

.code-line {
  display: flex;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.code-line.active {
  background: #3a3a5e;
}

.line-num {
  color: #606080;
  min-width: 16px;
}

.value-hint {
  color: #60a5fa;
  margin-left: auto;
  font-size: 11px;
}

.timeline-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

.timeline {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 40px;
  align-items: center;
}

.timeline-op {
  display: flex;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 11px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.timeline-op.g1 {
  background: #1e3a5f;
  border: 1px solid #60a5fa;
}

.timeline-op.g2 {
  background: #3d1f1f;
  border: 1px solid #f87171;
}

.op-goroutine {
  font-weight: 600;
}

.timeline-op.g1 .op-goroutine { color: #60a5fa; }
.timeline-op.g2 .op-goroutine { color: #f87171; }

.op-type {
  color: #a0a0a0;
}

.timeline-op.read .op-type { color: #4ade80; }
.timeline-op.write .op-type { color: #fbbf24; }

.op-value {
  color: #ffffff;
  font-weight: 600;
}

.no-ops {
  color: #606080;
  font-size: 12px;
}

.results-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

.results-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.result-item {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-weight: bold;
  font-size: 16px;
}

.result-item.correct {
  background: #1e3d1e;
  color: #4ade80;
  border: 1px solid #4ade80;
}

.result-item.wrong {
  background: #3d1f1f;
  color: #f87171;
  border: 1px solid #f87171;
}

.results-summary {
  font-size: 12px;
  color: #a0a0a0;
}

.explanation {
  padding: 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.race-explanation {
  background: #3d1f1f;
  border: 1px solid #f87171;
  color: #fca5a5;
}

.mutex-explanation {
  background: #1e3d1e;
  border: 1px solid #4ade80;
  color: #86efac;
}

@media (max-width: 768px) {
  .goroutines-grid {
    grid-template-columns: 1fr;
  }

  .controls {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
