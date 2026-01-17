<script setup lang="ts">
import { ref, computed } from 'vue'

interface SliceVar {
  name: string
  data: string
  len: number
  cap: number
  color: string
  visible: boolean
}

interface MemoryCell {
  value: number | null
  highlight: string | null
  writeAnimation: boolean
}

const step = ref(0)
const maxSteps = 5

const steps = [
  {
    title: 'Начальное состояние',
    code: 'original := make([]int, 2, 4)\noriginal[0], original[1] = 1, 2',
    description: 'Создаём original с len=2, cap=4',
    slices: [
      { name: 'original', data: '0x100', len: 2, cap: 4, color: '#4ecdc4', visible: true }
    ],
    memory: [
      { value: 1, highlight: 'original', writeAnimation: false },
      { value: 2, highlight: 'original', writeAnimation: false },
      { value: null, highlight: null, writeAnimation: false },
      { value: null, highlight: null, writeAnimation: false }
    ],
    output: null
  },
  {
    title: 'Вызов addElement(original, 100)',
    code: 'resultA := addElement(original, 100)\n// return append(items, elem)',
    description: 'Внутри функции: items.len=2, items.cap=4 → места хватает → пишем 100 в [2]',
    slices: [
      { name: 'original', data: '0x100', len: 2, cap: 4, color: '#4ecdc4', visible: true },
      { name: 'resultA', data: '0x100', len: 3, cap: 4, color: '#fbbf24', visible: true }
    ],
    memory: [
      { value: 1, highlight: 'both', writeAnimation: false },
      { value: 2, highlight: 'both', writeAnimation: false },
      { value: 100, highlight: 'resultA', writeAnimation: true },
      { value: null, highlight: null, writeAnimation: false }
    ],
    output: null
  },
  {
    title: 'original не изменился!',
    code: '// original.len по-прежнему 2\n// Значение 100 в памяти, но original его "не видит"',
    description: 'original.len=2 → видит только [0] и [1]. Но 100 уже записано в [2]!',
    slices: [
      { name: 'original', data: '0x100', len: 2, cap: 4, color: '#4ecdc4', visible: true },
      { name: 'resultA', data: '0x100', len: 3, cap: 4, color: '#fbbf24', visible: true }
    ],
    memory: [
      { value: 1, highlight: 'original', writeAnimation: false },
      { value: 2, highlight: 'original', writeAnimation: false },
      { value: 100, highlight: 'resultA', writeAnimation: false },
      { value: null, highlight: null, writeAnimation: false }
    ],
    output: null
  },
  {
    title: 'Вызов addElement(original, 200)',
    code: 'resultB := addElement(original, 200)\n// original.len ВСЁ ЕЩЁ 2!',
    description: 'original.len=2 → append пишет в [2] → ЗАТИРАЕТ 100!',
    slices: [
      { name: 'original', data: '0x100', len: 2, cap: 4, color: '#4ecdc4', visible: true },
      { name: 'resultA', data: '0x100', len: 3, cap: 4, color: '#fbbf24', visible: true },
      { name: 'resultB', data: '0x100', len: 3, cap: 4, color: '#ff6b6b', visible: true }
    ],
    memory: [
      { value: 1, highlight: 'all', writeAnimation: false },
      { value: 2, highlight: 'all', writeAnimation: false },
      { value: 200, highlight: 'overwrite', writeAnimation: true },
      { value: null, highlight: null, writeAnimation: false }
    ],
    output: null
  },
  {
    title: 'Результат: данные затёрты!',
    code: 'fmt.Println(resultA) // [1 2 200] — WTF?!\nfmt.Println(resultB) // [1 2 200]',
    description: 'resultA и resultB указывают на одну память → оба видят 200',
    slices: [
      { name: 'original', data: '0x100', len: 2, cap: 4, color: '#4ecdc4', visible: true },
      { name: 'resultA', data: '0x100', len: 3, cap: 4, color: '#fbbf24', visible: true },
      { name: 'resultB', data: '0x100', len: 3, cap: 4, color: '#ff6b6b', visible: true }
    ],
    memory: [
      { value: 1, highlight: 'all', writeAnimation: false },
      { value: 2, highlight: 'all', writeAnimation: false },
      { value: 200, highlight: 'bug', writeAnimation: false },
      { value: null, highlight: null, writeAnimation: false }
    ],
    output: [
      { label: 'original:', value: '[1 2]', note: 'len=2, видит только 2 элемента' },
      { label: 'resultA:', value: '[1 2 200]', note: 'Ожидали [1 2 100]!', bug: true },
      { label: 'resultB:', value: '[1 2 200]', note: '' }
    ]
  }
]

