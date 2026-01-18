<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

interface Goroutine {
  id: number
  name: string
  status: 'idle' | 'running' | 'waiting' | 'blocked'
  holding: string[]
  waitingFor: string | null
  step: number
}

interface Scenario {
  id: string
  name: string
  description: string
  resources: string[]
  goroutines: Goroutine[]
  steps: {
    goroutine: number
    action: 'acquire' | 'release' | 'try-acquire' | 'blocked'
    resource: string
    description: string
  }[]
  deadlockStep: number // Step at which deadlock occurs
}

const scenarios: Scenario[] = [
  {
    id: 'simple-channel',
    name: 'Unbuffered Channel',
    description: 'Одна горутина ждёт отправки, никто не читает',
    resources: ['ch'],
    goroutines: [
      { id: 1, name: 'main', status: 'idle', holding: [], waitingFor: null, step: 0 }
    ],
    steps: [
      { goroutine: 1, action: 'try-acquire', resource: 'ch', description: 'ch <- 1 (блокируется)' },
      { goroutine: 1, action: 'blocked', resource: 'ch', description: 'Deadlock! Никто не читает' }
    ],
    deadlockStep: 1
  },
  {
    id: 'mutex-order',
    name: 'Mutex Ordering',
    description: 'Классический AB-BA deadlock',
    resources: ['mutex_A', 'mutex_B'],
    goroutines: [
      { id: 1, name: 'G1', status: 'idle', holding: [], waitingFor: null, step: 0 },
      { id: 2, name: 'G2', status: 'idle', holding: [], waitingFor: null, step: 0 }
    ],
    steps: [
      { goroutine: 1, action: 'acquire', resource: 'mutex_A', description: 'G1: Lock(A)' },
      { goroutine: 2, action: 'acquire', resource: 'mutex_B', description: 'G2: Lock(B)' },
      { goroutine: 1, action: 'try-acquire', resource: 'mutex_B', description: 'G1: Lock(B) — ждёт' },
      { goroutine: 2, action: 'try-acquire', resource: 'mutex_A', description: 'G2: Lock(A) — ждёт' },
      { goroutine: 1, action: 'blocked', resource: 'mutex_B', description: 'Deadlock!' },
      { goroutine: 2, action: 'blocked', resource: 'mutex_A', description: 'Deadlock!' }
    ],
    deadlockStep: 4
  },
  {
    id: 'circular-wait',
    name: 'Circular Wait',
    description: 'Три горутины в круговом ожидании',
    resources: ['R1', 'R2', 'R3'],
    goroutines: [
      { id: 1, name: 'G1', status: 'idle', holding: [], waitingFor: null, step: 0 },
      { id: 2, name: 'G2', status: 'idle', holding: [], waitingFor: null, step: 0 },
      { id: 3, name: 'G3', status: 'idle', holding: [], waitingFor: null, step: 0 }
    ],
    steps: [
      { goroutine: 1, action: 'acquire', resource: 'R1', description: 'G1: захватывает R1' },
      { goroutine: 2, action: 'acquire', resource: 'R2', description: 'G2: захватывает R2' },
      { goroutine: 3, action: 'acquire', resource: 'R3', description: 'G3: захватывает R3' },
      { goroutine: 1, action: 'try-acquire', resource: 'R2', description: 'G1: ждёт R2 (у G2)' },
      { goroutine: 2, action: 'try-acquire', resource: 'R3', description: 'G2: ждёт R3 (у G3)' },
      { goroutine: 3, action: 'try-acquire', resource: 'R1', description: 'G3: ждёт R1 (у G1)' },
    ],
    deadlockStep: 5
  },
  {
    id: 'select-all-blocked',
    name: 'Select All Cases Blocked',
    description: 'Select без default, все каналы заблокированы',
    resources: ['ch1', 'ch2'],
    goroutines: [
      { id: 1, name: 'main', status: 'idle', holding: [], waitingFor: null, step: 0 }
    ],
    steps: [
      { goroutine: 1, action: 'try-acquire', resource: 'ch1', description: 'select: case <-ch1' },
      { goroutine: 1, action: 'try-acquire', resource: 'ch2', description: 'select: case <-ch2' },
      { goroutine: 1, action: 'blocked', resource: 'select', description: 'Оба канала пустые, no default' }
    ],
    deadlockStep: 2
  }
]

