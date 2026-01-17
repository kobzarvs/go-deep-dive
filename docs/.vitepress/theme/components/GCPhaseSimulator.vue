<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface HeapObject {
  id: number
  color: 'white' | 'gray' | 'black'
  name: string
}

interface SimState {
  phase: string
  gcState: '_GCoff' | '_GCmark' | '_GCmarktermination' | '_GCsweep'
  title: string
  description: string
  heapObjects: HeapObject[]
  stwActive: boolean
  writeBarrier: boolean
  event: string | null
  codeHighlight: string | null
}

const step = ref(0)
const isPlaying = ref(false)
const playInterval = ref<number | null>(null)

// Симуляция фаз GC цикла
const states: SimState[] = [
  {
    phase: 'gc_off',
    gcState: '_GCoff',
    title: '_GCoff — Нормальное выполнение',
    description: 'GC не активен. Приложение работает. Write barrier выключен. Heap растёт.',
    heapObjects: [
      { id: 1, color: 'white', name: 'A' },
      { id: 2, color: 'white', name: 'B' },
      { id: 3, color: 'white', name: 'C' },
      { id: 4, color: 'white', name: 'D' },
      { id: 5, color: 'white', name: 'E' },
      { id: 6, color: 'white', name: 'F' },
    ],
    stwActive: false,
    writeBarrier: false,
    event: null,
    codeHighlight: 'gcphase = _GCoff',
  },
  {
    phase: 'trigger',
    gcState: '_GCoff',
    title: 'Trigger: heap достиг goal',
    description: 'heapLive >= gcController.trigger. Условие запуска GC выполнено.',
    heapObjects: [
      { id: 1, color: 'white', name: 'A' },
      { id: 2, color: 'white', name: 'B' },
      { id: 3, color: 'white', name: 'C' },
      { id: 4, color: 'white', name: 'D' },
      { id: 5, color: 'white', name: 'E' },
      { id: 6, color: 'white', name: 'F' },
    ],
    stwActive: false,
    writeBarrier: false,
    event: 'trigger',
    codeHighlight: 'if heapLive >= trigger { gcStart() }',
  },
  {
    phase: 'stw_start',
    gcState: '_GCoff',
    title: 'STW: gcStart() — Инициализация',
    description: 'Stop-The-World пауза (~10-50μs). Включаем write barrier, сканируем roots.',
    heapObjects: [
      { id: 1, color: 'gray', name: 'A' }, // root
      { id: 2, color: 'white', name: 'B' },
      { id: 3, color: 'gray', name: 'C' }, // root
      { id: 4, color: 'white', name: 'D' },
      { id: 5, color: 'white', name: 'E' },
      { id: 6, color: 'white', name: 'F' },
    ],
    stwActive: true,
    writeBarrier: true,
    event: 'stw_mark_setup',
    codeHighlight: 'setGCPhase(_GCmark); gcBgMarkStartWorkers()',
  },
  {
    phase: 'mark_start',
    gcState: '_GCmark',
    title: '_GCmark — Concurrent Marking',
    description: 'STW завершён. Mark workers работают параллельно с приложением.',
    heapObjects: [
      { id: 1, color: 'gray', name: 'A' },
      { id: 2, color: 'white', name: 'B' },
      { id: 3, color: 'gray', name: 'C' },
      { id: 4, color: 'white', name: 'D' },
      { id: 5, color: 'white', name: 'E' },
      { id: 6, color: 'white', name: 'F' },
    ],
    stwActive: false,
    writeBarrier: true,
    event: 'mark_start',
    codeHighlight: 'gcphase = _GCmark',
  },
  {
    phase: 'mark_progress_1',
    gcState: '_GCmark',
    title: 'Marking: обработка gray объектов',
    description: 'A сканирован → чёрный. B и D (дети A) → серые.',
    heapObjects: [
      { id: 1, color: 'black', name: 'A' },
      { id: 2, color: 'gray', name: 'B' },
      { id: 3, color: 'gray', name: 'C' },
      { id: 4, color: 'gray', name: 'D' },
      { id: 5, color: 'white', name: 'E' },
      { id: 6, color: 'white', name: 'F' },
    ],
    stwActive: false,
    writeBarrier: true,
    event: 'scanning',
    codeHighlight: 'scanobject(A); greyobject(B); greyobject(D)',
  },
  {
    phase: 'mark_progress_2',
    gcState: '_GCmark',
    title: 'Marking: продолжение',
    description: 'B, C, D сканированы. E (достижим через D) → серый. F недостижим.',
    heapObjects: [
      { id: 1, color: 'black', name: 'A' },
      { id: 2, color: 'black', name: 'B' },
      { id: 3, color: 'black', name: 'C' },
      { id: 4, color: 'black', name: 'D' },
      { id: 5, color: 'gray', name: 'E' },
      { id: 6, color: 'white', name: 'F' },
    ],
    stwActive: false,
    writeBarrier: true,
    event: 'scanning',
    codeHighlight: 'gcDrain(gcw, gcDrainUntilPreempt)',
  },
  {
    phase: 'mark_complete',
    gcState: '_GCmark',
    title: 'Marking: gray queue пуст',
    description: 'E сканирован. Все достижимые объекты чёрные. F остался белым — мусор.',
    heapObjects: [
      { id: 1, color: 'black', name: 'A' },
      { id: 2, color: 'black', name: 'B' },
      { id: 3, color: 'black', name: 'C' },
      { id: 4, color: 'black', name: 'D' },
      { id: 5, color: 'black', name: 'E' },
      { id: 6, color: 'white', name: 'F' },
    ],
    stwActive: false,
    writeBarrier: true,
    event: 'mark_done',
    codeHighlight: 'gcMarkDone()',
  },
  {
    phase: 'stw_term',
    gcState: '_GCmarktermination',
    title: 'STW: Mark Termination',
    description: 'Финальная STW пауза (~10-50μs). Проверка завершения marking.',
    heapObjects: [
      { id: 1, color: 'black', name: 'A' },
      { id: 2, color: 'black', name: 'B' },
      { id: 3, color: 'black', name: 'C' },
      { id: 4, color: 'black', name: 'D' },
      { id: 5, color: 'black', name: 'E' },
      { id: 6, color: 'white', name: 'F' },
    ],
    stwActive: true,
    writeBarrier: true,
    event: 'stw_mark_term',
    codeHighlight: 'gcphase = _GCmarktermination',
  },
  {
    phase: 'sweep_start',
    gcState: '_GCsweep',
    title: '_GCsweep — Concurrent Sweep',
    description: 'STW завершён. Write barrier выключен. Lazy sweep освобождает белые объекты.',
    heapObjects: [
      { id: 1, color: 'black', name: 'A' },
      { id: 2, color: 'black', name: 'B' },
      { id: 3, color: 'black', name: 'C' },
      { id: 4, color: 'black', name: 'D' },
      { id: 5, color: 'black', name: 'E' },
      { id: 6, color: 'white', name: 'F' },
    ],
    stwActive: false,
    writeBarrier: false,
    event: 'sweep_start',
    codeHighlight: 'setGCPhase(_GCoff); gcSweep()',
  },
  {
    phase: 'sweep_done',
    gcState: '_GCoff',
    title: 'Sweep завершён — Цикл окончен',
    description: 'F удалён. Все объекты снова "белые" (для следующего цикла). gcphase = _GCoff.',
    heapObjects: [
      { id: 1, color: 'white', name: 'A' },
      { id: 2, color: 'white', name: 'B' },
      { id: 3, color: 'white', name: 'C' },
      { id: 4, color: 'white', name: 'D' },
      { id: 5, color: 'white', name: 'E' },
    ],
    stwActive: false,
    writeBarrier: false,
    event: 'gc_complete',
    codeHighlight: 'gcphase = _GCoff // ready for next cycle',
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
  }, 2500)
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

