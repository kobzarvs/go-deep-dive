<script setup lang="ts">
import { ref, computed } from 'vue'

interface DataStructure {
  id: string
  name: string
  category: 'value-with-ptr' | 'pointer' | 'value'
  headerSize: string
  backingStorage: string
  passby: string
  passbyDetail: string
  mutable: string
  runtime: string
  description: string
  memoryLayout: string[]
}

const structures: DataStructure[] = [
  {
    id: 'slice',
    name: 'Slice',
    category: 'value-with-ptr',
    headerSize: '24 bytes',
    backingStorage: 'Heap (backing array)',
    passby: 'Value (header)',
    passbyDetail: 'Header копируется → Array общий',
    mutable: 'Elements: Yes',
    runtime: 'runtime/slice.go',
    description: 'Header (ptr + len + cap) копируется, backing array общий',
    memoryLayout: [
      '┌─────────────────┐',
      '│ ptr ─────────┐  │',
      '│ len = 3      │  │',
      '│ cap = 8      │  │',
      '└──────────────┼──┘',
      '               ▼',
      '┌──────────────────────┐',
      '│ [0] [1] [2] ... [7]  │',
      '└──────────────────────┘',
      '         Heap'
    ]
  },
  {
    id: 'string',
    name: 'String',
    category: 'value-with-ptr',
    headerSize: '16 bytes',
    backingStorage: 'Heap or rodata',
    passby: 'Value (header)',
    passbyDetail: 'Header копируется → Bytes общие (immutable)',
    mutable: 'No (immutable)',
    runtime: 'runtime/string.go',
    description: 'UTF-8 bytes, immutable, len в байтах не в рунах',
    memoryLayout: [
      '┌─────────────────┐',
      '│ ptr ─────────┐  │',
      '│ len = 12     │  │  bytes!',
      '└──────────────┼──┘',
      '               ▼',
      '┌─────────────────────┐',
      '│ "Привет" (UTF-8)    │',
      '└─────────────────────┘',
      '     Heap / rodata'
    ]
  },
  {
    id: 'map',
    name: 'Map',
    category: 'pointer',
    headerSize: '8 bytes',
    backingStorage: 'Heap (hmap + buckets)',
    passby: 'Pointer',
    passbyDetail: 'Pointer копируется → Та же hmap',
    mutable: 'Yes',
    runtime: 'runtime/map.go',
    description: 'Указатель на hmap, нет стабильных адресов элементов',
    memoryLayout: [
      '┌─────────┐',
      '│ *hmap ──┼────────┐',
      '└─────────┘        ▼',
      '         ┌──────────────────────┐',
      '         │ hmap                 │',
      '         │ count, B, hash0      │',
      '         │ buckets ─────┐       │',
      '         └──────────────┼───────┘',
      '                        ▼',
      '         ┌──────────────────────┐',
      '         │ [bucket0][bucket1]...│',
      '         │   ├─tophash[8]─┤     │',
      '         │   ├─keys[8]────┤     │',
      '         │   ├─values[8]──┤     │',
      '         │   └─overflow───┘     │',
      '         └──────────────────────┘'
    ]
  },
  {
    id: 'array',
    name: 'Array',
    category: 'value',
    headerSize: 'N × sizeof(T)',
    backingStorage: 'Stack or Heap',
    passby: 'Value (full copy)',
    passbyDetail: 'Полная копия! N × sizeof(T) байт',
    mutable: 'Yes',
    runtime: 'compiler intrinsic',
    description: 'Полное копирование при передаче, фиксированный размер',
    memoryLayout: [
      '┌─────────────────────────────┐',
      '│ [4]int                      │',
      '│ ┌─────┬─────┬─────┬─────┐   │',
      '│ │  0  │  1  │  2  │  3  │   │',
      '│ └─────┴─────┴─────┴─────┘   │',
      '│     32 bytes (4 × 8)        │',
      '└─────────────────────────────┘',
      '     Stack или Heap'
    ]
  }
]

const selected = ref<string | null>(null)
const selectedStructure = computed(() =>
  structures.find(s => s.id === selected.value) || null
)

function selectStructure(id: string) {
  selected.value = selected.value === id ? null : id
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'value-with-ptr': return '#4ade80'
    case 'pointer': return '#60a5fa'
    case 'value': return '#fbbf24'
    default: return '#808080'
  }
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case 'value-with-ptr': return 'Value + Pointer'
    case 'pointer': return 'Pointer Type'
    case 'value': return 'Pure Value'
    default: return category
  }
}
</script>