const currentStep = computed(() => steps[step.value])

function nextStep() {
  if (step.value < maxSteps - 1) step.value++
}

function prevStep() {
  if (step.value > 0) step.value--
}

function reset() {
  step.value = 0
}

function getHighlightClass(highlight: string | null): string {
  if (!highlight) return ''
  if (highlight === 'original') return 'hl-original'
  if (highlight === 'resultA') return 'hl-resultA'
  if (highlight === 'resultB') return 'hl-resultB'
  if (highlight === 'both') return 'hl-both'
  if (highlight === 'all') return 'hl-all'
  if (highlight === 'overwrite') return 'hl-overwrite'
  if (highlight === 'bug') return 'hl-bug'
  return ''
}
</script>

<template>
  <div class="mutation-diagram">
    <!-- Header -->
    <div class="header">
      <div class="title">Баг: Shared Backing Array</div>
      <div class="subtitle">Почему resultA получает 200 вместо 100?</div>
    </div>

    <!-- Step indicator -->
    <div class="step-bar">
      <div
        v-for="i in maxSteps"
        :key="i"
        :class="['step-dot', { active: i - 1 === step, done: i - 1 < step }]"
        @click="step = i - 1"
      />
    </div>

    <!-- Current step info -->
    <div class="step-info">
      <div class="step-title">
        <span class="step-num">{{ step + 1 }}.</span>
        {{ currentStep.title }}
      </div>
      <div class="step-desc">{{ currentStep.description }}</div>
    </div>

    <!-- Code block -->
    <div class="code-block">
      <pre>{{ currentStep.code }}</pre>
    </div>

    <!-- Visualization -->
    <div class="visualization">
      <!-- Slice Headers -->
      <div class="slices-panel">
        <div class="panel-title">Slice Headers</div>
        <TransitionGroup name="slice" tag="div" class="slices-list">
          <div
            v-for="slice in currentStep.slices.filter(s => s.visible)"
            :key="slice.name"
            class="slice-card"
            :style="{ '--slice-color': slice.color }"
          >
            <div class="slice-name">{{ slice.name }}</div>
            <div class="slice-fields">
              <div class="field">
                <span class="fname">Data</span>
                <span class="fvalue ptr">{{ slice.data }}</span>
              </div>
              <div class="field">
                <span class="fname">Len</span>
                <span class="fvalue">{{ slice.len }}</span>
              </div>
              <div class="field">
                <span class="fname">Cap</span>
                <span class="fvalue">{{ slice.cap }}</span>
              </div>
            </div>
          </div>
        </TransitionGroup>
      </div>

      <!-- Memory -->
      <div class="memory-panel">
        <div class="panel-title">Memory @ 0x100</div>
        <div class="memory-row">
          <div
            v-for="(cell, idx) in currentStep.memory"
            :key="idx"
            :class="['mem-cell', getHighlightClass(cell.highlight), { writing: cell.writeAnimation }]"
          >
            <div class="cell-value">{{ cell.value ?? '∅' }}</div>
            <div class="cell-idx">[{{ idx }}]</div>
          </div>
        </div>

        <!-- Pointer indicators -->
        <div class="pointers">
          <div class="ptr-line original">
            <span class="ptr-arrow">↑</span>
            <span class="ptr-label">original[0:2]</span>
          </div>
          <div v-if="step >= 1" class="ptr-line resultA">
            <span class="ptr-arrow">↑</span>
            <span class="ptr-label">resultA[0:3]</span>
          </div>
          <div v-if="step >= 3" class="ptr-line resultB">
            <span class="ptr-arrow">↑</span>
            <span class="ptr-label">resultB[0:3]</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Output (final step) -->
    <Transition name="fade">
      <div v-if="currentStep.output" class="output-panel">
        <div class="panel-title">Вывод программы</div>
        <div class="output-lines">
          <div
            v-for="(line, idx) in currentStep.output"
            :key="idx"
            :class="['output-line', { bug: line.bug }]"
          >
            <span class="out-label">{{ line.label }}</span>
            <span class="out-value">{{ line.value }}</span>
            <span v-if="line.note" class="out-note">← {{ line.note }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Controls -->
    <div class="controls">
      <button class="btn" :disabled="step === 0" @click="prevStep">← Назад</button>
      <button class="btn primary" :disabled="step === maxSteps - 1" @click="nextStep">
        Далее →
      </button>
      <button class="btn reset" @click="reset">⟲ Сброс</button>
    </div>
  </div>
</template>

<style scoped>
.mutation-diagram {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid #3a3a5e;
  border-radius: 12px;
  padding: 24px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.header {
  text-align: center;
  margin-bottom: 20px;
}

.title {
  font-size: 18px;
  font-weight: 700;
  color: #ff6b6b;
}

.subtitle {
  font-size: 13px;
  color: #a0a0a0;
  margin-top: 4px;
}

/* Step bar */
.step-bar {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 20px;
}

.step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #3a3a5e;
  cursor: pointer;
  transition: all 0.3s ease;
}

.step-dot:hover {
  background: #5a5a7e;
}

.step-dot.done {
  background: #4ecdc4;
}

.step-dot.active {
  background: #fbbf24;
  transform: scale(1.3);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.5);
}

