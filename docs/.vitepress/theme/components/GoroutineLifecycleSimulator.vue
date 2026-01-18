<script setup lang="ts">
import { ref, computed } from 'vue'

interface GoroutineState {
  name: string
  code: number
  description: string
  color: string
}

const states: GoroutineState[] = [
  { name: '_Gidle', code: 0, description: 'G создана, но не инициализирована', color: '#808080' },
  { name: '_Grunnable', code: 1, description: 'В очереди, готова к выполнению', color: '#60a5fa' },
  { name: '_Grunning', code: 2, description: 'Выполняется на M', color: '#4ade80' },
  { name: '_Gsyscall', code: 3, description: 'Выполняет системный вызов', color: '#fbbf24' },
  { name: '_Gwaiting', code: 4, description: 'Заблокирована (channel, mutex...)', color: '#f87171' },
  { name: '_Gdead', code: 6, description: 'Завершена или не используется', color: '#6b7280' },
  { name: '_Gcopystack', code: 8, description: 'Стек копируется (stack growth)', color: '#a78bfa' },
  { name: '_Gpreempted', code: 9, description: 'Preempted, ждёт reschedule', color: '#fb923c' },
]

interface Transition {
  from: string
  to: string
  trigger: string
  func: string
}

const transitions: Transition[] = [
  { from: '_Gidle', to: '_Gdead', trigger: 'malg()', func: 'runtime.malg' },
  { from: '_Gdead', to: '_Grunnable', trigger: 'newproc()', func: 'runtime.newproc' },
  { from: '_Grunnable', to: '_Grunning', trigger: 'Scheduler выбрал', func: 'runtime.execute' },
  { from: '_Grunning', to: '_Gwaiting', trigger: 'Блокировка', func: 'runtime.gopark' },
  { from: '_Gwaiting', to: '_Grunnable', trigger: 'Разблокировка', func: 'runtime.goready' },
  { from: '_Grunning', to: '_Gsyscall', trigger: 'Syscall', func: 'runtime.entersyscall' },
  { from: '_Gsyscall', to: '_Grunnable', trigger: 'Syscall done', func: 'runtime.exitsyscall' },
  { from: '_Grunning', to: '_Gdead', trigger: 'Завершение', func: 'runtime.goexit' },
  { from: '_Grunning', to: '_Gcopystack', trigger: 'Stack overflow', func: 'runtime.copystack' },
  { from: '_Gcopystack', to: '_Grunning', trigger: 'Stack copied', func: 'runtime.copystack' },
  { from: '_Grunning', to: '_Gpreempted', trigger: 'Async preempt', func: 'asyncPreempt' },
  { from: '_Gpreempted', to: '_Grunnable', trigger: 'Reschedule', func: 'schedule' },
  { from: '_Grunning', to: '_Grunnable', trigger: 'Gosched()', func: 'runtime.Gosched' },
]

const currentState = ref('_Gdead')
const history = ref<string[]>(['_Gdead'])
const isAnimating = ref(false)

const currentStateInfo = computed(() => {
  return states.find(s => s.name === currentState.value) || states[0]
})

const availableTransitions = computed(() => {
  return transitions.filter(t => t.from === currentState.value)
})

function getStateColor(stateName: string): string {
  const state = states.find(s => s.name === stateName)
  return state?.color || '#808080'
}

async function transition(t: Transition) {
  if (isAnimating.value) return
  isAnimating.value = true

  await new Promise(resolve => setTimeout(resolve, 300))
  currentState.value = t.to
  history.value.push(t.to)
  if (history.value.length > 10) {
    history.value.shift()
  }

  isAnimating.value = false
}

function reset() {
  currentState.value = '_Gdead'
  history.value = ['_Gdead']
}

function runDemo() {
  const sequence = [
    transitions.find(t => t.from === '_Gdead' && t.to === '_Grunnable'),
    transitions.find(t => t.from === '_Grunnable' && t.to === '_Grunning'),
    transitions.find(t => t.from === '_Grunning' && t.to === '_Gwaiting'),
    transitions.find(t => t.from === '_Gwaiting' && t.to === '_Grunnable'),
    transitions.find(t => t.from === '_Grunnable' && t.to === '_Grunning'),
    transitions.find(t => t.from === '_Grunning' && t.to === '_Gdead'),
  ].filter(Boolean) as Transition[]

  let i = 0
  const interval = setInterval(() => {
    if (i >= sequence.length) {
      clearInterval(interval)
      return
    }
    transition(sequence[i])
    i++
  }, 800)
}
</script>

