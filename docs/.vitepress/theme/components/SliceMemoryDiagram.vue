<script setup lang="ts">
import { ref, computed, watch } from 'vue'

type Scenario = 'shared' | 'new'

interface SliceHeader {
  name: string
  data: string
  len: number
  cap: number
  color: string
}

interface MemoryState {
  address: string
  cells: (number | null)[]
  highlights: number[]
  newAddress?: string
  newCells?: (number | null)[]
  newHighlights?: number[]
}

const scenario = ref<Scenario>('shared')
const step = ref(0)

const scenarios = {
  shared: {
    title: 'Shared Array (cap достаточно)',
    code: 's2 := append(s1, 30)',
    maxSteps: 3,
    steps: [
      {
        description: 'Исходное состояние: s1 с len=2, cap=4',
        slices: [
          { name: 's1', data: '0x100', len: 2, cap: 4, color: '#4ecdc4' }
        ],
        memory: {
          address: '0x100',
          cells: [10, 20, null, null],
          highlights: [0, 1]
        }
      },
      {
        description: 'append(s1, 30): проверяем cap — места хватает!',
        slices: [
          { name: 's1', data: '0x100', len: 2, cap: 4, color: '#4ecdc4' }
        ],
        memory: {
          address: '0x100',
          cells: [10, 20, null, null],
          highlights: [0, 1],
        },
        checkCapacity: true
      },
      {
        description: 's2 указывает на тот же массив, пишем 30 в [2]',
        slices: [
          { name: 's1', data: '0x100', len: 2, cap: 4, color: '#4ecdc4' },
          { name: 's2', data: '0x100', len: 3, cap: 4, color: '#ff6b6b' }
        ],
        memory: {
          address: '0x100',
          cells: [10, 20, 30, null],
          highlights: [0, 1, 2],
          writeIndex: 2
        }
      }
    ]
  },
  new: {
    title: 'New Array (cap превышен)',
    code: 's2 := append(s1, 30, 40, 50)',
    maxSteps: 3,
    steps: [
      {
        description: 'Исходное состояние: s1 с len=2, cap=4',
        slices: [
          { name: 's1', data: '0x100', len: 2, cap: 4, color: '#4ecdc4' }
        ],
        memory: {
          address: '0x100',
          cells: [10, 20, null, null],
          highlights: [0, 1]
        }
      },
      {
        description: 'append(s1, 30, 40, 50): нужно 5 элементов > cap=4',
        slices: [
          { name: 's1', data: '0x100', len: 2, cap: 4, color: '#4ecdc4' }
        ],
        memory: {
          address: '0x100',
          cells: [10, 20, null, null],
          highlights: [0, 1]
        },
        checkCapacity: true,
        capacityExceeded: true
      },
      {
        description: 's2 указывает на НОВЫЙ массив с cap=8',
        slices: [
          { name: 's1', data: '0x100', len: 2, cap: 4, color: '#4ecdc4' },
          { name: 's2', data: '0x200', len: 5, cap: 8, color: '#ff6b6b' }
        ],
        memory: {
          address: '0x100',
          cells: [10, 20, null, null],
          highlights: [0, 1],
          newAddress: '0x200',
          newCells: [10, 20, 30, 40, 50, null, null, null],
          newHighlights: [0, 1, 2, 3, 4]
        }
      }
    ]
  }
}

const currentScenario = computed(() => scenarios[scenario.value])
const currentStep = computed(() => currentScenario.value.steps[step.value])
const maxSteps = computed(() => currentScenario.value.maxSteps)

function nextStep() {
  if (step.value < maxSteps.value - 1) {
    step.value++
  }
}

function prevStep() {
  if (step.value > 0) {
    step.value--
  }
}

function reset() {
  step.value = 0
}

function switchScenario(s: Scenario) {
  scenario.value = s
  step.value = 0
}

watch(scenario, () => {
  step.value = 0
})
</script>