/* Step info */
.step-info {
  background: #252545;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.step-title {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 8px;
}

.step-num {
  color: #fbbf24;
}

.step-desc {
  font-size: 13px;
  color: #a0a0a0;
  line-height: 1.5;
}

/* Code block */
.code-block {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 20px;
  overflow-x: auto;
}

.code-block pre {
  margin: 0;
  font-size: 13px;
  color: #7dd3fc;
  white-space: pre-wrap;
}

/* Visualization */
.visualization {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

@media (max-width: 700px) {
  .visualization {
    grid-template-columns: 1fr;
  }
}

.panel-title {
  font-size: 11px;
  color: #808080;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 12px;
}

/* Slices panel */
.slices-panel {
  background: #1e1e3a;
  border-radius: 8px;
  padding: 16px;
}

.slices-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slice-card {
  background: #252550;
  border: 2px solid var(--slice-color);
  border-radius: 6px;
  padding: 10px 12px;
}

.slice-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--slice-color);
  margin-bottom: 8px;
}

.slice-fields {
  display: flex;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fname {
  font-size: 10px;
  color: #606060;
}

.fvalue {
  font-size: 13px;
  color: #a78bfa;
  font-weight: 500;
}

.fvalue.ptr {
  color: #fbbf24;
}

/* Memory panel */
.memory-panel {
  background: #0d0d1a;
  border-radius: 8px;
  padding: 16px;
}

.memory-row {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.mem-cell {
  width: 64px;
  height: 64px;
  background: #1a1a2e;
  border: 2px solid #3a3a5e;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.cell-value {
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
}

.cell-idx {
  font-size: 10px;
  color: #505050;
  margin-top: 2px;
}

/* Highlight classes */
.hl-original {
  border-color: #4ecdc4;
  background: rgba(78, 205, 196, 0.1);
}

.hl-resultA {
  border-color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
}

.hl-resultB {
  border-color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
}

.hl-both {
  border-color: #4ecdc4;
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.15), rgba(251, 191, 36, 0.15));
}

.hl-all {
  border-color: #a78bfa;
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.1), rgba(251, 191, 36, 0.1), rgba(255, 107, 107, 0.1));
}

.hl-overwrite {
  border-color: #ff6b6b;
  background: rgba(255, 107, 107, 0.2);
}

.hl-bug {
  border-color: #ff6b6b;
  background: rgba(255, 107, 107, 0.3);
  box-shadow: 0 0 16px rgba(255, 107, 107, 0.4);
}

.mem-cell.writing {
  animation: write-pulse 0.6s ease-in-out;
}

@keyframes write-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); box-shadow: 0 0 20px rgba(251, 191, 36, 0.6); }
  100% { transform: scale(1); }
}

/* Pointers */
.pointers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
}

.ptr-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ptr-arrow {
  font-size: 14px;
}

.ptr-line.original { color: #4ecdc4; }
.ptr-line.resultA { color: #fbbf24; }
.ptr-line.resultB { color: #ff6b6b; }

/* Output panel */
.output-panel {
  background: #1a0d0d;
  border: 1px solid #5a2a2a;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.output-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.output-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
}

.out-label {
  color: #808080;
  min-width: 80px;
}

.out-value {
  color: #ffffff;
  font-weight: 600;
}

.out-note {
  color: #ff6b6b;
  font-size: 12px;
}

.output-line.bug .out-value {
  color: #ff6b6b;
  text-decoration: underline wavy;
}

/* Controls */
.controls {
  display: flex;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid #2a2a4e;
}

.btn {
  padding: 10px 20px;
  background: #3a3a5e;
  border: 1px solid #4a4a7e;
  border-radius: 6px;
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

.btn.primary {
  background: #4ecdc4;
  border-color: #4ecdc4;
  color: #0d0d1a;
  font-weight: 600;
}

.btn.primary:hover:not(:disabled) {
  background: #3dbdb5;
}

.btn.reset {
  margin-left: auto;
  background: #2a2a4e;
}

/* Transitions */
.slice-enter-active,
.slice-leave-active {
  transition: all 0.3s ease;
}

.slice-enter-from,
.slice-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.4s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
