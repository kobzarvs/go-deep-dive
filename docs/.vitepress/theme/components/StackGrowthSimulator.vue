<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface StackFrame {
  id: number
  name: string
  size: number
  depth: number
}

const step = ref(0)
const isPlaying = ref(false)
const playInterval = ref<number | null>(null)

// Состояния симуляции
const states = [
  {
    phase: 'init',
    title: 'Начальное состояние',
    description: 'Горутина создана с начальным стеком 2KB',
    stackSize: 2048,
    usedSize: 128,
    frames: [
      { id: 1, name: 'main()', size: 128, depth: 0 }
    ],
    stackLo: '0xc000030000',
    stackHi: '0xc000030800',
    event: null
  },
  {
    phase: 'call1',
    title: 'Вызов factorial(5)',
    description: 'Добавляется первый фрейм рекурсии',
    stackSize: 2048,
    usedSize: 256,
    frames: [
      { id: 1, name: 'main()', size: 128, depth: 0 },
      { id: 2, name: 'factorial(5)', size: 128, depth: 1 }
    ],
    stackLo: '0xc000030000',
    stackHi: '0xc000030800',
    event: 'push'
  },
  {
    phase: 'call2',
    title: 'Рекурсия углубляется',
    description: 'factorial(4), factorial(3)...',
    stackSize: 2048,
    usedSize: 640,
    frames: [
      { id: 1, name: 'main()', size: 128, depth: 0 },
      { id: 2, name: 'factorial(5)', size: 128, depth: 1 },
      { id: 3, name: 'factorial(4)', size: 128, depth: 2 },
      { id: 4, name: 'factorial(3)', size: 128, depth: 3 },
      { id: 5, name: 'factorial(2)', size: 128, depth: 4 }
    ],
    stackLo: '0xc000030000',
    stackHi: '0xc000030800',
    event: 'push'
  },
  {
    phase: 'near_limit',
    title: 'Приближение к stackguard0',
    description: 'SP приближается к guard zone — скоро проверка',
    stackSize: 2048,
    usedSize: 1600,
    frames: [
      { id: 1, name: 'main()', size: 128, depth: 0 },
      { id: 2, name: 'factorial(5)', size: 128, depth: 1 },
      { id: 3, name: 'factorial(4)', size: 128, depth: 2 },
      { id: 4, name: 'factorial(3)', size: 128, depth: 3 },
      { id: 5, name: 'factorial(2)', size: 128, depth: 4 },
      { id: 6, name: 'factorial(1)', size: 128, depth: 5 },
      { id: 7, name: 'deepCall()', size: 256, depth: 6 },
      { id: 8, name: 'process()', size: 256, depth: 7 },
      { id: 9, name: 'helper()', size: 256, depth: 8 },
    ],
    stackLo: '0xc000030000',
    stackHi: '0xc000030800',
    event: 'warning'
  },
  {
    phase: 'overflow_check',
    title: 'Проверка в прологе функции',
    description: 'SP < stackguard0 — срабатывает runtime.morestack',
    stackSize: 2048,
    usedSize: 1856,
    frames: [
      { id: 1, name: 'main()', size: 128, depth: 0 },
      { id: 2, name: 'factorial(5)', size: 128, depth: 1 },
      { id: 3, name: 'factorial(4)', size: 128, depth: 2 },
      { id: 4, name: 'factorial(3)', size: 128, depth: 3 },
      { id: 5, name: 'factorial(2)', size: 128, depth: 4 },
      { id: 6, name: 'factorial(1)', size: 128, depth: 5 },
      { id: 7, name: 'deepCall()', size: 256, depth: 6 },
      { id: 8, name: 'process()', size: 256, depth: 7 },
      { id: 9, name: 'helper()', size: 256, depth: 8 },
      { id: 10, name: 'compute()', size: 192, depth: 9 },
    ],
    stackLo: '0xc000030000',
    stackHi: '0xc000030800',
    event: 'overflow'
  },
  {
    phase: 'copying',
    title: 'Копирование стека',
    description: 'Выделяется новый стек 4KB, данные копируются',
    stackSize: 4096,
    usedSize: 1856,
    frames: [
      { id: 1, name: 'main()', size: 128, depth: 0 },
      { id: 2, name: 'factorial(5)', size: 128, depth: 1 },
      { id: 3, name: 'factorial(4)', size: 128, depth: 2 },
      { id: 4, name: 'factorial(3)', size: 128, depth: 3 },
      { id: 5, name: 'factorial(2)', size: 128, depth: 4 },
      { id: 6, name: 'factorial(1)', size: 128, depth: 5 },
      { id: 7, name: 'deepCall()', size: 256, depth: 6 },
      { id: 8, name: 'process()', size: 256, depth: 7 },
      { id: 9, name: 'helper()', size: 256, depth: 8 },
      { id: 10, name: 'compute()', size: 192, depth: 9 },
    ],
    stackLo: '0xc000040000',
    stackHi: '0xc000041000',
    event: 'copy'
  },
  {
    phase: 'adjusted',
    title: 'Указатели скорректированы',
    description: 'Все указатели на стек обновлены на новые адреса',
    stackSize: 4096,
    usedSize: 1856,
    frames: [
      { id: 1, name: 'main()', size: 128, depth: 0 },
      { id: 2, name: 'factorial(5)', size: 128, depth: 1 },
      { id: 3, name: 'factorial(4)', size: 128, depth: 2 },
      { id: 4, name: 'factorial(3)', size: 128, depth: 3 },
      { id: 5, name: 'factorial(2)', size: 128, depth: 4 },
      { id: 6, name: 'factorial(1)', size: 128, depth: 5 },
      { id: 7, name: 'deepCall()', size: 256, depth: 6 },
      { id: 8, name: 'process()', size: 256, depth: 7 },
      { id: 9, name: 'helper()', size: 256, depth: 8 },
      { id: 10, name: 'compute()', size: 192, depth: 9 },
    ],
    stackLo: '0xc000040000',
    stackHi: '0xc000041000',
    event: 'success'
  },
  {
    phase: 'continue',
    title: 'Выполнение продолжается',
    description: 'Новый вызов успешно размещён, стек имеет запас',
    stackSize: 4096,
    usedSize: 2112,
    frames: [
      { id: 1, name: 'main()', size: 128, depth: 0 },
      { id: 2, name: 'factorial(5)', size: 128, depth: 1 },
      { id: 3, name: 'factorial(4)', size: 128, depth: 2 },
      { id: 4, name: 'factorial(3)', size: 128, depth: 3 },
      { id: 5, name: 'factorial(2)', size: 128, depth: 4 },
      { id: 6, name: 'factorial(1)', size: 128, depth: 5 },
      { id: 7, name: 'deepCall()', size: 256, depth: 6 },
      { id: 8, name: 'process()', size: 256, depth: 7 },
      { id: 9, name: 'helper()', size: 256, depth: 8 },
      { id: 10, name: 'compute()', size: 192, depth: 9 },
      { id: 11, name: 'finalize()', size: 256, depth: 10 },
    ],
    stackLo: '0xc000040000',
    stackHi: '0xc000041000',
    event: null
  }
]