<template>
  <div class="slice-diagram">
    <!-- Scenario Tabs -->
    <div class="tabs">
      <button
        :class="['tab', { active: scenario === 'shared' }]"
        @click="switchScenario('shared')"
      >
        ✅ Shared Array
      </button>
      <button
        :class="['tab', { active: scenario === 'new' }]"
        @click="switchScenario('new')"
      >
        ❌ New Array
      </button>
    </div>

    <!-- Title & Code -->
    <div class="header">
      <div class="title">{{ currentScenario.title }}</div>
      <code class="code-snippet">{{ currentScenario.code }}</code>
    </div>

    <!-- Step Description -->
    <div class="step-info">
      <span class="step-number">Step {{ step + 1 }}/{{ maxSteps }}</span>
      <span class="step-desc">{{ currentStep.description }}</span>
    </div>

    <!-- Capacity Check Animation -->
    <div v-if="currentStep.checkCapacity" class="capacity-check">
      <div class="check-box" :class="{ exceeded: currentStep.capacityExceeded }">
        <span class="check-label">Проверка capacity:</span>
        <span v-if="!currentStep.capacityExceeded" class="check-result ok">
          len + 1 = 3 ≤ cap = 4 ✓
        </span>
        <span v-else class="check-result fail">
          len + 3 = 5 > cap = 4 ✗
        </span>
      </div>
    </div>

    <!-- Slice Headers -->
    <div class="slices-section">
      <div class="section-title">Slice Headers</div>
      <div class="slices">
        <TransitionGroup name="slice">
          <div
            v-for="slice in currentStep.slices"
            :key="slice.name"
            class="slice-header"
            :style="{ borderColor: slice.color }"
          >
            <div class="slice-name" :style="{ color: slice.color }">{{ slice.name }}</div>
            <div class="slice-fields">
              <div class="field">
                <span class="field-name">Data:</span>
                <span class="field-value ptr">{{ slice.data }}</span>
              </div>
              <div class="field">
                <span class="field-name">Len:</span>
                <span class="field-value num">{{ slice.len }}</span>
              </div>
              <div class="field">
                <span class="field-name">Cap:</span>
                <span class="field-value num">{{ slice.cap }}</span>
              </div>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <!-- Memory Section -->
    <div class="memory-section">
      <div class="section-title">Backing Array(s)</div>

      <!-- Primary Memory -->
      <div class="memory-block">
        <div class="memory-address">Memory @ {{ currentStep.memory.address }}</div>
        <div class="memory-cells">
          <TransitionGroup name="cell">
            <div
              v-for="(cell, idx) in currentStep.memory.cells"
              :key="`primary-${idx}`"
              :class="[
                'memory-cell',
                {
                  highlight: currentStep.memory.highlights.includes(idx),
                  's1-range': currentStep.slices[0] && idx < currentStep.slices[0].len,
                  's2-range': currentStep.slices[1] &&
                    currentStep.slices[1].data === currentStep.memory.address &&
                    idx < currentStep.slices[1].len,
                  'write-target': currentStep.memory.writeIndex === idx
                }
              ]"
            >
              <span class="cell-value">{{ cell ?? '∅' }}</span>
              <span class="cell-index">[{{ idx }}]</span>
            </div>
          </TransitionGroup>
        </div>
        <div class="pointer-labels">
          <span class="ptr-label s1">▲ s1[0:{{ currentStep.slices[0]?.len }}]</span>
          <span
            v-if="currentStep.slices[1] && currentStep.slices[1].data === currentStep.memory.address"
            class="ptr-label s2"
          >
            ▲ s2[0:{{ currentStep.slices[1]?.len }}]
          </span>
        </div>
      </div>

      <!-- New Memory (for 'new' scenario) -->
      <Transition name="memory">
        <div v-if="currentStep.memory.newAddress" class="memory-block new-array">
          <div class="memory-address new">Memory @ {{ currentStep.memory.newAddress }} (новый)</div>
          <div class="memory-cells">
            <div
              v-for="(cell, idx) in currentStep.memory.newCells"
              :key="`new-${idx}`"
              :class="[
                'memory-cell',
                {
                  highlight: currentStep.memory.newHighlights?.includes(idx),
                  's2-range': currentStep.slices[1] && idx < currentStep.slices[1].len
                }
              ]"
            >
              <span class="cell-value">{{ cell ?? '∅' }}</span>
              <span class="cell-index">[{{ idx }}]</span>
            </div>
          </div>
          <div class="pointer-labels">
            <span class="ptr-label s2">▲ s2[0:{{ currentStep.slices[1]?.len }}]</span>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Controls -->
    <div class="controls">
      <button class="btn" :disabled="step === 0" @click="prevStep">
        ← Назад
      </button>
      <button class="btn" :disabled="step === maxSteps - 1" @click="nextStep">
        Далее →
      </button>
      <button class="btn reset" @click="reset">
        ⟲ Сброс
      </button>
    </div>
  </div>