const currentScenarioIndex = ref(0)
const currentStep = ref(-1)
const isRunning = ref(false)
const isDeadlocked = ref(false)

const currentScenario = computed(() => scenarios[currentScenarioIndex.value])

const goroutineStates = reactive<Map<number, Goroutine>>(new Map())

function resetStates() {
  goroutineStates.clear()
  currentScenario.value.goroutines.forEach(g => {
    goroutineStates.set(g.id, { ...g, holding: [], waitingFor: null, status: 'idle', step: 0 })
  })
  currentStep.value = -1
  isDeadlocked.value = false
}

resetStates()

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runDemo() {
  if (isRunning.value) return

  isRunning.value = true
  resetStates()

  for (let i = 0; i < currentScenario.value.steps.length; i++) {
    currentStep.value = i
    const step = currentScenario.value.steps[i]
    const gState = goroutineStates.get(step.goroutine)

    if (gState) {
      gState.step = i + 1

      if (step.action === 'acquire') {
        gState.status = 'running'
        await delay(400)
        gState.holding.push(step.resource)
        gState.status = 'running'
      } else if (step.action === 'try-acquire') {
        gState.status = 'waiting'
        gState.waitingFor = step.resource
      } else if (step.action === 'blocked') {
        gState.status = 'blocked'
      }
    }

    if (i >= currentScenario.value.deadlockStep) {
      isDeadlocked.value = true
    }

    await delay(800)
  }

  isRunning.value = false
}

function stepForward() {
  if (currentStep.value >= currentScenario.value.steps.length - 1) return

  currentStep.value++
  const step = currentScenario.value.steps[currentStep.value]
  const gState = goroutineStates.get(step.goroutine)

  if (gState) {
    gState.step = currentStep.value + 1

    if (step.action === 'acquire') {
      gState.status = 'running'
      gState.holding.push(step.resource)
    } else if (step.action === 'try-acquire') {
      gState.status = 'waiting'
      gState.waitingFor = step.resource
    } else if (step.action === 'blocked') {
      gState.status = 'blocked'
    }
  }

  if (currentStep.value >= currentScenario.value.deadlockStep) {
    isDeadlocked.value = true
  }
}

function prevScenario() {
  currentScenarioIndex.value = (currentScenarioIndex.value - 1 + scenarios.length) % scenarios.length
  resetStates()
}

function nextScenario() {
  currentScenarioIndex.value = (currentScenarioIndex.value + 1) % scenarios.length
  resetStates()
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running': return '#4ade80'
    case 'waiting': return '#fbbf24'
    case 'blocked': return '#f87171'
    default: return '#808080'
  }
}
</script>