function getColorClass(color: string) {
  return `obj-${color}`
}

function getGCStateClass(state: string) {
  return {
    '_GCoff': 'state-off',
    '_GCmark': 'state-mark',
    '_GCmarktermination': 'state-term',
    '_GCsweep': 'state-sweep',
  }[state] || ''
}
</script>

<template>
  <div class="gc-phase-sim">
    <!-- Header -->
    <div class="sim-header">
      <h3>GC Phase Simulator</h3>
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
        v-for="(s, idx) in states"
        :key="idx"
        :class="['progress-dot', { active: idx === step, done: idx < step, stw: s.stwActive }]"
        @click="step = idx; stopAutoPlay()"
      />
    </div>

    <!-- GC State Machine -->
    <div class="state-machine">
      <div class="state-flow">
        <div :class="['state-box', { active: currentState.gcState === '_GCoff' }, getGCStateClass('_GCoff')]">
          _GCoff
        </div>
        <div class="arrow">→</div>
        <div :class="['state-box stw', { active: currentState.stwActive && currentState.phase === 'stw_start' }]">
          STW
        </div>
        <div class="arrow">→</div>
        <div :class="['state-box', { active: currentState.gcState === '_GCmark' }, getGCStateClass('_GCmark')]">
          _GCmark
        </div>
        <div class="arrow">→</div>
        <div :class="['state-box stw', { active: currentState.stwActive && currentState.phase === 'stw_term' }]">
          STW
        </div>
        <div class="arrow">→</div>
        <div :class="['state-box', { active: currentState.gcState === '_GCsweep' }, getGCStateClass('_GCsweep')]">
          Sweep
        </div>
      </div>
    </div>

    <!-- State info -->
    <div :class="['state-info', { stw: currentState.stwActive }]">
      <div class="state-title">{{ currentState.title }}</div>
      <div class="state-desc">{{ currentState.description }}</div>
    </div>

    <!-- Indicators -->
    <div class="indicators">
      <div :class="['indicator', { active: currentState.stwActive }]">
        <span class="ind-icon">⏸</span>
        <span class="ind-label">STW</span>
      </div>
      <div :class="['indicator', { active: currentState.writeBarrier }]">
        <span class="ind-icon">🛡</span>
        <span class="ind-label">Write Barrier</span>
      </div>
      <div :class="['indicator', 'gc-state', getGCStateClass(currentState.gcState)]">
        <span class="ind-label">{{ currentState.gcState }}</span>
      </div>
    </div>

    <!-- Heap visualization -->
    <div class="heap-section">
      <div class="heap-label">Heap Objects</div>
      <div class="heap-container">
        <TransitionGroup name="object" tag="div" class="objects-grid">
          <div
            v-for="obj in currentState.heapObjects"
            :key="obj.id"
            :class="['heap-object', getColorClass(obj.color)]"
          >
            <span class="obj-name">{{ obj.name }}</span>
            <span class="obj-color">{{ obj.color }}</span>
          </div>
        </TransitionGroup>
      </div>
      <div class="color-legend">
        <div class="legend-item">
          <span class="legend-color white"></span>
          <span>White (не посещён)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color gray"></span>
          <span>Gray (в очереди)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color black"></span>
          <span>Black (сканирован)</span>
        </div>
      </div>
    </div>

    <!-- Code highlight -->
    <div v-if="currentState.codeHighlight" class="code-panel">
      <div class="code-label">runtime/mgc.go</div>
      <code class="code-highlight">{{ currentState.codeHighlight }}</code>
    </div>

    <!-- Phase timeline -->
    <div class="timeline">
      <div class="timeline-header">Типичные длительности фаз</div>
      <div class="timeline-bar">
        <div class="timeline-segment off" style="flex: 1000">
          <span>_GCoff (между циклами)</span>
        </div>
        <div class="timeline-segment stw" style="flex: 1">
          <span>STW</span>
        </div>
        <div class="timeline-segment mark" style="flex: 50">
          <span>_GCmark</span>
        </div>
        <div class="timeline-segment stw" style="flex: 1">
          <span>STW</span>
        </div>
        <div class="timeline-segment sweep" style="flex: 30">
          <span>Sweep</span>
        </div>
      </div>
      <div class="timeline-labels">
        <span>~ms-sec</span>
        <span>~10-100μs</span>
        <span>~ms</span>
        <span>~10-100μs</span>
        <span>~ms (lazy)</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gc-phase-sim {
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

.btn {
  padding: 6px 12px;
  background: #3a3a5e;
  border: 1px solid #4a4a7e;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  transition: all 0.2s ease;
  min-width: 36px;
}

.btn:hover:not(:disabled) {
  background: #4a4a7e;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn.play {
  background: #2a5a2a;
  border-color: #3a7a3a;
}

.btn.play:hover {
  background: #3a7a3a;
}

.btn.reset {
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

.progress-dot.stw {
  border: 2px solid #f87171;
}

/* State Machine */
.state-machine {
  background: #0d0d1a;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
  overflow-x: auto;
}

.state-flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: max-content;
}

.state-box {
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 11px;
  background: #252545;
  border: 2px solid #3a3a5e;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.state-box.active {
  transform: scale(1.1);
  box-shadow: 0 0 15px rgba(78, 205, 196, 0.4);
}

.state-box.state-off.active {
  background: #1a2a3a;
  border-color: #60a5fa;
}

.state-box.state-mark.active {
  background: #2a3a1a;
  border-color: #4ade80;
}

.state-box.state-term.active {
  background: #3a2a1a;
  border-color: #fbbf24;
}

.state-box.state-sweep.active {
  background: #3a1a2a;
  border-color: #f472b6;
}

.state-box.stw {
  background: #3a1a1a;
  border-color: #5a2a2a;
}

.state-box.stw.active {
  background: #5a1a1a;
  border-color: #f87171;
  animation: pulse-stw 0.5s ease-in-out infinite;
}

@keyframes pulse-stw {
  0%, 100% { box-shadow: 0 0 10px rgba(248, 113, 113, 0.3); }
  50% { box-shadow: 0 0 20px rgba(248, 113, 113, 0.6); }
}

.arrow {
  color: #606080;
  font-size: 14px;
}

/* State info */
.state-info {
  background: #252545;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  border-left: 4px solid #4ecdc4;
  transition: all 0.3s ease;
}

.state-info.stw {
  border-left-color: #f87171;
  background: #2a2035;
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
  line-height: 1.5;
}

/* Indicators */
.indicators {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #252545;
  border-radius: 4px;
  font-size: 11px;
  border: 1px solid #3a3a5e;
  opacity: 0.5;
  transition: all 0.3s ease;
}

.indicator.active {
  opacity: 1;
  background: #2a3a4a;
  border-color: #4ecdc4;
}

.indicator.gc-state {
  opacity: 1;
  font-weight: 600;
}

.indicator.gc-state.state-off {
  background: #1a2a3a;
  border-color: #60a5fa;
  color: #60a5fa;
}

.indicator.gc-state.state-mark {
  background: #1a3a1a;
  border-color: #4ade80;
  color: #4ade80;
}

.indicator.gc-state.state-term {
  background: #3a2a1a;
  border-color: #fbbf24;
  color: #fbbf24;
}

.indicator.gc-state.state-sweep {
  background: #3a1a2a;
  border-color: #f472b6;
  color: #f472b6;
}

.ind-icon {
  font-size: 14px;
}

/* Heap section */
.heap-section {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

.heap-label {
  font-size: 11px;
  color: #808080;
  margin-bottom: 12px;
}

.heap-container {
  min-height: 80px;
}

.objects-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.heap-object {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  border: 2px solid;
}

.heap-object.obj-white {
  background: #2a2a4e;
  border-color: #606080;
  color: #a0a0a0;
}

.heap-object.obj-gray {
  background: #3a3a1a;
  border-color: #fbbf24;
  color: #fbbf24;
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.3);
}

.heap-object.obj-black {
  background: #1a3a1a;
  border-color: #4ade80;
  color: #4ade80;
}

.obj-name {
  font-size: 18px;
  font-weight: 700;
}

.obj-color {
  font-size: 9px;
  text-transform: uppercase;
  opacity: 0.7;
}

.color-legend {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #808080;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid;
}

.legend-color.white {
  background: #2a2a4e;
  border-color: #606080;
}

.legend-color.gray {
  background: #3a3a1a;
  border-color: #fbbf24;
}

.legend-color.black {
  background: #1a3a1a;
  border-color: #4ade80;
}

/* Code panel */
.code-panel {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 16px;
}

.code-label {
  background: #252545;
  padding: 6px 12px;
  font-size: 10px;
  color: #808080;
}

.code-highlight {
  display: block;
  padding: 12px 16px;
  font-size: 12px;
  color: #4ecdc4;
}

/* Timeline */
.timeline {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.timeline-header {
  font-size: 11px;
  color: #808080;
  margin-bottom: 12px;
}

.timeline-bar {
  display: flex;
  height: 24px;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.timeline-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: rgba(255, 255, 255, 0.8);
  overflow: hidden;
  white-space: nowrap;
}

.timeline-segment.off {
  background: #1a2a3a;
}

.timeline-segment.stw {
  background: #7f1d1d;
}

.timeline-segment.mark {
  background: #166534;
}

.timeline-segment.sweep {
  background: #5b21b6;
}

.timeline-labels {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #606080;
}

/* Transitions */
.object-enter-active,
.object-leave-active {
  transition: all 0.3s ease;
}

.object-enter-from {
  opacity: 0;
  transform: scale(0.5);
}

.object-leave-to {
  opacity: 0;
  transform: scale(0.5) translateY(20px);
}

@media (max-width: 600px) {
  .state-flow {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .timeline-segment span {
    display: none;
  }

  .timeline-labels {
    font-size: 8px;
  }
}
</style>
