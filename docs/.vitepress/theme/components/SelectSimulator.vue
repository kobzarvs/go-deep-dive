<script setup lang="ts">
import { ref, computed } from 'vue'

interface Channel {
  id: number
  name: string
  ready: boolean
  value: number | null
}

interface SelectCase {
  id: number
  type: 'recv' | 'send' | 'default'
  channelId: number | null
  selected: boolean
  order: number
}

const channels = ref<Channel[]>([
  { id: 1, name: 'ch1', ready: false, value: null },
  { id: 2, name: 'ch2', ready: false, value: null },
  { id: 3, name: 'ch3', ready: false, value: null },
])

const cases = ref<SelectCase[]>([
  { id: 1, type: 'recv', channelId: 1, selected: false, order: 0 },
  { id: 2, type: 'recv', channelId: 2, selected: false, order: 0 },
  { id: 3, type: 'recv', channelId: 3, selected: false, order: 0 },
  { id: 4, type: 'default', channelId: null, selected: false, order: 0 },
])

const step = ref(0)
const pollOrder = ref<number[]>([])
const isRunning = ref(false)
const hasDefault = computed(() => cases.value.some(c => c.type === 'default'))

const steps = [
  { name: 'Начало', desc: 'selectgo() вызван, подготовка scases' },
  { name: 'Shuffle', desc: 'Генерация случайного порядка опроса (pollorder)' },
  { name: 'Lock', desc: 'Блокировка каналов в порядке адресов (lockorder)' },
  { name: 'Poll', desc: 'Проверка готовности каналов в pollorder' },
  { name: 'Результат', desc: 'Выбор готового case или default' },
]

function makeReady(channelId: number) {
  const ch = channels.value.find(c => c.id === channelId)
  if (ch) {
    ch.ready = true
    ch.value = Math.floor(Math.random() * 100)
  }
}

function runSelect() {
  if (isRunning.value) return
  isRunning.value = true
  step.value = 0

  // Reset
  cases.value.forEach(c => {
    c.selected = false
    c.order = 0
  })

  // Step through
  const interval = setInterval(() => {
    step.value++

    if (step.value === 2) {
      // Generate poll order (shuffle)
      const recvCases = cases.value.filter(c => c.type !== 'default')
      const shuffled = [...recvCases].sort(() => Math.random() - 0.5)
      pollOrder.value = shuffled.map(c => c.id)
      shuffled.forEach((c, idx) => {
        const original = cases.value.find(oc => oc.id === c.id)
        if (original) original.order = idx + 1
      })
    }

    if (step.value === 4) {
      // Poll channels
      let foundReady = false
      for (const caseId of pollOrder.value) {
        const c = cases.value.find(sc => sc.id === caseId)
        if (c && c.channelId) {
          const ch = channels.value.find(ch => ch.id === c.channelId)
          if (ch?.ready) {
            c.selected = true
            foundReady = true
            break
          }
        }
      }

      if (!foundReady && hasDefault.value) {
        const defaultCase = cases.value.find(c => c.type === 'default')
        if (defaultCase) defaultCase.selected = true
      }
    }

    if (step.value >= 5) {
      clearInterval(interval)
      isRunning.value = false
    }
  }, 800)
}

function reset() {
  step.value = 0
  pollOrder.value = []
  isRunning.value = false
  channels.value.forEach(ch => {
    ch.ready = false
    ch.value = null
  })
  cases.value.forEach(c => {
    c.selected = false
    c.order = 0
  })
}

function toggleDefault() {
  const defaultCase = cases.value.find(c => c.type === 'default')
  if (defaultCase) {
    cases.value = cases.value.filter(c => c.type !== 'default')
  } else {
    cases.value.push({ id: 4, type: 'default', channelId: null, selected: false, order: 0 })
  }
}
</script>

