<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface GraphNode {
  id: string
  label: string
  color: 'white' | 'gray' | 'black'
  x: number
  y: number
  isRoot: boolean
}

interface GraphEdge {
  from: string
  to: string
}

interface SimState {
  title: string
  description: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  grayQueue: string[]
  currentNode: string | null
  invariantViolation: boolean
  writeBarrierActive: boolean
  event: string | null
}

const step = ref(0)
const isPlaying = ref(false)
const playInterval = ref<number | null>(null)
const showWriteBarrier = ref(false)

// Базовые позиции узлов
const baseNodes: Omit<GraphNode, 'color'>[] = [
  { id: 'R', label: 'Root', x: 200, y: 30, isRoot: true },
  { id: 'A', label: 'A', x: 100, y: 100, isRoot: false },
  { id: 'B', label: 'B', x: 300, y: 100, isRoot: false },
  { id: 'C', label: 'C', x: 50, y: 180, isRoot: false },
  { id: 'D', label: 'D', x: 150, y: 180, isRoot: false },
  { id: 'E', label: 'E', x: 250, y: 180, isRoot: false },
  { id: 'F', label: 'F', x: 350, y: 180, isRoot: false },
]

const baseEdges: GraphEdge[] = [
  { from: 'R', to: 'A' },
  { from: 'R', to: 'B' },
  { from: 'A', to: 'C' },
  { from: 'A', to: 'D' },
  { from: 'B', to: 'E' },
  { from: 'D', to: 'E' },
  // F is unreachable - garbage
]

// Основные состояния симуляции
const normalStates: SimState[] = [
  {
    title: 'Начальное состояние',
    description: 'Все объекты белые. GC ещё не начался. F — unreachable (garbage).',
    nodes: baseNodes.map(n => ({ ...n, color: 'white' as const })),
    edges: baseEdges,
    grayQueue: [],
    currentNode: null,
    invariantViolation: false,
    writeBarrierActive: false,
    event: null,
  },
  {
    title: 'Scan Roots',
    description: 'GC начался. Root сканирован → серый. Его потомки A, B добавлены в gray queue.',
    nodes: baseNodes.map(n => ({
      ...n,
      color: n.id === 'R' ? 'gray' as const : 'white' as const,
    })),
    edges: baseEdges,
    grayQueue: ['R'],
    currentNode: 'R',
    invariantViolation: false,
    writeBarrierActive: true,
    event: 'scan_roots',
  },
  {
    title: 'Process Root',
    description: 'Root обработан → чёрный. A и B стали серыми (добавлены в очередь).',
    nodes: baseNodes.map(n => ({
      ...n,
      color: n.id === 'R' ? 'black' as const
        : (n.id === 'A' || n.id === 'B') ? 'gray' as const
        : 'white' as const,
    })),
    edges: baseEdges,
    grayQueue: ['A', 'B'],
    currentNode: null,
    invariantViolation: false,
    writeBarrierActive: true,
    event: 'process',
  },
  {
    title: 'Process A',
    description: 'A сканирован → чёрный. Потомки C и D стали серыми.',
    nodes: baseNodes.map(n => ({
      ...n,
      color: (n.id === 'R' || n.id === 'A') ? 'black' as const
        : (n.id === 'B' || n.id === 'C' || n.id === 'D') ? 'gray' as const
        : 'white' as const,
    })),
    edges: baseEdges,
    grayQueue: ['B', 'C', 'D'],
    currentNode: 'A',
    invariantViolation: false,
    writeBarrierActive: true,
    event: 'process',
  },
  {
    title: 'Process B',
    description: 'B сканирован → чёрный. Потомок E стал серым.',
    nodes: baseNodes.map(n => ({
      ...n,
      color: (n.id === 'R' || n.id === 'A' || n.id === 'B') ? 'black' as const
        : (n.id === 'C' || n.id === 'D' || n.id === 'E') ? 'gray' as const
        : 'white' as const,
    })),
    edges: baseEdges,
    grayQueue: ['C', 'D', 'E'],
    currentNode: 'B',
    invariantViolation: false,
    writeBarrierActive: true,
    event: 'process',
  },
  {
    title: 'Process C, D, E',
    description: 'C, D, E сканированы → чёрные. D→E уже серый. F остался белым.',
    nodes: baseNodes.map(n => ({
      ...n,
      color: n.id === 'F' ? 'white' as const : 'black' as const,
    })),
    edges: baseEdges,
    grayQueue: [],
    currentNode: null,
    invariantViolation: false,
    writeBarrierActive: true,
    event: 'complete',
  },
  {
    title: 'Marking Complete',
    description: 'Gray queue пуст. F — белый объект = мусор. Будет освобождён при sweep.',
    nodes: baseNodes.map(n => ({
      ...n,
      color: n.id === 'F' ? 'white' as const : 'black' as const,
    })),
    edges: baseEdges,
    grayQueue: [],
    currentNode: null,
    invariantViolation: false,
    writeBarrierActive: false,
    event: 'done',
  },
]

