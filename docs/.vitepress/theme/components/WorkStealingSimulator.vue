<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface PState {
  id: number
  goroutines: number[]
  status: 'running' | 'idle' | 'stealing' | 'victim'
  highlight: boolean
}

interface SimState {
  phase: string
  title: string
  description: string
  processors: PState[]
  globalQueue: number[]
  event: string | null
  stealArrow: { from: number; to: number } | null
}

const step = ref(0)
const isPlaying = ref(false)
const playInterval = ref<number | null>(null)

// Симуляция work stealing
const states: SimState[] = [
  {
    phase: 'initial',
    title: 'Начальное состояние',
    description: 'P0 перегружен (6 горутин), P2 простаивает без работы',
    processors: [
      { id: 0, goroutines: [101, 102, 103, 104, 105, 106], status: 'running', highlight: false },
      { id: 1, goroutines: [201], status: 'running', highlight: false },
      { id: 2, goroutines: [], status: 'idle', highlight: true },
      { id: 3, goroutines: [301, 302], status: 'running', highlight: false },
    ],
    globalQueue: [501, 502],
    event: null,
    stealArrow: null,
  },
  {
    phase: 'check_local',
    title: 'P2 проверяет свою LRQ',
    description: 'findrunnable(): сначала проверяем локальную очередь — пусто',
    processors: [
      { id: 0, goroutines: [101, 102, 103, 104, 105, 106], status: 'running', highlight: false },
      { id: 1, goroutines: [201], status: 'running', highlight: false },
      { id: 2, goroutines: [], status: 'stealing', highlight: true },
      { id: 3, goroutines: [301, 302], status: 'running', highlight: false },
    ],
    globalQueue: [501, 502],
    event: 'check_local',
    stealArrow: null,
  },
  {
    phase: 'check_global',
    title: 'P2 проверяет Global Run Queue',
    description: 'Каждые 61 тиков scheduler проверяет GRQ (магическое число!)',
    processors: [
      { id: 0, goroutines: [101, 102, 103, 104, 105, 106], status: 'running', highlight: false },
      { id: 1, goroutines: [201], status: 'running', highlight: false },
      { id: 2, goroutines: [], status: 'stealing', highlight: true },
      { id: 3, goroutines: [301, 302], status: 'running', highlight: false },
    ],
    globalQueue: [501, 502],
    event: 'check_global',
    stealArrow: null,
  },
  {
    phase: 'check_netpoll',
    title: 'P2 проверяет Network Poller',
    description: 'netpoll(): проверяем готовые сетевые операции — нет готовых',
    processors: [
      { id: 0, goroutines: [101, 102, 103, 104, 105, 106], status: 'running', highlight: false },
      { id: 1, goroutines: [201], status: 'running', highlight: false },
      { id: 2, goroutines: [], status: 'stealing', highlight: true },
      { id: 3, goroutines: [301, 302], status: 'running', highlight: false },
    ],
    globalQueue: [501, 502],
    event: 'check_netpoll',
    stealArrow: null,
  },
  {
    phase: 'select_victim',
    title: 'P2 выбирает жертву для кражи',
    description: 'Рандомный выбор P для обхода. Выбран P0 (самый загруженный)',
    processors: [
      { id: 0, goroutines: [101, 102, 103, 104, 105, 106], status: 'victim', highlight: true },
      { id: 1, goroutines: [201], status: 'running', highlight: false },
      { id: 2, goroutines: [], status: 'stealing', highlight: true },
      { id: 3, goroutines: [301, 302], status: 'running', highlight: false },
    ],
    globalQueue: [501, 502],
    event: 'select_victim',
    stealArrow: null,
  },
  {
    phase: 'stealing',
    title: 'Work Stealing: крадём 50%',
    description: 'runqsteal(): забираем ровно половину очереди P0 (3 из 6)',
    processors: [
      { id: 0, goroutines: [101, 102, 103, 104, 105, 106], status: 'victim', highlight: true },
      { id: 1, goroutines: [201], status: 'running', highlight: false },
      { id: 2, goroutines: [], status: 'stealing', highlight: true },
      { id: 3, goroutines: [301, 302], status: 'running', highlight: false },
    ],
    globalQueue: [501, 502],
    event: 'stealing',
    stealArrow: { from: 0, to: 2 },
  },
  {
    phase: 'stolen',
    title: 'Горутины украдены',
    description: 'P0: [G101, G102, G103], P2: [G104, G105, G106]',
    processors: [
      { id: 0, goroutines: [101, 102, 103], status: 'running', highlight: false },
      { id: 1, goroutines: [201], status: 'running', highlight: false },
      { id: 2, goroutines: [104, 105, 106], status: 'running', highlight: true },
      { id: 3, goroutines: [301, 302], status: 'running', highlight: false },
    ],
    globalQueue: [501, 502],
    event: 'stolen',
    stealArrow: null,
  },
  {
    phase: 'running',
    title: 'P2 выполняет украденную горутину',
    description: 'G104 запускается на P2. Баланс восстановлен!',
    processors: [
      { id: 0, goroutines: [101, 102, 103], status: 'running', highlight: false },
      { id: 1, goroutines: [201], status: 'running', highlight: false },
      { id: 2, goroutines: [105, 106], status: 'running', highlight: true },
      { id: 3, goroutines: [301, 302], status: 'running', highlight: false },
    ],
    globalQueue: [501, 502],
    event: 'running',
    stealArrow: null,
  },
]

