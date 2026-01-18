<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

interface Worker {
  id: number
  status: 'idle' | 'working' | 'done'
  progress: number
}

const workerCount = ref(4)
const counter = ref(0)
const isRunning = ref(false)
const isWaiting = ref(false)
const workers = reactive<Worker[]>([])
const logs = reactive<string[]>([])
const mainStatus = ref<'idle' | 'adding' | 'waiting' | 'done'>('idle')

function initWorkers() {
  workers.length = 0
  for (let i = 0; i < workerCount.value; i++) {
    workers.push({
      id: i + 1,
      status: 'idle',
      progress: 0
    })
  }
}

initWorkers()

function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 2
  })
  logs.push(`[${timestamp}] ${message}`)
  if (logs.length > 15) {
    logs.shift()
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runSimulation() {
  if (isRunning.value) return

  // Reset
  isRunning.value = true
  isWaiting.value = false
  counter.value = 0
  logs.length = 0
  mainStatus.value = 'adding'

  initWorkers()

  addLog('main: wg.Add(' + workerCount.value + ')')
  counter.value = workerCount.value

  await delay(500)

  // Start workers
  addLog('main: Starting ' + workerCount.value + ' workers')

  const workerPromises = workers.map(async (worker, idx) => {
    await delay(100 + idx * 50) // Staggered start
    worker.status = 'working'
    addLog(`worker ${worker.id}: Started`)

    // Simulate work with random duration
    const workDuration = 1000 + Math.random() * 2000
    const steps = 20
    const stepDuration = workDuration / steps

    for (let i = 0; i <= steps; i++) {
      await delay(stepDuration)
      worker.progress = (i / steps) * 100
    }

    worker.status = 'done'
    counter.value--
    addLog(`worker ${worker.id}: Done, wg.Done() → counter=${counter.value}`)
  })

  // Main goroutine waits
  await delay(300)
  mainStatus.value = 'waiting'
  isWaiting.value = true
  addLog('main: wg.Wait() - blocking...')

  await Promise.all(workerPromises)

  mainStatus.value = 'done'
  isWaiting.value = false
  addLog('main: All workers done, wg.Wait() returned')

  await delay(500)
  isRunning.value = false
}

function reset() {
  isRunning.value = false
  isWaiting.value = false
  counter.value = 0
  logs.length = 0
  mainStatus.value = 'idle'
  initWorkers()
}

function updateWorkerCount(delta: number) {
  const newCount = workerCount.value + delta
  if (newCount >= 1 && newCount <= 8 && !isRunning.value) {
    workerCount.value = newCount
    initWorkers()
  }
}

const counterColor = computed(() => {
  if (counter.value === 0) return '#4ade80'
  if (isWaiting.value) return '#fbbf24'
  return '#60a5fa'
})
</script>

<template>
  <div class="waitgroup-sim">
    <div class="sim-header">
      <h3>WaitGroup Simulator</h3>
      <div class="controls">
        <div class="worker-count-control">
          <button
            class="btn btn-small"
            @click="updateWorkerCount(-1)"
            :disabled="workerCount <= 1 || isRunning"
          >−</button>
          <span class="worker-count">{{ workerCount }} workers</span>
          <button
            class="btn btn-small"
            @click="updateWorkerCount(1)"
            :disabled="workerCount >= 8 || isRunning"
          >+</button>
        </div>
        <button class="btn btn-run" @click="runSimulation" :disabled="isRunning">
          {{ isRunning ? 'Running...' : 'Run' }}
        </button>
        <button class="btn btn-reset" @click="reset" :disabled="isRunning">
          Reset
        </button>
      </div>
    </div>

    <div class="main-content">
      <!-- WaitGroup Counter -->
      <div class="counter-panel">
        <div class="panel-label">WaitGroup Counter</div>
        <div class="counter-display" :style="{ borderColor: counterColor }">
          <div class="counter-value" :style="{ color: counterColor }">{{ counter }}</div>
          <div class="counter-status">
            <span v-if="counter === 0 && mainStatus !== 'idle'">✅ Zero - unblocked</span>
            <span v-else-if="isWaiting">⏳ Waiting...</span>
            <span v-else-if="counter > 0">🔢 Active workers</span>
            <span v-else>Ready</span>
          </div>
        </div>

        <!-- Main goroutine status -->
        <div class="main-status">
          <div class="status-label">main goroutine</div>
          <div class="status-indicator" :class="mainStatus">
            <span v-if="mainStatus === 'idle'">⚪ Idle</span>
            <span v-else-if="mainStatus === 'adding'">🔵 wg.Add()</span>
            <span v-else-if="mainStatus === 'waiting'">🟡 wg.Wait()</span>
            <span v-else>🟢 Completed</span>
          </div>
        </div>
      </div>

      <!-- Workers -->
      <div class="workers-panel">
        <div class="panel-label">Workers</div>
        <div class="workers-grid">
          <div
            v-for="worker in workers"
            :key="worker.id"
            class="worker-card"
            :class="worker.status"
          >
            <div class="worker-header">
              <span class="worker-id">Worker {{ worker.id }}</span>
              <span class="worker-status-badge" :class="worker.status">
                {{ worker.status }}
              </span>
            </div>
            <div class="worker-progress">
              <div
                class="progress-bar"
                :style="{ width: worker.progress + '%' }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Code Example -->
    <div class="code-panel">
      <div class="panel-label">Code Pattern</div>
      <pre class="code-block"><span class="keyword">var</span> wg sync.WaitGroup

<span class="comment">// Main goroutine</span>
wg.<span class="func">Add</span>({{ workerCount }})  <span class="comment">// counter = {{ workerCount }}</span>

<span class="keyword">for</span> i := <span class="number">0</span>; i &lt; {{ workerCount }}; i++ {
    <span class="keyword">go</span> <span class="keyword">func</span>() {
        <span class="keyword">defer</span> wg.<span class="func">Done</span>()  <span class="comment">// counter--</span>
        <span class="comment">// do work...</span>
    }()
}

wg.<span class="func">Wait</span>()  <span class="comment">// blocks until counter == 0</span>
fmt.<span class="func">Println</span>(<span class="string">"All done!"</span>)</pre>
    </div>

    <!-- Logs -->
    <div class="logs-panel">
      <div class="panel-label">Execution Log</div>
      <div class="logs-container">
        <div v-if="logs.length === 0" class="no-logs">
          Click Run to start simulation
        </div>
        <div
          v-for="(log, idx) in logs"
          :key="idx"
          class="log-entry"
          :class="{
            'log-main': log.includes('main:'),
            'log-worker': log.includes('worker'),
            'log-done': log.includes('Done')
          }"
        >
          {{ log }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.waitgroup-sim {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.sim-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.sim-header h3 {
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

.worker-count-control {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #252545;
  padding: 4px 8px;
  border-radius: 4px;
}

.worker-count {
  font-size: 12px;
  min-width: 80px;
  text-align: center;
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

.btn-small {
  padding: 4px 10px;
  font-size: 14px;
  font-weight: bold;
  background: #3a3a5e;
  color: #e0e0e0;
}

.btn-small:hover:not(:disabled) {
  background: #4a4a7e;
}

.btn-small:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

.btn-reset {
  background: #3a3a5e;
  color: #e0e0e0;
  border: 1px solid #4a4a7e;
}

.btn-reset:hover:not(:disabled) {
  background: #4a4a7e;
}

.btn-reset:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.main-content {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.counter-panel,
.workers-panel,
.code-panel,
.logs-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.panel-label {
  font-size: 11px;
  color: #808080;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.counter-display {
  text-align: center;
  padding: 20px;
  border: 2px solid;
  border-radius: 8px;
  background: #1a1a2e;
  margin-bottom: 16px;
}

.counter-value {
  font-size: 48px;
  font-weight: bold;
  line-height: 1;
}

.counter-status {
  font-size: 12px;
  color: #a0a0a0;
  margin-top: 8px;
}

.main-status {
  text-align: center;
}

.status-label {
  font-size: 10px;
  color: #606080;
  margin-bottom: 4px;
}

.status-indicator {
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  background: #1a1a2e;
}

.status-indicator.waiting {
  background: #3d3d1f;
  color: #fbbf24;
}

.status-indicator.done {
  background: #1e3d1e;
  color: #4ade80;
}

.workers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.worker-card {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 6px;
  padding: 12px;
  transition: all 0.3s ease;
}

.worker-card.working {
  border-color: #60a5fa;
  box-shadow: 0 0 8px rgba(96, 165, 250, 0.2);
}

.worker-card.done {
  border-color: #4ade80;
}

.worker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.worker-id {
  font-size: 12px;
  font-weight: 600;
}

.worker-status-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 3px;
  text-transform: uppercase;
}

.worker-status-badge.idle {
  background: #3a3a5e;
  color: #808080;
}

.worker-status-badge.working {
  background: #1e3a5f;
  color: #60a5fa;
}

.worker-status-badge.done {
  background: #1e3d1e;
  color: #4ade80;
}

.worker-progress {
  height: 4px;
  background: #3a3a5e;
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #60a5fa, #4ade80);
  transition: width 0.1s linear;
}

.code-panel {
  margin-bottom: 16px;
}

.code-block {
  margin: 0;
  padding: 12px;
  background: #1a1a2e;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
}

.keyword { color: #c792ea; }
.func { color: #82aaff; }
.number { color: #f78c6c; }
.string { color: #c3e88d; }
.comment { color: #546e7a; }

.logs-container {
  max-height: 200px;
  overflow-y: auto;
  background: #1a1a2e;
  border-radius: 4px;
  padding: 8px;
}

.no-logs {
  color: #606080;
  font-size: 12px;
  text-align: center;
  padding: 20px;
}

.log-entry {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 2px;
  margin-bottom: 2px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: translateX(0); }
}

.log-main {
  color: #fbbf24;
}

.log-worker {
  color: #60a5fa;
}

.log-done {
  color: #4ade80;
}

@media (max-width: 768px) {
  .main-content {
    grid-template-columns: 1fr;
  }

  .workers-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
