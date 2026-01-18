<script setup lang="ts">
import { ref } from 'vue'

interface Primitive {
  id: string
  name: string
  category: 'core' | 'sync' | 'atomic' | 'pattern'
  description: string
  runtime: string
  useCase: string
}

const primitives: Primitive[] = [
  {
    id: 'goroutine',
    name: 'Goroutine',
    category: 'core',
    description: 'Легковесный поток выполнения',
    runtime: 'runtime.g',
    useCase: 'Параллельное выполнение задач'
  },
  {
    id: 'channel',
    name: 'Channel',
    category: 'core',
    description: 'Типизированная очередь для коммуникации',
    runtime: 'runtime.hchan',
    useCase: 'Передача данных между горутинами'
  },
  {
    id: 'context',
    name: 'Context',
    category: 'core',
    description: 'Управление жизненным циклом',
    runtime: 'context.Context',
    useCase: 'Cancellation, deadlines, values'
  },
  {
    id: 'mutex',
    name: 'Mutex',
    category: 'sync',
    description: 'Эксклюзивная блокировка',
    runtime: 'sync.Mutex',
    useCase: 'Защита shared state'
  },
  {
    id: 'rwmutex',
    name: 'RWMutex',
    category: 'sync',
    description: 'Reader-writer lock',
    runtime: 'sync.RWMutex',
    useCase: 'Read-heavy workloads'
  },
  {
    id: 'waitgroup',
    name: 'WaitGroup',
    category: 'sync',
    description: 'Ожидание группы горутин',
    runtime: 'sync.WaitGroup',
    useCase: 'Синхронизация завершения'
  },
  {
    id: 'pool',
    name: 'Pool',
    category: 'sync',
    description: 'Переиспользование объектов',
    runtime: 'sync.Pool',
    useCase: 'Снижение аллокаций'
  },
  {
    id: 'atomic',
    name: 'Atomic',
    category: 'atomic',
    description: 'Lock-free операции',
    runtime: 'sync/atomic',
    useCase: 'Счётчики, флаги'
  },
  {
    id: 'select',
    name: 'Select',
    category: 'pattern',
    description: 'Мультиплексор каналов',
    runtime: 'runtime.selectgo',
    useCase: 'Ожидание нескольких каналов'
  },
]

const selected = ref<string | null>(null)
const selectedPrimitive = ref<Primitive | null>(null)

function selectPrimitive(id: string) {
  selected.value = id
  selectedPrimitive.value = primitives.find(p => p.id === id) || null
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'core': return '#4ade80'
    case 'sync': return '#60a5fa'
    case 'atomic': return '#fbbf24'
    case 'pattern': return '#a78bfa'
    default: return '#808080'
  }
}
</script>