// Write Barrier демонстрация
const writeBarrierStates: SimState[] = [
  {
    title: 'Write Barrier: Проблема',
    description: 'Без write barrier: чёрный B указывает на белый F. Mutator может создать указатель B→F.',
    nodes: [
      { id: 'R', label: 'Root', x: 200, y: 30, isRoot: true, color: 'black' },
      { id: 'A', label: 'A', x: 100, y: 100, isRoot: false, color: 'black' },
      { id: 'B', label: 'B', x: 300, y: 100, isRoot: false, color: 'black' },
      { id: 'C', label: 'C', x: 50, y: 180, isRoot: false, color: 'gray' },
      { id: 'F', label: 'F', x: 350, y: 180, isRoot: false, color: 'white' },
    ],
    edges: [
      { from: 'R', to: 'A' },
      { from: 'R', to: 'B' },
      { from: 'A', to: 'C' },
    ],
    grayQueue: ['C'],
    currentNode: null,
    invariantViolation: false,
    writeBarrierActive: false,
    event: 'setup',
  },
  {
    title: 'Mutator: B.ptr = &F',
    description: 'Mutator создаёт указатель B→F. Теперь чёрный указывает на белый!',
    nodes: [
      { id: 'R', label: 'Root', x: 200, y: 30, isRoot: true, color: 'black' },
      { id: 'A', label: 'A', x: 100, y: 100, isRoot: false, color: 'black' },
      { id: 'B', label: 'B', x: 300, y: 100, isRoot: false, color: 'black' },
      { id: 'C', label: 'C', x: 50, y: 180, isRoot: false, color: 'gray' },
      { id: 'F', label: 'F', x: 350, y: 180, isRoot: false, color: 'white' },
    ],
    edges: [
      { from: 'R', to: 'A' },
      { from: 'R', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'F' }, // New edge!
    ],
    grayQueue: ['C'],
    currentNode: null,
    invariantViolation: true,
    writeBarrierActive: false,
    event: 'violation',
  },
  {
    title: '⚠️ Tri-color Invariant Violated!',
    description: 'Без барьера F будет ошибочно собран! Black→White = потеря живого объекта.',
    nodes: [
      { id: 'R', label: 'Root', x: 200, y: 30, isRoot: true, color: 'black' },
      { id: 'A', label: 'A', x: 100, y: 100, isRoot: false, color: 'black' },
      { id: 'B', label: 'B', x: 300, y: 100, isRoot: false, color: 'black' },
      { id: 'C', label: 'C', x: 50, y: 180, isRoot: false, color: 'black' },
      { id: 'F', label: 'F', x: 350, y: 180, isRoot: false, color: 'white' },
    ],
    edges: [
      { from: 'R', to: 'A' },
      { from: 'R', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'F' },
    ],
    grayQueue: [],
    currentNode: null,
    invariantViolation: true,
    writeBarrierActive: false,
    event: 'danger',
  },
  {
    title: 'Write Barrier: Решение',
    description: 'При записи *slot = ptr, barrier вызывает shade(ptr) → F становится серым.',
    nodes: [
      { id: 'R', label: 'Root', x: 200, y: 30, isRoot: true, color: 'black' },
      { id: 'A', label: 'A', x: 100, y: 100, isRoot: false, color: 'black' },
      { id: 'B', label: 'B', x: 300, y: 100, isRoot: false, color: 'black' },
      { id: 'C', label: 'C', x: 50, y: 180, isRoot: false, color: 'gray' },
      { id: 'F', label: 'F', x: 350, y: 180, isRoot: false, color: 'gray' },
    ],
    edges: [
      { from: 'R', to: 'A' },
      { from: 'R', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'F' },
    ],
    grayQueue: ['C', 'F'],
    currentNode: null,
    invariantViolation: false,
    writeBarrierActive: true,
    event: 'barrier',
  },
  {
    title: '✅ Инвариант восстановлен',
    description: 'F в gray queue → будет просканирован. Чёрный больше не указывает на белый.',
    nodes: [
      { id: 'R', label: 'Root', x: 200, y: 30, isRoot: true, color: 'black' },
      { id: 'A', label: 'A', x: 100, y: 100, isRoot: false, color: 'black' },
      { id: 'B', label: 'B', x: 300, y: 100, isRoot: false, color: 'black' },
      { id: 'C', label: 'C', x: 50, y: 180, isRoot: false, color: 'black' },
      { id: 'F', label: 'F', x: 350, y: 180, isRoot: false, color: 'black' },
    ],
    edges: [
      { from: 'R', to: 'A' },
      { from: 'R', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'F' },
    ],
    grayQueue: [],
    currentNode: null,
    invariantViolation: false,
    writeBarrierActive: true,
    event: 'safe',
  },
]

