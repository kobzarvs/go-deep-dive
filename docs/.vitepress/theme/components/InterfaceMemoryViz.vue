<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface MemoryBlock {
  label: string
  value: string
  color: string
  arrow?: string
}

interface SimState {
  title: string
  description: string
  varType: 'iface' | 'eface'
  ifaceBlocks: MemoryBlock[]
  heapBlocks: MemoryBlock[]
  itabBlocks?: MemoryBlock[]
  showBoxing: boolean
}

const step = ref(0)
const isPlaying = ref(false)
const playInterval = ref<number | null>(null)

const states: SimState[] = [
  {
    title: 'iface: пустой интерфейс с методами',
    description: 'var w io.Writer — tab и data оба nil. Размер 16 байт (2 указателя).',
    varType: 'iface',
    ifaceBlocks: [
      { label: 'tab', value: 'nil', color: '#4a4a7e' },
      { label: 'data', value: 'nil', color: '#4a4a7e' },
    ],
    heapBlocks: [],
    showBoxing: false,
  },
  {
    title: 'iface: присваивание *os.File',
    description: 'w = &file — создаётся itab для пары (io.Writer, *os.File). data указывает на file.',
    varType: 'iface',
    ifaceBlocks: [
      { label: 'tab', value: '*itab', color: '#4ecdc4', arrow: 'itab' },
      { label: 'data', value: '*os.File', color: '#fbbf24', arrow: 'heap' },
    ],
    heapBlocks: [
      { label: 'os.File', value: 'fd: 3, name: "test.txt"', color: '#fbbf24' },
    ],
    itabBlocks: [
      { label: 'inter', value: '*io.Writer', color: '#4ecdc4' },
      { label: '_type', value: '*os.File', color: '#4ecdc4' },
      { label: 'hash', value: '0x8f3a2b1c', color: '#4ecdc4' },
      { label: 'fun[0]', value: '(*os.File).Write', color: '#4ade80' },
    ],
    showBoxing: false,
  },
  {
    title: 'eface: пустой any',
    description: 'var x any — _type и data оба nil. Нет itab, только type info.',
    varType: 'eface',
    ifaceBlocks: [
      { label: '_type', value: 'nil', color: '#4a4a7e' },
      { label: 'data', value: 'nil', color: '#4a4a7e' },
    ],
    heapBlocks: [],
    showBoxing: false,
  },
  {
    title: 'eface: boxing int',
    description: 'x = 42 — boxing: int копируется на heap (или используется staticuint64s для малых значений).',
    varType: 'eface',
    ifaceBlocks: [
      { label: '_type', value: '*_type(int)', color: '#4ecdc4', arrow: 'type' },
      { label: 'data', value: '*int', color: '#fbbf24', arrow: 'heap' },
    ],
    heapBlocks: [
      { label: 'int', value: '42', color: '#fbbf24' },
    ],
    showBoxing: true,
  },
  {
    title: 'eface: boxing string',
    description: 'x = "hello" — string header (16 байт) копируется. Data указывает на копию header.',
    varType: 'eface',
    ifaceBlocks: [
      { label: '_type', value: '*_type(string)', color: '#4ecdc4', arrow: 'type' },
      { label: 'data', value: '*string', color: '#fbbf24', arrow: 'heap' },
    ],
    heapBlocks: [
      { label: 'string header', value: 'ptr + len=5', color: '#fbbf24' },
      { label: 'string data', value: '"hello"', color: '#606080' },
    ],
    showBoxing: true,
  },
  {
    title: 'Direct iface: маленький тип',
    description: 'Оптимизация: для типов ≤8 байт без указателей, data может содержать само значение.',
    varType: 'eface',
    ifaceBlocks: [
      { label: '_type', value: '*_type(int64)', color: '#4ecdc4', arrow: 'type' },
      { label: 'data', value: '0x000000000000002A', color: '#4ade80' },
    ],
    heapBlocks: [],
    showBoxing: false,
  },
]

const currentState = computed(() => states[step.value])

function nextStep() {
  if (step.value < states.length - 1) {
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
    if (step.value < states.length - 1) {
      step.value++
    } else {
      stopAutoPlay()
    }
  }, 3000)
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
</script>