<template>
  <div class="overview-diagram">
    <div class="diagram-header">
      <h3>Go Concurrency Primitives</h3>
    </div>

    <div class="main-layout">
      <!-- Primitives grid -->
      <div class="primitives-grid">
        <!-- Core -->
        <div class="category-section">
          <div class="category-label" style="color: #4ade80">Core</div>
          <div class="category-items">
            <div
              v-for="p in primitives.filter(x => x.category === 'core')"
              :key="p.id"
              class="primitive-box"
              :class="{ selected: selected === p.id }"
              :style="{ borderColor: getCategoryColor(p.category) }"
              @click="selectPrimitive(p.id)"
            >
              <div class="primitive-name">{{ p.name }}</div>
              <div class="primitive-runtime">{{ p.runtime }}</div>
            </div>
          </div>
        </div>

        <!-- Sync -->
        <div class="category-section">
          <div class="category-label" style="color: #60a5fa">sync Package</div>
          <div class="category-items">
            <div
              v-for="p in primitives.filter(x => x.category === 'sync')"
              :key="p.id"
              class="primitive-box"
              :class="{ selected: selected === p.id }"
              :style="{ borderColor: getCategoryColor(p.category) }"
              @click="selectPrimitive(p.id)"
            >
              <div class="primitive-name">{{ p.name }}</div>
              <div class="primitive-runtime">{{ p.runtime }}</div>
            </div>
          </div>
        </div>

        <!-- Atomic & Pattern -->
        <div class="category-section">
          <div class="category-label" style="color: #fbbf24">Atomic & Patterns</div>
          <div class="category-items">
            <div
              v-for="p in primitives.filter(x => x.category === 'atomic' || x.category === 'pattern')"
              :key="p.id"
              class="primitive-box"
              :class="{ selected: selected === p.id }"
              :style="{ borderColor: getCategoryColor(p.category) }"
              @click="selectPrimitive(p.id)"
            >
              <div class="primitive-name">{{ p.name }}</div>
              <div class="primitive-runtime">{{ p.runtime }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Details panel -->
      <div class="details-panel">
        <template v-if="selectedPrimitive">
          <div class="detail-header" :style="{ borderColor: getCategoryColor(selectedPrimitive.category) }">
            <div class="detail-name">{{ selectedPrimitive.name }}</div>
            <div class="detail-category" :style="{ color: getCategoryColor(selectedPrimitive.category) }">
              {{ selectedPrimitive.category }}
            </div>
          </div>
          <div class="detail-body">
            <div class="detail-row">
              <span class="detail-label">Description:</span>
              <span class="detail-value">{{ selectedPrimitive.description }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Runtime:</span>
              <span class="detail-value code">{{ selectedPrimitive.runtime }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Use Case:</span>
              <span class="detail-value">{{ selectedPrimitive.useCase }}</span>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="detail-placeholder">
            Кликните на примитив для просмотра деталей
          </div>
        </template>
      </div>
    </div>

    <!-- Architecture diagram -->
    <div class="architecture">
      <div class="arch-title">Communication vs Shared Memory</div>
      <div class="arch-diagram">
        <div class="arch-side csp">
          <div class="arch-side-title">CSP (Channels)</div>
          <div class="arch-flow">
            <div class="arch-box">G1</div>
            <div class="arch-arrow">→ ch →</div>
            <div class="arch-box">G2</div>
          </div>
          <div class="arch-desc">"Don't communicate by sharing memory"</div>
        </div>
        <div class="arch-vs">VS</div>
        <div class="arch-side shared">
          <div class="arch-side-title">Shared Memory</div>
          <div class="arch-flow">
            <div class="arch-box">G1</div>
            <div class="arch-arrow shared-arrow">↘</div>
            <div class="arch-box mutex">Mutex + Data</div>
            <div class="arch-arrow shared-arrow">↙</div>
            <div class="arch-box">G2</div>
          </div>
          <div class="arch-desc">"Share memory by communicating"</div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="legend">
      <div class="legend-item">
        <div class="legend-color" style="background: #4ade80"></div>
        <span>Core primitives</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #60a5fa"></div>
        <span>sync package</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #fbbf24"></div>
        <span>Atomic operations</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #a78bfa"></div>
        <span>Patterns</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overview-diagram {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.diagram-header {
  margin-bottom: 20px;
}

.diagram-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.main-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 20px;
  margin-bottom: 20px;
}

.primitives-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.category-section {
  background: #252545;
  border-radius: 6px;
  padding: 12px;
}

.category-label {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 8px;
}

.category-items {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.primitive-box {
  padding: 10px 14px;
  background: #1a1a2e;
  border: 2px solid;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
}

.primitive-box:hover {
  background: #2a2a4e;
}

.primitive-box.selected {
  background: #2a2a4e;
  box-shadow: 0 0 15px rgba(96, 165, 250, 0.3);
}

.primitive-name {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 2px;
}

.primitive-runtime {
  font-size: 9px;
  color: #606080;
}

.details-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  min-height: 200px;
}

.detail-header {
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 2px solid;
}

.detail-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}

.detail-category {
  font-size: 10px;
  text-transform: uppercase;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 10px;
  color: #606080;
  text-transform: uppercase;
}

.detail-value {
  font-size: 12px;
  color: #e0e0e0;
}

.detail-value.code {
  font-family: 'JetBrains Mono', monospace;
  color: #4ecdc4;
}

.detail-placeholder {
  color: #606080;
  font-size: 12px;
  text-align: center;
  padding: 40px 20px;
}

.architecture {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
}

.arch-title {
  font-size: 12px;
  color: #808080;
  text-transform: uppercase;
  margin-bottom: 16px;
  text-align: center;
}

.arch-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.arch-side {
  flex: 1;
  text-align: center;
  padding: 16px;
  border-radius: 6px;
  max-width: 300px;
}

.arch-side.csp {
  background: #1a2a1a;
  border: 1px solid #4ade80;
}

.arch-side.shared {
  background: #1a1a2a;
  border: 1px solid #60a5fa;
}

.arch-side-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 12px;
}

.arch-side.csp .arch-side-title {
  color: #4ade80;
}

.arch-side.shared .arch-side-title {
  color: #60a5fa;
}

.arch-flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.arch-box {
  padding: 6px 12px;
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.arch-box.mutex {
  border-color: #60a5fa;
}

.arch-arrow {
  font-size: 11px;
  color: #4ade80;
}

.arch-arrow.shared-arrow {
  color: #60a5fa;
}

.arch-desc {
  font-size: 10px;
  color: #808080;
  font-style: italic;
}

.arch-vs {
  font-size: 14px;
  font-weight: 600;
  color: #606080;
  padding: 0 10px;
}

.legend {
  display: flex;
  gap: 20px;
  padding-top: 16px;
  border-top: 1px solid #2a2a4e;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #808080;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

@media (max-width: 768px) {
  .main-layout {
    grid-template-columns: 1fr;
  }

  .arch-diagram {
    flex-direction: column;
  }

  .arch-vs {
    transform: rotate(90deg);
  }
}
</style>