const states = computed(() => showWriteBarrier.value ? writeBarrierStates : normalStates)
const currentState = computed(() => states.value[step.value])
const maxSteps = computed(() => states.value.length)

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

function toggleDemo() {
  showWriteBarrier.value = !showWriteBarrier.value
  step.value = 0
  stopAutoPlay()
}

onUnmounted(() => {
  stopAutoPlay()
})

function getNodeClass(node: GraphNode) {
  return {
    'node-white': node.color === 'white',
    'node-gray': node.color === 'gray',
    'node-black': node.color === 'black',
    'node-root': node.isRoot,
    'node-current': currentState.value.currentNode === node.id,
  }
}

function getEdgePath(edge: GraphEdge) {
  const from = currentState.value.nodes.find(n => n.id === edge.from)
  const to = currentState.value.nodes.find(n => n.id === edge.to)
  if (!from || !to) return ''
  return `M ${from.x} ${from.y + 20} L ${to.x} ${to.y - 20}`
}

function isViolatingEdge(edge: GraphEdge) {
  if (!currentState.value.invariantViolation) return false
  const from = currentState.value.nodes.find(n => n.id === edge.from)
  const to = currentState.value.nodes.find(n => n.id === edge.to)
  return from?.color === 'black' && to?.color === 'white'
}
</script>

<template>
  <div class="tricolor-demo">
    <!-- Header -->
    <div class="demo-header">
      <h3>Tri-color Marking</h3>
      <div class="header-controls">
        <button
          :class="['mode-btn', { active: !showWriteBarrier }]"
          @click="!showWriteBarrier || toggleDemo()"
        >
          Marking
        </button>
        <button
          :class="['mode-btn', { active: showWriteBarrier }]"
          @click="showWriteBarrier || toggleDemo()"
        >
          Write Barrier
        </button>
      </div>
    </div>

    <!-- Controls -->
    <div class="controls">
      <button class="btn" :disabled="step === 0" @click="prevStep">←</button>
      <button class="btn play" @click="toggleAutoPlay">
        {{ isPlaying ? '⏸' : '▶' }}
      </button>
      <button class="btn" :disabled="step === maxSteps - 1" @click="nextStep">→</button>
      <button class="btn reset" @click="reset">⟲</button>
      <div class="step-indicator">{{ step + 1 }}/{{ maxSteps }}</div>
    </div>

    <!-- Progress -->
    <div class="progress-bar">
      <div
        v-for="(_, idx) in states"
        :key="idx"
        :class="['progress-dot', { active: idx === step, done: idx < step }]"
        @click="step = idx; stopAutoPlay()"
      />
    </div>

    <!-- State info -->
    <div :class="['state-info', { violation: currentState.invariantViolation }]">
      <div class="state-title">{{ currentState.title }}</div>
      <div class="state-desc">{{ currentState.description }}</div>
    </div>

    <!-- Graph visualization -->
    <div class="graph-container">
      <svg viewBox="0 0 400 220" class="graph-svg">
        <!-- Edges -->
        <g class="edges">
          <path
            v-for="(edge, idx) in currentState.edges"
            :key="`edge-${idx}`"
            :d="getEdgePath(edge)"
            :class="['edge', { violating: isViolatingEdge(edge) }]"
            marker-end="url(#arrowhead)"
          />
        </g>

        <!-- Arrowhead marker -->
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#606080" />
          </marker>
          <marker
            id="arrowhead-danger"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#f87171" />
          </marker>
        </defs>

        <!-- Nodes -->
        <g v-for="node in currentState.nodes" :key="node.id" class="node-group">
          <circle
            :cx="node.x"
            :cy="node.y"
            r="22"
            :class="['node', getNodeClass(node)]"
          />
          <text
            :x="node.x"
            :y="node.y + 5"
            class="node-label"
            text-anchor="middle"
          >
            {{ node.label }}
          </text>
          <text
            v-if="node.isRoot"
            :x="node.x"
            :y="node.y - 30"
            class="root-label"
            text-anchor="middle"
          >
            ROOT
          </text>
        </g>
      </svg>
    </div>

    <!-- Gray Queue -->
    <div class="queue-section">
      <div class="queue-label">Gray Queue (worklist)</div>
      <div class="queue-container">
        <TransitionGroup name="queue" tag="div" class="queue-items">
          <div
            v-for="id in currentState.grayQueue"
            :key="id"
            class="queue-item"
          >
            {{ id }}
          </div>
        </TransitionGroup>
        <span v-if="currentState.grayQueue.length === 0" class="empty-queue">empty</span>
      </div>
    </div>

    <!-- Write Barrier indicator -->
    <div :class="['wb-indicator', { active: currentState.writeBarrierActive }]">
      <span class="wb-icon">🛡</span>
      <span class="wb-text">Write Barrier: {{ currentState.writeBarrierActive ? 'ON' : 'OFF' }}</span>
    </div>

    <!-- Invariant -->
    <div class="invariant-box">
      <div class="invariant-title">Tri-color Invariant</div>
      <div class="invariant-text">
        <strong>Black</strong> объект <strong>никогда</strong> не указывает напрямую на <strong>White</strong> объект
      </div>
      <div :class="['invariant-status', { violated: currentState.invariantViolation }]">
        {{ currentState.invariantViolation ? '❌ НАРУШЕН' : '✓ Соблюдается' }}
      </div>
    </div>

    <!-- Color legend -->
    <div class="legend">
      <div class="legend-item">
        <span class="legend-circle white"></span>
        <span>White — не посещён</span>
      </div>
      <div class="legend-item">
        <span class="legend-circle gray"></span>
        <span>Gray — в очереди</span>
      </div>
      <div class="legend-item">
        <span class="legend-circle black"></span>
        <span>Black — сканирован</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tricolor-demo {
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

.header-controls {
  display: flex;
  gap: 8px;
}

.mode-btn {
  padding: 6px 14px;
  background: #2a2a4e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  color: #a0a0a0;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  background: #3a3a5e;
}

.mode-btn.active {
  background: #4ecdc4;
  border-color: #4ecdc4;
  color: #0a0a0a;
}

.controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
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

/* Progress */
.progress-bar {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
}

.progress-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #2a2a4e;
  cursor: pointer;
  transition: all 0.2s ease;
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
  border-left: 4px solid #4ecdc4;
}