const currentState = computed(() => states[step.value])
const maxSteps = computed(() => states.length)

function nextStep() {
  if (step.value < maxSteps.value - 1) {
    step.value++
  } else {
    stopAutoPlay()
  }
}

function prevStep() {
  if (step.value > 0) {
    step.value--
  }
}

function reset() {
  stopAutoPlay()
  step.value = 0
}

function toggleAutoPlay() {
  if (isPlaying.value) {
    stopAutoPlay()
  } else {
    startAutoPlay()
  }
}

function startAutoPlay() {
  isPlaying.value = true
  playInterval.value = window.setInterval(() => {
    if (step.value < maxSteps.value - 1) {
      step.value++
    } else {
      stopAutoPlay()
    }
  }, 2000)
}

function stopAutoPlay() {
  isPlaying.value = false
  if (playInterval.value) {
    clearInterval(playInterval.value)
    playInterval.value = null
  }
}

onUnmounted(() => {
  stopAutoPlay()
})

function getStatusClass(status: string) {
  return {
    'running': 'status-running',
    'idle': 'status-idle',
    'stealing': 'status-stealing',
    'victim': 'status-victim',
  }[status] || ''
}

function getStatusLabel(status: string) {
  return {
    'running': 'Running',
    'idle': 'Idle',
    'stealing': 'Stealing...',
    'victim': 'Victim',
  }[status] || status
}
</script>