const currentState = computed(() => states[step.value])
const maxSteps = computed(() => states.length)

const usagePercent = computed(() => {
  const state = currentState.value
  return Math.round((state.usedSize / state.stackSize) * 100)
})

const guardZoneStart = computed(() => {
  // Guard zone обычно ~928 bytes от начала
  return Math.round((928 / currentState.value.stackSize) * 100)
})

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
  }, 1500)
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

function formatSize(bytes: number): string {
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`
  }
  return `${bytes}B`
}
</script>

<template>
  <div class="stack-simulator">
    <!-- Header с контролами -->
    <div class="sim-header">
      <h3>Stack Growth Simulator</h3>
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

    <!-- Прогресс бар -->
    <div class="progress-bar">
      <div
        v-for="(_, idx) in states"
        :key="idx"
        :class="['progress-dot', { active: idx === step, done: idx < step }]"
        @click="step = idx; stopAutoPlay()"
      />
    </div>

    <!-- Текущее состояние -->
    <div class="state-info">
      <div class="state-title">{{ currentState.title }}</div>
      <div class="state-desc">{{ currentState.description }}</div>
    </div>

    <!-- Событие -->
    <Transition name="event">
      <div v-if="currentState.event" :class="['event-badge', currentState.event]">
        <span v-if="currentState.event === 'push'">Push Frame</span>
        <span v-else-if="currentState.event === 'warning'">Near stackguard0</span>
        <span v-else-if="currentState.event === 'overflow'">Stack Overflow Check</span>
        <span v-else-if="currentState.event === 'copy'">Copying to new stack</span>
        <span v-else-if="currentState.event === 'success'">Pointers adjusted</span>
      </div>
    </Transition>

    <div class="sim-content">
      <!-- Визуализация стека -->
      <div class="stack-visual">
        <div class="stack-info">
          <div class="info-row">
            <span class="info-label">stack.lo:</span>
            <span class="info-value addr">{{ currentState.stackLo }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">stack.hi:</span>
            <span class="info-value addr">{{ currentState.stackHi }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Размер:</span>
            <span class="info-value">{{ formatSize(currentState.stackSize) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Использовано:</span>
            <span class="info-value">{{ formatSize(currentState.usedSize) }} ({{ usagePercent }}%)</span>
          </div>
        </div>

        <div class="stack-bar-container">
          <div class="stack-bar" :class="{ growing: currentState.event === 'copy' }">
            <!-- Guard zone -->
            <div
              class="guard-zone"
              :style="{ height: guardZoneStart + '%' }"
            >
              <span class="guard-label">Guard</span>
            </div>

            <!-- Используемая память -->
            <div
              class="used-memory"
              :style="{ height: usagePercent + '%' }"
              :class="{
                warning: usagePercent > 70,
                danger: usagePercent > 85
              }"
            >
              <!-- Stack frames -->
              <TransitionGroup name="frame" tag="div" class="frames-container">
                <div
                  v-for="frame in currentState.frames"
                  :key="frame.id"
                  class="frame-block"
                  :style="{
                    height: (frame.size / currentState.usedSize * 100) + '%',
                    opacity: 0.6 + (frame.depth * 0.04)
                  }"
                >
                  <span class="frame-name">{{ frame.name }}</span>
                </div>
              </TransitionGroup>
            </div>

            <!-- Свободное место -->
            <div class="free-space" :style="{ height: (100 - usagePercent) + '%' }">
              <span v-if="100 - usagePercent > 20" class="free-label">Free</span>
            </div>
          </div>

          <!-- Маркеры -->
          <div class="markers">
            <div class="marker hi">hi ↑</div>
            <div class="marker sp" :style="{ bottom: usagePercent + '%' }">← SP</div>
            <div class="marker guard" :style="{ bottom: guardZoneStart + '%' }">← guard</div>
            <div class="marker lo">lo ↓</div>
          </div>
        </div>
      </div>

      <!-- Код пролога -->
      <div class="prologue-code">
        <div class="code-header">Пролог каждой функции:</div>
        <pre class="code-block"><code>TEXT ·myFunc(SB), NOSPLIT, $0
    <span :class="{ highlight: currentState.phase === 'overflow_check' }">MOVQ  (TLS), CX        // g в CX</span>
    <span :class="{ highlight: currentState.phase === 'overflow_check' }">CMPQ  SP, 16(CX)       // SP vs stackguard0</span>
    <span :class="{ highlight: currentState.phase === 'overflow_check' }">JLS   morestack        // если меньше — рост</span>
    // ... тело функции ...</code></pre>
        <div v-if="currentState.phase === 'copying'" class="code-note">
          runtime.morestack → runtime.newstack → copystack
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stack-simulator {
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
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  margin-bottom: 16px;
  transition: all 0.3s ease;
}

.event-badge.push {
  background: #1a3a1a;
  border: 1px solid #2a5a2a;
  color: #4ade80;
}

.event-badge.warning {
  background: #3a3a1a;
  border: 1px solid #5a5a2a;
  color: #fbbf24;
}

.event-badge.overflow {
  background: #3a1a1a;
  border: 1px solid #5a2a2a;
  color: #f87171;
}

.event-badge.copy {
  background: #1a2a3a;
  border: 1px solid #2a4a5a;
  color: #60a5fa;
  animation: pulse 1s ease-in-out infinite;
}

.event-badge.success {
  background: #1a3a1a;
  border: 1px solid #2a5a2a;
  color: #4ade80;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

/* Content layout */
.sim-content {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
}

@media (max-width: 700px) {
  .sim-content {
    grid-template-columns: 1fr;
  }
}

/* Stack visual */
.stack-visual {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stack-info {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 4px;
  padding: 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 4px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  color: #808080;
}

.info-value {
  color: #e0e0e0;
}

.info-value.addr {
  color: #fbbf24;
}

/* Stack bar */
.stack-bar-container {
  display: flex;
  gap: 8px;
  height: 280px;
}

.stack-bar {
  flex: 1;
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 4px;
  display: flex;
  flex-direction: column-reverse;
  position: relative;
  overflow: hidden;
  transition: all 0.5s ease;
}

.stack-bar.growing {
  animation: glow 1s ease-in-out;
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0); }
  50% { box-shadow: 0 0 20px 4px rgba(96, 165, 250, 0.3); }
}

.guard-zone {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(248, 113, 113, 0.1);
  border-top: 1px dashed #f87171;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 4px;
}

.guard-label {
  font-size: 9px;
  color: #f87171;
}

.used-memory {
  background: linear-gradient(to top, #4ecdc4, #2a9d8f);
  transition: all 0.5s ease;
  position: relative;
  display: flex;
  flex-direction: column-reverse;
}

.used-memory.warning {
  background: linear-gradient(to top, #fbbf24, #d97706);
}

.used-memory.danger {
  background: linear-gradient(to top, #f87171, #dc2626);
}

.frames-container {
  display: flex;
  flex-direction: column-reverse;
  height: 100%;
}

.frame-block {
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 16px;
  transition: all 0.3s ease;
}

.frame-name {
  font-size: 9px;
  color: rgba(0, 0, 0, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 4px;
}

.free-space {
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.5s ease;
}

.free-label {
  font-size: 10px;
  color: #404060;
}

/* Markers */
.markers {
  width: 50px;
  position: relative;
  font-size: 9px;
}

.marker {
  position: absolute;
  right: 0;
  white-space: nowrap;
  transition: all 0.3s ease;
}

.marker.hi {
  top: 0;
  color: #4ade80;
}

.marker.lo {
  bottom: 0;
  color: #60a5fa;
}

.marker.sp {
  color: #fbbf24;
}

.marker.guard {
  color: #f87171;
}

/* Prologue code */
.prologue-code {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  overflow: hidden;
}

.code-header {
  background: #252545;
  padding: 10px 16px;
  font-size: 12px;
  color: #a0a0a0;
}

.code-block {
  margin: 0;
  padding: 16px;
  font-size: 11px;
  line-height: 1.2;
  overflow-x: auto;
}

.code-block code {
  color: #e0e0e0;
}

.code-block .highlight {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.code-note {
  padding: 12px 16px;
  background: #1a2a3a;
  border-top: 1px solid #2a4a5a;
  font-size: 11px;
  color: #60a5fa;
}

/* Controls */
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

.frame-enter-active,
.frame-leave-active {
  transition: all 0.3s ease;
}

.frame-enter-from {
  opacity: 0;
  transform: scaleY(0);
}

.frame-leave-to {
  opacity: 0;
}
</style>