</template>

<style scoped>
.slice-diagram {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab {
  padding: 8px 16px;
  background: #2a2a4e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  color: #a0a0a0;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  transition: all 0.2s ease;
}

.tab:hover {
  background: #3a3a5e;
}

.tab.active {
  background: #4a4a7e;
  color: #ffffff;
  border-color: #6a6aae;
}

/* Header */
.header {
  margin-bottom: 16px;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 8px;
}

.code-snippet {
  display: inline-block;
  background: #0d0d1a;
  padding: 8px 12px;
  border-radius: 4px;
  color: #7dd3fc;
  font-size: 14px;
}

/* Step Info */
.step-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #252545;
  border-radius: 4px;
  margin-bottom: 16px;
}

.step-number {
  background: #4a4a7e;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.step-desc {
  color: #c0c0c0;
  font-size: 14px;
}

/* Capacity Check */
.capacity-check {
  margin-bottom: 16px;
}

.check-box {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #1a3a1a;
  border: 1px solid #2a5a2a;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.check-box.exceeded {
  background: #3a1a1a;
  border-color: #5a2a2a;
}

.check-label {
  color: #a0a0a0;
}

.check-result {
  font-weight: 600;
}

.check-result.ok {
  color: #4ade80;
}

.check-result.fail {
  color: #f87171;
}

/* Slices Section */
.slices-section,
.memory-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 12px;
  color: #808080;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.slices {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.slice-header {
  background: #252545;
  border: 2px solid;
  border-radius: 6px;
  padding: 12px;
  min-width: 200px;
  transition: all 0.3s ease;
}

.slice-name {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 8px;
}

.slice-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.field-name {
  color: #808080;
}

.field-value {
  font-weight: 500;
}

.field-value.ptr {
  color: #fbbf24;
}

.field-value.num {
  color: #a78bfa;
}

/* Memory Section */
.memory-block {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.memory-block.new-array {
  border-color: #ff6b6b;
  background: #1a0d0d;
}

.memory-address {
  font-size: 12px;
  color: #fbbf24;
  margin-bottom: 8px;
}

.memory-address.new {
  color: #ff6b6b;
}

.memory-cells {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.memory-cell {
  width: 56px;
  height: 56px;
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.memory-cell.highlight {
  border-color: #4ecdc4;
  background: #1a2e2e;
}

.memory-cell.s2-range {
  border-color: #ff6b6b;
}

.memory-cell.write-target {
  animation: pulse 1s ease-in-out infinite;
  border-color: #fbbf24;
  background: #2e2a1a;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(251, 191, 36, 0); }
}

.cell-value {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.cell-index {
  font-size: 10px;
  color: #606060;
  margin-top: 2px;
}

.pointer-labels {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 11px;
}

.ptr-label {
  color: #808080;
}

.ptr-label.s1 {
  color: #4ecdc4;
}

.ptr-label.s2 {
  color: #ff6b6b;
}

/* Controls */
.controls {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #2a2a4e;
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
  transform: translateY(-10px);
}

.cell-enter-active,
.cell-leave-active {
  transition: all 0.3s ease;
}

.cell-enter-from {
  opacity: 0;
  transform: scale(0.8);
}

.memory-enter-active,
.memory-leave-active {
  transition: all 0.4s ease;
}

.memory-enter-from,
.memory-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