.state-info.violation {
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
}

/* Graph */
.graph-container {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

.graph-svg {
  width: 100%;
  max-height: 220px;
}

.edge {
  stroke: #606080;
  stroke-width: 2;
  fill: none;
  transition: all 0.3s ease;
}

.edge.violating {
  stroke: #f87171;
  stroke-width: 3;
  stroke-dasharray: 5, 5;
  animation: pulse-edge 0.5s ease-in-out infinite;
}

@keyframes pulse-edge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.node {
  stroke-width: 3;
  transition: all 0.3s ease;
}

.node.node-white {
  fill: #2a2a4e;
  stroke: #606080;
}

.node.node-gray {
  fill: #3a3a1a;
  stroke: #fbbf24;
  filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.5));
}

.node.node-black {
  fill: #1a3a1a;
  stroke: #4ade80;
}

.node.node-current {
  stroke-width: 4;
  filter: drop-shadow(0 0 12px rgba(78, 205, 196, 0.6));
}

.node.node-root {
  stroke-dasharray: 4, 2;
}

.node-label {
  fill: #e0e0e0;
  font-size: 14px;
  font-weight: 600;
  pointer-events: none;
}

.root-label {
  fill: #808080;
  font-size: 8px;
  text-transform: uppercase;
}

/* Queue */
.queue-section {
  background: #252545;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.queue-label {
  font-size: 11px;
  color: #808080;
  margin-bottom: 8px;
}

.queue-container {
  min-height: 32px;
}

.queue-items {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.queue-item {
  background: #3a3a1a;
  border: 2px solid #fbbf24;
  color: #fbbf24;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.empty-queue {
  color: #606080;
  font-size: 11px;
  font-style: italic;
}

/* Write barrier indicator */
.wb-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #252545;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  margin-bottom: 16px;
  opacity: 0.5;
  transition: all 0.3s ease;
}

.wb-indicator.active {
  opacity: 1;
  background: #1a3a3a;
  border-color: #4ecdc4;
}

.wb-icon {
  font-size: 16px;
}

.wb-text {
  font-size: 11px;
}

/* Invariant box */
.invariant-box {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.invariant-title {
  font-size: 11px;
  color: #808080;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.invariant-text {
  font-size: 12px;
  color: #a0a0a0;
  margin-bottom: 8px;
}

.invariant-status {
  font-size: 12px;
  color: #4ade80;
  font-weight: 600;
}

.invariant-status.violated {
  color: #f87171;
  animation: blink 0.5s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Legend */
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

.legend-circle {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid;
}

.legend-circle.white {
  background: #2a2a4e;
  border-color: #606080;
}

.legend-circle.gray {
  background: #3a3a1a;
  border-color: #fbbf24;
}

.legend-circle.black {
  background: #1a3a1a;
  border-color: #4ade80;
}

/* Transitions */
.queue-enter-active,
.queue-leave-active {
  transition: all 0.3s ease;
}

.queue-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.queue-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

@media (max-width: 500px) {
  .legend {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