<template>
  <div class="overview-diagram">
    <div class="diagram-header">
      <h3>Go Data Structures Memory Layout</h3>
    </div>

    <div class="main-layout">
      <!-- Structures grid -->
      <div class="structures-grid">
        <div
          v-for="s in structures"
          :key="s.id"
          class="structure-box"
          :class="{ selected: selected === s.id }"
          :style="{ borderColor: getCategoryColor(s.category) }"
          @click="selectStructure(s.id)"
        >
          <div class="structure-name">{{ s.name }}</div>
          <div class="structure-size">{{ s.headerSize }}</div>
          <div class="structure-category" :style="{ color: getCategoryColor(s.category) }">
            {{ getCategoryLabel(s.category) }}
          </div>
        </div>
      </div>

      <!-- Details panel -->
      <div class="details-panel">
        <template v-if="selectedStructure">
          <div class="detail-header" :style="{ borderColor: getCategoryColor(selectedStructure.category) }">
            <div class="detail-name">{{ selectedStructure.name }}</div>
            <div class="detail-category" :style="{ color: getCategoryColor(selectedStructure.category) }">
              {{ getCategoryLabel(selectedStructure.category) }}
            </div>
          </div>

          <div class="detail-body">
            <div class="detail-row">
              <span class="detail-label">Description:</span>
              <span class="detail-value">{{ selectedStructure.description }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Header Size:</span>
              <span class="detail-value code">{{ selectedStructure.headerSize }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Backing Storage:</span>
              <span class="detail-value">{{ selectedStructure.backingStorage }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Pass-by:</span>
              <span class="detail-value highlight">{{ selectedStructure.passbyDetail }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Mutable:</span>
              <span class="detail-value">{{ selectedStructure.mutable }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Runtime:</span>
              <span class="detail-value code">{{ selectedStructure.runtime }}</span>
            </div>
          </div>

          <!-- Memory layout visualization -->
          <div class="memory-layout">
            <div class="layout-title">Memory Layout</div>
            <pre class="layout-diagram"><code>{{ selectedStructure.memoryLayout.join('\n') }}</code></pre>
          </div>
        </template>
        <template v-else>
          <div class="detail-placeholder">
            Кликните на структуру для просмотра деталей
          </div>
        </template>
      </div>
    </div>

    <!-- Legend -->
    <div class="legend">
      <div class="legend-item">
        <div class="legend-color" style="background: #4ade80"></div>
        <span>Value + внутренний pointer (slice, string)</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #60a5fa"></div>
        <span>Pointer type (map)</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #fbbf24"></div>
        <span>Pure value type (array)</span>
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
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.structures-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.structure-box {
  padding: 16px;
  background: #252545;
  border: 2px solid;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.structure-box:hover {
  background: #2a2a4e;
  transform: translateY(-2px);
}

.structure-box.selected {
  background: #2a2a4e;
  box-shadow: 0 0 20px rgba(96, 165, 250, 0.3);
}

.structure-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}

.structure-size {
  font-size: 12px;
  color: #808080;
  margin-bottom: 8px;
}

.structure-category {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
}

.details-panel {
  background: #252545;
  border-radius: 8px;
  padding: 12px;
}

.detail-header {
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 2px solid;
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.detail-name {
  font-size: 18px;
  font-weight: 600;
}

.detail-category {
  font-size: 10px;
  text-transform: uppercase;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.detail-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
}

.detail-label {
  font-size: 10px;
  color: #606080;
  text-transform: uppercase;
  min-width: 100px;
  flex-shrink: 0;
}

.detail-value {
  font-size: 11px;
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

.memory-layout {
  background: #1a1a2e;
  border-radius: 6px;
  padding: 8px;
}

.layout-title {
  font-size: 10px;
  color: #606080;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.layout-diagram {
  margin: 0;
  font-size: 10px;
  line-height: 1.3;
  color: #4ade80;
  overflow-x: auto;
}

.layout-diagram code {
  font-family: 'JetBrains Mono', monospace;
}

.detail-value.highlight {
  color: #fbbf24;
  font-weight: 500;
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

@media (max-width: 900px) {
  .main-layout {
    grid-template-columns: 1fr;
  }

  .structures-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 500px) {
  .structures-grid {
    grid-template-columns: 1fr;
  }
}
</style>