<template>
  <div class="work-stealing-sim">
    <!-- Header -->
    <div class="sim-header">
      <h3>Work Stealing Simulator</h3>
      <div class="header-controls">
        <button class="btn" :disabled="step === 0" @click="prevStep">←</button>
        <button class="btn play" @click="toggleAutoPlay">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button class="btn" :disabled="step === maxSteps - 1" @click="nextStep">→</button>
        <button class="btn reset" @click="reset">⟲</button>
        <div class="step-indicator">{{ step + 1 }}/{{ maxSteps }}</div>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="progress-bar">
      <div
        v-for="(_, idx) in states"
        :key="idx"
        :class="['progress-dot', { active: idx === step, done: idx < step }]"
        @click="step = idx; stopAutoPlay()"
      />
    </div>

    <!-- State info -->
    <div class="state-info">
      <div class="state-title">{{ currentState.title }}</div>
      <div class="state-desc">{{ currentState.description }}</div>
    </div>

    <!-- Event badge -->
    <Transition name="event">
      <div v-if="currentState.event" :class="['event-badge', currentState.event]">
        <span v-if="currentState.event === 'check_local'">🔍 Check LRQ</span>
        <span v-else-if="currentState.event === 'check_global'">🌐 Check GRQ (61 ticks)</span>
        <span v-else-if="currentState.event === 'check_netpoll'">📡 Check Netpoll</span>
        <span v-else-if="currentState.event === 'select_victim'">🎯 Select Victim</span>
        <span v-else-if="currentState.event === 'stealing'">⚡ Stealing 50%</span>
        <span v-else-if="currentState.event === 'stolen'">✅ Stolen!</span>
        <span v-else-if="currentState.event === 'running'">🏃 Running G104</span>
      </div>
    </Transition>

    <!-- Main visualization -->
    <div class="sim-content">
      <!-- Processors -->
      <div class="processors-container">
        <div
          v-for="p in currentState.processors"
          :key="p.id"
          :class="['processor', { highlighted: p.highlight }, getStatusClass(p.status)]"
        >
          <div class="p-header">
            <span class="p-name">P{{ p.id }}</span>
            <span :class="['p-status', getStatusClass(p.status)]">{{ getStatusLabel(p.status) }}</span>
          </div>

          <div class="lrq-container">
            <div class="lrq-label">Local Run Queue</div>
            <div class="lrq-slots">
              <TransitionGroup name="goroutine" tag="div" class="goroutines">
                <div
                  v-for="g in p.goroutines"
                  :key="g"
                  class="goroutine"
                >
                  G{{ g }}
                </div>
              </TransitionGroup>
              <div v-if="p.goroutines.length === 0" class="empty-queue">empty</div>
            </div>
            <div class="lrq-count">{{ p.goroutines.length }}/256</div>
          </div>
        </div>
      </div>

      <!-- Steal arrow -->
      <Transition name="arrow">
        <div v-if="currentState.stealArrow" class="steal-arrow">
          <svg viewBox="0 0 400 60" class="arrow-svg">
            <defs>
              <marker id="steal-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#f87171" />
              </marker>
            </defs>
            <path
              d="M 50 30 Q 200 -20 350 30"
              stroke="#f87171"
              stroke-width="3"
              fill="none"
              marker-end="url(#steal-arrowhead)"
              class="steal-path"
            />
            <text x="200" y="15" fill="#f87171" font-size="12" text-anchor="middle">steal 50%</text>
          </svg>
        </div>
      </Transition>

      <!-- Global Run Queue -->
      <div class="grq-section">
        <div class="grq-label">Global Run Queue</div>
        <div class="grq-container">
          <div v-for="g in currentState.globalQueue" :key="g" class="goroutine grq">
            G{{ g }}
          </div>
          <span v-if="currentState.globalQueue.length === 0" class="empty-queue">empty</span>
        </div>
      </div>
    </div>

    <!-- Algorithm code -->
    <div class="algorithm-panel">
      <div class="algo-header">findrunnable() порядок поиска:</div>
      <div class="algo-steps">
        <div :class="['algo-step', { active: currentState.event === 'check_local' }]">
          <span class="step-num">1</span>
          <span class="step-text">Проверить свою Local Run Queue</span>
        </div>
        <div :class="['algo-step', { active: currentState.event === 'check_global' }]">
          <span class="step-num">2</span>
          <span class="step-text">Проверить Global Run Queue (каждые 61 тиков)</span>
        </div>
        <div :class="['algo-step', { active: currentState.event === 'check_netpoll' }]">
          <span class="step-num">3</span>
          <span class="step-text">Проверить Network Poller</span>
        </div>
        <div :class="['algo-step', { active: currentState.event === 'select_victim' || currentState.event === 'stealing' }]">
          <span class="step-num">4</span>
          <span class="step-text">Work Stealing: украсть 50% у случайного P</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.work-stealing-sim {
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
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 12px;
}

.sim-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-controls .btn {
  padding: 6px 12px;
  font-size: 14px;
  min-width: 36px;
}

.header-controls .btn.play {
  background: #2a5a2a;
  border-color: #3a7a3a;
}

.header-controls .btn.play:hover {
  background: #3a7a3a;
}

.header-controls .btn.reset {
  background: #2a2a4e;
}

.step-indicator {
  background: #4a4a7e;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  margin-left: 8px;
}

.btn {
  padding: 8px 16px;
  background: #3a3a5e;
  border: 1px solid #4a4a7e;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  transition: all 0.2s ease;
}

.btn:hover:not(:disabled) {
  background: #4a4a7e;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Progress bar */
.progress-bar {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #2a2a4e;
}

.progress-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #2a2a4e;
  cursor: pointer;
  transition: all 0.2s ease;
}

.progress-dot:hover {
  background: #4a4a7e;
}

.progress-dot.done {
  background: #4ecdc4;
}

.progress-dot.active {
  background: #fbbf24;
  transform: scale(1.3);
}

/* State info */
.state-info {
  background: #252545;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.state-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 4px;
}

.state-desc {
  font-size: 12px;
  color: #a0a0a0;
}

/* Event badge */
.event-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 12px;
  margin-bottom: 16px;
  transition: all 0.3s ease;
}

.event-badge.check_local,
.event-badge.check_global,
.event-badge.check_netpoll {
  background: #1a2a3a;
  border: 1px solid #2a4a5a;
  color: #60a5fa;
}