<template>
  <div class="deadlock-demo">
    <div class="demo-header">
      <h3>Deadlock Scenarios</h3>
      <div class="controls">
        <button class="btn btn-nav" @click="prevScenario" :disabled="isRunning">←</button>
        <span class="scenario-name">{{ currentScenario.name }}</span>
        <button class="btn btn-nav" @click="nextScenario" :disabled="isRunning">→</button>
      </div>
    </div>

    <div class="scenario-description" :class="{ deadlocked: isDeadlocked }">
      <span v-if="isDeadlocked">💀</span>
      <span v-else>⚠️</span>
      {{ currentScenario.description }}
    </div>

    <div class="main-content">
      <!-- Goroutines -->
      <div class="goroutines-panel">
        <div class="panel-label">Goroutines</div>
        <div class="goroutines-list">
          <div
            v-for="[id, g] in goroutineStates"
            :key="id"
            class="goroutine-card"
            :class="g.status"
          >
            <div class="g-header">
              <span class="g-name">{{ g.name }}</span>
              <span class="g-status" :style="{ color: getStatusColor(g.status) }">
                {{ g.status }}
              </span>
            </div>
            <div class="g-details">
              <div v-if="g.holding.length > 0" class="g-holding">
                <span class="label">Holding:</span>
                <span class="resources">{{ g.holding.join(', ') }}</span>
              </div>
              <div v-if="g.waitingFor" class="g-waiting">
                <span class="label">Waiting:</span>
                <span class="resource">{{ g.waitingFor }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Resources -->
      <div class="resources-panel">
        <div class="panel-label">Resources</div>
        <div class="resources-grid">
          <div
            v-for="resource in currentScenario.resources"
            :key="resource"
            class="resource-card"
            :class="{
              held: [...goroutineStates.values()].some(g => g.holding.includes(resource)),
              wanted: [...goroutineStates.values()].some(g => g.waitingFor === resource)
            }"
          >
            <div class="resource-name">{{ resource }}</div>
            <div class="resource-owner">
              <template v-if="[...goroutineStates.values()].find(g => g.holding.includes(resource))">
                Held by {{ [...goroutineStates.values()].find(g => g.holding.includes(resource))?.name }}
              </template>
              <template v-else>
                Available
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="timeline-panel">
      <div class="panel-label">Execution Steps</div>
      <div class="timeline">
        <div
          v-for="(step, idx) in currentScenario.steps"
          :key="idx"
          class="timeline-step"
          :class="{
            active: idx === currentStep,
            completed: idx < currentStep,
            deadlock: idx >= currentScenario.deadlockStep && idx <= currentStep
          }"
        >
          <div class="step-number">{{ idx + 1 }}</div>
          <div class="step-content">
            <span class="step-goroutine">{{ currentScenario.goroutines.find(g => g.id === step.goroutine)?.name }}:</span>
            <span class="step-desc">{{ step.description }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="action-controls">
      <button class="btn btn-step" @click="stepForward" :disabled="isRunning || currentStep >= currentScenario.steps.length - 1">
        Step →
      </button>
      <button class="btn btn-run" @click="runDemo" :disabled="isRunning">
        {{ isRunning ? 'Running...' : 'Auto Run' }}
      </button>
      <button class="btn btn-reset" @click="resetStates" :disabled="isRunning">
        Reset
      </button>
    </div>

    <!-- Deadlock Alert -->
    <div v-if="isDeadlocked" class="deadlock-alert">
      <div class="alert-icon">💀</div>
      <div class="alert-content">
        <strong>DEADLOCK DETECTED!</strong>
        <p>Все горутины заблокированы в circular wait. Программа зависла навсегда.</p>
      </div>
    </div>

    <!-- Fix Suggestion -->
    <div class="fix-panel">
      <div class="panel-label">Как избежать</div>
      <div v-if="currentScenario.id === 'simple-channel'" class="fix-content">
        Используйте буферизированный канал <code>make(chan int, 1)</code> или запустите reader в отдельной горутине.
      </div>
      <div v-else-if="currentScenario.id === 'mutex-order'" class="fix-content">
        Всегда захватывайте мьютексы в одинаковом порядке. G1 и G2 должны оба делать <code>Lock(A)</code> → <code>Lock(B)</code>.
      </div>
      <div v-else-if="currentScenario.id === 'circular-wait'" class="fix-content">
        Упорядочьте ресурсы глобально (R1 &lt; R2 &lt; R3) и захватывайте в порядке возрастания.
      </div>
      <div v-else-if="currentScenario.id === 'select-all-blocked'" class="fix-content">
        Добавьте <code>default</code> case или убедитесь что хотя бы один канал активен.
      </div>
    </div>
  </div>
</template>

<style scoped>
.deadlock-demo {
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
  margin-bottom: 16px;
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

.btn-nav {
  background: #3a3a5e;
  color: #e0e0e0;
  border: 1px solid #4a4a7e;
  padding: 6px 12px;
}

.btn-nav:hover:not(:disabled) {
  background: #4a4a7e;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scenario-name {
  font-size: 14px;
  color: #f87171;
  min-width: 160px;
  text-align: center;
}

.scenario-description {
  background: #2d2d1f;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 16px;
  border-left: 3px solid #fbbf24;
}

.scenario-description.deadlocked {
  background: #3d1f1f;
  border-left-color: #f87171;
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.goroutines-panel,
.resources-panel,
.timeline-panel,
.fix-panel {
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

.goroutines-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.goroutine-card {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 6px;
  padding: 12px;
  transition: all 0.3s ease;
}

.goroutine-card.running {
  border-color: #4ade80;
}

.goroutine-card.waiting {
  border-color: #fbbf24;
  animation: pulse-waiting 1s infinite;
}

.goroutine-card.blocked {
  border-color: #f87171;
  background: #2d1f1f;
}

@keyframes pulse-waiting {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.g-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.g-name {
  font-weight: 600;
  color: #ffffff;
}

.g-status {
  font-size: 10px;
  text-transform: uppercase;
}

.g-details {
  font-size: 11px;
}

.g-holding,
.g-waiting {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.label {
  color: #606080;
}

.resources {
  color: #4ade80;
}

.resource {
  color: #fbbf24;
}

.resources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}

.resource-card {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 6px;
  padding: 12px;
  text-align: center;
}

.resource-card.held {
  border-color: #4ade80;
  background: #1e3d1e;
}

.resource-card.wanted {
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.4);
}

.resource-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.resource-owner {
  font-size: 10px;
  color: #808080;
}

.timeline-panel {
  margin-bottom: 16px;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-step {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 4px;
  background: #1a1a2e;
  opacity: 0.5;
  transition: all 0.3s ease;
}

.timeline-step.completed {
  opacity: 0.7;
}

.timeline-step.active {
  opacity: 1;
  background: #2a2a4e;
}

.timeline-step.deadlock {
  background: #3d1f1f;
  border-left: 3px solid #f87171;
}

.step-number {
  width: 24px;
  height: 24px;
  background: #3a3a5e;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
}

.timeline-step.active .step-number {
  background: #60a5fa;
  color: #0a0a0a;
}

.timeline-step.deadlock .step-number {
  background: #f87171;
  color: #0a0a0a;
}

.step-content {
  font-size: 12px;
}

.step-goroutine {
  color: #60a5fa;
  font-weight: 600;
}

.step-desc {
  color: #a0a0a0;
  margin-left: 4px;
}

.action-controls {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.btn-step {
  background: #60a5fa;
  color: #0a0a0a;
  font-weight: 600;
}

.btn-step:hover:not(:disabled) {
  background: #3b82f6;
}

.btn-run {
  background: #4ade80;
  color: #0a0a0a;
  font-weight: 600;
}

.btn-run:hover:not(:disabled) {
  background: #22c55e;
}

.btn-reset {
  background: #3a3a5e;
  color: #e0e0e0;
  border: 1px solid #4a4a7e;
}

.btn-reset:hover:not(:disabled) {
  background: #4a4a7e;
}

.deadlock-alert {
  display: flex;
  gap: 16px;
  align-items: center;
  background: #3d1f1f;
  border: 2px solid #f87171;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

.alert-icon {
  font-size: 32px;
}

.alert-content strong {
  color: #f87171;
  font-size: 14px;
}

.alert-content p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #fca5a5;
}

.fix-content {
  font-size: 13px;
  line-height: 1.6;
  color: #a0a0a0;
}

.fix-content code {
  background: #3a3a5e;
  padding: 2px 6px;
  border-radius: 3px;
  color: #4ade80;
}

@media (max-width: 768px) {
  .main-content {
    grid-template-columns: 1fr;
  }

  .action-controls {
    flex-wrap: wrap;
  }
}
</style>