<template>
  <div class="lifecycle-simulator">
    <div class="simulator-header">
      <h3>Goroutine Lifecycle Simulator</h3>
      <div class="controls">
        <button class="btn btn-demo" @click="runDemo">Demo</button>
        <button class="btn btn-reset" @click="reset">Reset</button>
      </div>
    </div>

    <div class="main-content">
      <!-- Current State -->
      <div class="current-state-panel">
        <div class="state-label">Current State</div>
        <div
          class="current-state"
          :style="{ borderColor: currentStateInfo.color, boxShadow: `0 0 20px ${currentStateInfo.color}40` }"
        >
          <div class="state-code">{{ currentStateInfo.code }}</div>
          <div class="state-name" :style="{ color: currentStateInfo.color }">
            {{ currentStateInfo.name }}
          </div>
          <div class="state-desc">{{ currentStateInfo.description }}</div>
        </div>
      </div>

      <!-- Available Transitions -->
      <div class="transitions-panel">
        <div class="panel-label">Available Transitions</div>
        <div class="transitions-list">
          <button
            v-for="t in availableTransitions"
            :key="`${t.from}-${t.to}-${t.trigger}`"
            class="transition-btn"
            :disabled="isAnimating"
            @click="transition(t)"
          >
            <span class="transition-trigger">{{ t.trigger }}</span>
            <span class="transition-arrow">→</span>
            <span class="transition-to" :style="{ color: getStateColor(t.to) }">{{ t.to }}</span>
            <span class="transition-func">{{ t.func }}</span>
          </button>
          <div v-if="availableTransitions.length === 0" class="no-transitions">
            No transitions available from this state
          </div>
        </div>
      </div>
    </div>

    <!-- History -->
    <div class="history-panel">
      <div class="panel-label">Transition History</div>
      <div class="history-flow">
        <template v-for="(state, idx) in history" :key="idx">
          <div
            class="history-state"
            :style="{ backgroundColor: getStateColor(state) }"
          >
            {{ state.replace('_G', '') }}
          </div>
          <div v-if="idx < history.length - 1" class="history-arrow">→</div>
        </template>
      </div>
    </div>

    <!-- State Legend -->
    <div class="legend">
      <div class="legend-title">All States</div>
      <div class="legend-grid">
        <div
          v-for="state in states"
          :key="state.name"
          class="legend-item"
          :class="{ active: state.name === currentState }"
        >
          <div class="legend-color" :style="{ backgroundColor: state.color }"></div>
          <span class="legend-name">{{ state.name }}</span>
          <span class="legend-code">({{ state.code }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lifecycle-simulator {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.simulator-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.simulator-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.controls {
  display: flex;
  gap: 8px;
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

.btn-demo {
  background: #4ade80;
  color: #0a0a0a;
}

.btn-demo:hover {
  background: #22c55e;
}

.btn-reset {
  background: #3a3a5e;
  color: #e0e0e0;
  border: 1px solid #4a4a7e;
}

.btn-reset:hover {
  background: #4a4a7e;
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.current-state-panel,
.transitions-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.state-label,
.panel-label {
  font-size: 11px;
  color: #808080;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.current-state {
  border: 2px solid;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  transition: all 0.3s ease;
}

.state-code {
  font-size: 36px;
  font-weight: bold;
  opacity: 0.3;
}

.state-name {
  font-size: 20px;
  font-weight: 600;
  margin: 8px 0;
}

.state-desc {
  font-size: 12px;
  color: #a0a0a0;
}

.transitions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.transition-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  transition: all 0.2s ease;
}

.transition-btn:hover:not(:disabled) {
  background: #2a2a4e;
  border-color: #4a4a7e;
}

.transition-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.transition-trigger {
  color: #60a5fa;
  flex: 1;
}

.transition-arrow {
  color: #606080;
}

.transition-to {
  font-weight: 600;
}

.transition-func {
  font-size: 10px;
  color: #606080;
  margin-left: auto;
}

.no-transitions {
  color: #606080;
  font-size: 12px;
  text-align: center;
  padding: 20px;
}

.history-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
}

.history-flow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.history-state {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  color: #0a0a0a;
}

.history-arrow {
  color: #606080;
  font-size: 12px;
}

.legend {
  border-top: 1px solid #2a2a4e;
  padding-top: 16px;
}

.legend-title {
  font-size: 11px;
  color: #808080;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.legend-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.legend-item.active {
  background: #2a2a4e;
}

.legend-color {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.legend-name {
  color: #e0e0e0;
}

.legend-code {
  color: #606080;
}

@media (max-width: 768px) {
  .main-content {
    grid-template-columns: 1fr;
  }

  .legend-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