<template>
  <div class="select-viz">
    <div class="viz-header">
      <h3>Select Statement Simulator</h3>
      <div class="controls">
        <button class="btn btn-run" @click="runSelect" :disabled="isRunning">Run selectgo()</button>
        <button class="btn btn-default" @click="toggleDefault">
          {{ hasDefault ? 'Remove default' : 'Add default' }}
        </button>
        <button class="btn btn-reset" @click="reset">Reset</button>
      </div>
    </div>

    <!-- Steps progress -->
    <div class="steps-bar">
      <div
        v-for="(s, idx) in steps"
        :key="idx"
        class="step-item"
        :class="{ active: idx === step, completed: idx < step }"
      >
        <div class="step-num">{{ idx + 1 }}</div>
        <div class="step-name">{{ s.name }}</div>
      </div>
    </div>

    <div class="current-step" v-if="step < steps.length">
      <div class="step-desc">{{ steps[step].desc }}</div>
    </div>

    <div class="main-content">
      <!-- Channels -->
      <div class="channels-panel">
        <div class="panel-title">Channels</div>
        <div class="channels-list">
          <div
            v-for="ch in channels"
            :key="ch.id"
            class="channel-item"
            :class="{ ready: ch.ready }"
          >
            <div class="channel-name">{{ ch.name }}</div>
            <div class="channel-status">
              {{ ch.ready ? `Ready (${ch.value})` : 'Blocked' }}
            </div>
            <button
              class="btn btn-sm btn-make-ready"
              @click="makeReady(ch.id)"
              :disabled="ch.ready || isRunning"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      <!-- Select cases -->
      <div class="cases-panel">
        <div class="panel-title">Select Cases (scase[])</div>
        <div class="cases-list">
          <div
            v-for="c in cases"
            :key="c.id"
            class="case-item"
            :class="{ selected: c.selected, 'is-default': c.type === 'default' }"
          >
            <div class="case-info">
              <span class="case-type">{{ c.type }}</span>
              <span v-if="c.channelId" class="case-channel">
                {{ channels.find(ch => ch.id === c.channelId)?.name }}
              </span>
            </div>
            <div v-if="c.order > 0" class="case-order">
              poll: {{ c.order }}
            </div>
            <div v-if="c.selected" class="case-selected">SELECTED</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Poll order visualization -->
    <div class="pollorder-panel" v-if="pollOrder.length > 0">
      <div class="panel-title">Poll Order (random shuffle)</div>
      <div class="pollorder-list">
        <template v-for="(caseId, idx) in pollOrder" :key="idx">
          <div class="pollorder-item">
            {{ channels.find(ch => ch.id === cases.find(c => c.id === caseId)?.channelId)?.name }}
          </div>
          <span v-if="idx < pollOrder.length - 1" class="pollorder-arrow">→</span>
        </template>
      </div>
    </div>

    <!-- Explanation -->
    <div class="explanation">
      <div class="exp-title">selectgo() algorithm:</div>
      <ol class="exp-list">
        <li :class="{ highlight: step === 1 }">Создать массив scases со всеми case</li>
        <li :class="{ highlight: step === 2 }">Сгенерировать случайный pollorder (для fairness)</li>
        <li :class="{ highlight: step === 3 }">Заблокировать все каналы в порядке адресов</li>
        <li :class="{ highlight: step === 4 }">Проверить готовность в pollorder, выбрать первый готовый</li>
        <li :class="{ highlight: step === 4 }">Если ни один не готов и есть default — выбрать default</li>
        <li>Разблокировать каналы и вернуть выбранный case</li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.select-viz {
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

.btn-run {
  background: #4ade80;
  color: #0a0a0a;
}

.btn-default {
  background: #a78bfa;
  color: #0a0a0a;
}

.btn-reset {
  background: #3a3a5e;
  color: #e0e0e0;
  border: 1px solid #4a4a7e;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 10px;
}

.btn-make-ready {
  background: #60a5fa;
  color: #0a0a0a;
}

.steps-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.step-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  background: #252545;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.step-item.active {
  background: #3a3a6e;
  border: 1px solid #60a5fa;
}

.step-item.completed {
  background: #2a3a2a;
}

.step-num {
  font-size: 14px;
  font-weight: 600;
  color: #606080;
}

.step-item.active .step-num {
  color: #60a5fa;
}

.step-item.completed .step-num {
  color: #4ade80;
}

.step-name {
  font-size: 10px;
  color: #808080;
  margin-top: 4px;
}

.current-step {
  text-align: center;
  margin-bottom: 20px;
}

.step-desc {
  font-size: 12px;
  color: #60a5fa;
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.channels-panel,
.cases-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.panel-title {
  font-size: 11px;
  color: #808080;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.channels-list,
.cases-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.channel-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
}

.channel-item.ready {
  border-color: #4ade80;
  background: #1a2a1a;
}

.channel-name {
  font-weight: 600;
  min-width: 40px;
}

.channel-status {
  flex: 1;
  font-size: 11px;
  color: #808080;
}

.channel-item.ready .channel-status {
  color: #4ade80;
}

.case-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.case-item.selected {
  border-color: #4ade80;
  background: #1a2a1a;
}

.case-item.is-default {
  border-style: dashed;
}

.case-info {
  flex: 1;
  display: flex;
  gap: 8px;
}

.case-type {
  font-size: 11px;
  color: #a78bfa;
  text-transform: uppercase;
}

.case-channel {
  font-weight: 600;
}

.case-order {
  font-size: 10px;
  color: #fbbf24;
  padding: 2px 6px;
  background: #2a2a1a;
  border-radius: 3px;
}

.case-selected {
  font-size: 10px;
  color: #4ade80;
  font-weight: 600;
}

.pollorder-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
}

.pollorder-list {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pollorder-item {
  padding: 4px 12px;
  background: #1a1a2e;
  border: 1px solid #fbbf24;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.pollorder-arrow {
  color: #606080;
}

.explanation {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.exp-title {
  font-size: 12px;
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 12px;
}

.exp-list {
  margin: 0;
  padding-left: 20px;
  font-size: 11px;
  color: #808080;
  line-height: 1.8;
}

.exp-list li.highlight {
  color: #60a5fa;
  font-weight: 600;
}

@media (max-width: 768px) {
  .main-content {
    grid-template-columns: 1fr;
  }

  .steps-bar {
    flex-wrap: wrap;
  }

  .step-item {
    min-width: calc(33% - 4px);
  }
}
</style>