.event-badge.select_victim {
  background: #3a3a1a;
  border: 1px solid #5a5a2a;
  color: #fbbf24;
}

.event-badge.stealing {
  background: #3a1a1a;
  border: 1px solid #5a2a2a;
  color: #f87171;
  animation: pulse 0.5s ease-in-out infinite;
}

.event-badge.stolen,
.event-badge.running {
  background: #1a3a1a;
  border: 1px solid #2a5a2a;
  color: #4ade80;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

/* Content */
.sim-content {
  position: relative;
}

/* Processors */
.processors-container {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

@media (max-width: 800px) {
  .processors-container {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 500px) {
  .processors-container {
    grid-template-columns: 1fr;
  }
}

.processor {
  background: #252545;
  border: 2px solid #3a3a5e;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.3s ease;
}

.processor.highlighted {
  border-color: #4ecdc4;
  box-shadow: 0 0 15px rgba(78, 205, 196, 0.3);
}

.processor.status-idle {
  background: #1a1a2e;
  border-style: dashed;
}

.processor.status-stealing {
  background: #2a2a3e;
  border-color: #60a5fa;
  animation: pulse-border 1s ease-in-out infinite;
}

.processor.status-victim {
  background: #3a2a2a;
  border-color: #f87171;
}

@keyframes pulse-border {
  0%, 100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0); }
  50% { box-shadow: 0 0 10px 2px rgba(96, 165, 250, 0.3); }
}

.p-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.p-name {
  font-size: 14px;
  font-weight: 600;
  color: #60a5fa;
}

.p-status {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 3px;
  text-transform: uppercase;
}

.p-status.status-running {
  background: #166534;
  color: #4ade80;
}

.p-status.status-idle {
  background: #374151;
  color: #9ca3af;
}

.p-status.status-stealing {
  background: #1e40af;
  color: #60a5fa;
}

.p-status.status-victim {
  background: #7f1d1d;
  color: #f87171;
}

.lrq-container {
  background: #0d0d1a;
  border-radius: 4px;
  padding: 8px;
}

.lrq-label {
  font-size: 9px;
  color: #606080;
  margin-bottom: 6px;
}

.lrq-slots {
  min-height: 60px;
}

.goroutines {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.goroutine {
  background: #4ade80;
  color: #0a0a0a;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.goroutine.grq {
  background: #fbbf24;
}

.empty-queue {
  color: #606080;
  font-size: 10px;
  font-style: italic;
}

.lrq-count {
  font-size: 9px;
  color: #606080;
  text-align: right;
  margin-top: 6px;
}

/* Steal arrow */
.steal-arrow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  pointer-events: none;
  z-index: 10;
}

.arrow-svg {
  width: 100%;
  height: 60px;
}

.steal-path {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: draw-arrow 0.5s ease forwards;
}

@keyframes draw-arrow {
  to {
    stroke-dashoffset: 0;
  }
}

/* GRQ */
.grq-section {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
  margin-top: 16px;
}

.grq-label {
  font-size: 11px;
  color: #808080;
  margin-bottom: 8px;
}

.grq-container {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* Algorithm panel */
.algorithm-panel {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 16px;
  margin-top: 16px;
}

.algo-header {
  font-size: 12px;
  color: #a0a0a0;
  margin-bottom: 12px;
}

.algo-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.algo-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  background: #1a1a2e;
  transition: all 0.2s ease;
}

.algo-step.active {
  background: #2a3a4a;
  border-left: 3px solid #4ecdc4;
}

.step-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #3a3a5e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
}

.algo-step.active .step-num {
  background: #4ecdc4;
  color: #0a0a0a;
}

.step-text {
  font-size: 11px;
  color: #a0a0a0;
}

.algo-step.active .step-text {
  color: #e0e0e0;
}

/* Transitions */
.event-enter-active,
.event-leave-active {
  transition: all 0.3s ease;
}

.event-enter-from,
.event-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.goroutine-enter-active,
.goroutine-leave-active {
  transition: all 0.3s ease;
}

.goroutine-enter-from {
  opacity: 0;
  transform: scale(0.5);
}

.goroutine-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.arrow-enter-active,
.arrow-leave-active {
  transition: all 0.3s ease;
}

.arrow-enter-from,
.arrow-leave-to {
  opacity: 0;
}
</style>