<template>
  <div class="interface-viz">
    <div class="viz-header">
      <h3>Interface Memory Layout</h3>
      <div class="type-badge" :class="currentState.varType">
        {{ currentState.varType }}
      </div>
    </div>

    <div class="controls">
      <button class="btn" :disabled="step === 0" @click="prevStep">←</button>
      <button class="btn play" @click="toggleAutoPlay">
        {{ isPlaying ? '⏸' : '▶' }}
      </button>
      <button class="btn" :disabled="step === states.length - 1" @click="nextStep">→</button>
      <button class="btn reset" @click="reset">⟲</button>
      <div class="step-indicator">{{ step + 1 }}/{{ states.length }}</div>
    </div>

    <div class="state-info">
      <div class="state-title">{{ currentState.title }}</div>
      <div class="state-desc">{{ currentState.description }}</div>
    </div>

    <div class="memory-layout">
      <div class="memory-section">
        <div class="section-label">Stack / Variable</div>
        <div class="memory-container iface-container">
          <div class="struct-label">{{ currentState.varType }} (16 bytes)</div>
          <div
            v-for="(block, idx) in currentState.ifaceBlocks"
            :key="`iface-${idx}`"
            class="memory-block"
            :style="{ borderColor: block.color }"
          >
            <span class="block-label">{{ block.label }}</span>
            <span class="block-value" :style="{ color: block.color }">{{ block.value }}</span>
            <span v-if="block.arrow" class="arrow">→</span>
          </div>
        </div>
      </div>

      <div v-if="currentState.itabBlocks" class="memory-section">
        <div class="section-label">itab (static/cached)</div>
        <div class="memory-container itab-container">
          <div
            v-for="(block, idx) in currentState.itabBlocks"
            :key="`itab-${idx}`"
            class="memory-block small"
            :style="{ borderColor: block.color }"
          >
            <span class="block-label">{{ block.label }}</span>
            <span class="block-value" :style="{ color: block.color }">{{ block.value }}</span>
          </div>
        </div>
      </div>

      <div v-if="currentState.heapBlocks.length > 0" class="memory-section">
        <div class="section-label">Heap</div>
        <div class="memory-container heap-container">
          <div
            v-for="(block, idx) in currentState.heapBlocks"
            :key="`heap-${idx}`"
            class="memory-block"
            :style="{ borderColor: block.color }"
          >
            <span class="block-label">{{ block.label }}</span>
            <span class="block-value" :style="{ color: block.color }">{{ block.value }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="currentState.showBoxing" class="boxing-indicator">
      <span class="boxing-icon">📦</span>
      <span class="boxing-text">Boxing: value → heap allocation</span>
    </div>

    <div class="legend">
      <div class="legend-item">
        <span class="legend-dot" style="background: #4ecdc4"></span>
        <span>Type info / itab</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #fbbf24"></span>
        <span>Data pointer</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #4ade80"></span>
        <span>Method / Direct value</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.interface-viz {
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
  margin-bottom: 16px;
}

.viz-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.type-badge {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.type-badge.iface {
  background: #1a3a3a;
  color: #4ecdc4;
  border: 1px solid #4ecdc4;
}

.type-badge.eface {
  background: #3a3a1a;
  color: #fbbf24;
  border: 1px solid #fbbf24;
}

.controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
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

.state-info {
  background: #252545;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 20px;
  border-left: 4px solid #4ecdc4;
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

.memory-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 16px;
}

.memory-section {
  flex: 1;
  min-width: 200px;
}

.section-label {
  font-size: 11px;
  color: #808080;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.memory-container {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
}

.struct-label {
  font-size: 10px;
  color: #606080;
  margin-bottom: 8px;
}

.memory-block {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #1a1a2e;
  border: 2px solid;
  border-radius: 4px;
  margin-bottom: 6px;
}

.memory-block.small {
  padding: 4px 8px;
  font-size: 11px;
}

.memory-block:last-child {
  margin-bottom: 0;
}

.block-label {
  font-size: 11px;
  color: #808080;
  min-width: 50px;
}

.block-value {
  font-size: 12px;
  font-weight: 500;
  flex: 1;
}

.arrow {
  color: #606080;
  font-size: 14px;
}

.boxing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #3a3a1a;
  border: 1px solid #fbbf24;
  border-radius: 4px;
  margin-bottom: 16px;
}

.boxing-icon {
  font-size: 16px;
}

.boxing-text {
  font-size: 11px;
  color: #fbbf24;
}

.legend {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #808080;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

@media (max-width: 600px) {
  .memory-layout {
    flex-direction: column;
  }
}
</style>
