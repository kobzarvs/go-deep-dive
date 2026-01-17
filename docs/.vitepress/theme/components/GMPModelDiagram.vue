<script setup lang="ts">
import { ref } from 'vue'

const showStructs = ref(false)
const hoveredElement = ref<string | null>(null)

const gFields = [
  { name: 'stack', type: 'stack', desc: 'Границы стека (lo, hi)' },
  { name: 'stackguard0', type: 'uintptr', desc: 'Для проверки переполнения стека' },
  { name: 'atomicstatus', type: 'atomic.Uint32', desc: 'Состояние горутины (_Grunnable, _Grunning, ...)' },
  { name: 'm', type: '*m', desc: 'Текущий M, выполняющий эту G' },
  { name: 'sched', type: 'gobuf', desc: 'Контекст планировщика (SP, PC, BP)' },
  { name: 'preempt', type: 'bool', desc: 'Флаг запроса на preemption' },
  { name: 'preemptStop', type: 'bool', desc: 'Остановка для STW' },
  { name: 'lockedm', type: '*m', desc: 'LockOSThread() привязка' },
  { name: 'waiting', type: '*sudog', desc: 'Список ожидания (каналы, селекты)' },
]

const mFields = [
  { name: 'g0', type: '*g', desc: 'Системная горутина для scheduler' },
  { name: 'curg', type: '*g', desc: 'Текущая пользовательская горутина' },
  { name: 'p', type: '*p', desc: 'Привязанный P (nil если нет)' },
  { name: 'nextp', type: '*p', desc: 'P для следующего запуска' },
  { name: 'oldp', type: '*p', desc: 'P перед syscall' },
  { name: 'spinning', type: 'bool', desc: 'Ищет работу (work stealing)' },
  { name: 'blocked', type: 'bool', desc: 'Заблокирован на syscall' },
  { name: 'park', type: 'note', desc: 'Семафор для parking' },
  { name: 'schedlink', type: '*m', desc: 'Linked list idle M' },
]

const pFields = [
  { name: 'status', type: 'uint32', desc: '_Pidle, _Prunning, _Psyscall, _Pgcstop' },
  { name: 'm', type: '*m', desc: 'Привязанный M (nil если idle)' },
  { name: 'runqhead', type: 'uint32', desc: 'Голова circular buffer LRQ' },
  { name: 'runqtail', type: 'uint32', desc: 'Хвост circular buffer LRQ' },
  { name: 'runq', type: '[256]guintptr', desc: 'Local Run Queue (lock-free)' },
  { name: 'runnext', type: 'guintptr', desc: 'Следующая G для запуска (fast path)' },
  { name: 'gFree', type: 'gList', desc: 'Кэш свободных G' },
  { name: 'mcache', type: '*mcache', desc: 'Кэш аллокатора для этого P' },
  { name: 'gcBgMarkWorker', type: '*g', desc: 'GC background mark worker' },
]

function setHover(element: string | null) {
  hoveredElement.value = element
}
</script>

<template>
  <div class="gmp-diagram">
    <div class="diagram-header">
      <h3>G-M-P Model</h3>
      <button class="toggle-btn" @click="showStructs = !showStructs">
        {{ showStructs ? 'Скрыть структуры' : 'Показать структуры' }}
      </button>
    </div>

    <div class="diagram-container">
      <!-- P Layer -->
      <div class="layer p-layer">
        <div class="layer-label">P (Processor) — GOMAXPROCS штук</div>
        <div class="elements-row">
          <div
            v-for="i in 4"
            :key="'p' + i"
            :class="['element', 'p-element', { highlighted: hoveredElement === 'p' }]"
            @mouseenter="setHover('p')"
            @mouseleave="setHover(null)"
          >
            <div class="element-header">P{{ i - 1 }}</div>
            <div class="element-body">
              <div class="lrq">
                <span class="lrq-label">LRQ</span>
                <div class="lrq-slots">
                  <div v-for="j in (i === 1 ? 5 : i === 2 ? 2 : i === 3 ? 3 : 0)" :key="j" class="g-mini">G</div>
                  <div v-if="i === 1 || i === 3" class="slot-more">...</div>
                </div>
              </div>
              <div class="runnext">
                <span class="runnext-label">runnext:</span>
                <span v-if="i <= 3" class="g-mini small">G</span>
                <span v-else class="nil">nil</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Arrows P → M -->
      <div class="arrows-row">
        <svg class="arrows-svg" viewBox="0 0 800 40">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#4ecdc4" />
            </marker>
          </defs>
          <line x1="100" y1="5" x2="100" y2="35" stroke="#4ecdc4" stroke-width="2" marker-end="url(#arrowhead)" />
          <line x1="300" y1="5" x2="300" y2="35" stroke="#4ecdc4" stroke-width="2" marker-end="url(#arrowhead)" />
          <line x1="500" y1="5" x2="500" y2="35" stroke="#4ecdc4" stroke-width="2" marker-end="url(#arrowhead)" />
          <line x1="700" y1="5" x2="620" y2="35" stroke="#4ecdc4" stroke-width="2" stroke-dasharray="4" />
          <text x="650" y="25" fill="#808080" font-size="10">idle</text>
        </svg>
      </div>

      <!-- M Layer -->
      <div class="layer m-layer">
        <div class="layer-label">M (Machine) — OS Threads</div>
        <div class="elements-row">
          <div
            v-for="i in 4"
            :key="'m' + i"
            :class="['element', 'm-element', { highlighted: hoveredElement === 'm', idle: i === 4 }]"
            @mouseenter="setHover('m')"
            @mouseleave="setHover(null)"
          >
            <div class="element-header">M{{ i - 1 }}</div>
            <div class="element-body">
              <div class="m-info">
                <span class="m-label">curg:</span>
                <span v-if="i <= 3" class="g-mini small">G</span>
                <span v-else class="nil">nil</span>
              </div>
              <div class="m-info">
                <span class="m-label">{{ i === 4 ? 'spinning' : 'running' }}</span>
              </div>
            </div>
          </div>
          <div class="idle-pool">
            <div class="idle-label">idle M pool</div>
            <div class="idle-m">M4</div>
            <div class="idle-m">M5</div>
          </div>
        </div>
      </div>

      <!-- G Layer (running) -->
      <div class="layer g-layer">
        <div class="layer-label">G (Goroutine) — выполняются на M</div>
        <div class="elements-row g-row">
          <div
            v-for="i in 3"
            :key="'g' + i"
            :class="['element', 'g-element', { highlighted: hoveredElement === 'g' }]"
            @mouseenter="setHover('g')"
            @mouseleave="setHover(null)"
          >
            <div class="element-header">G{{ i * 100 + i }}</div>
            <div class="element-body">
              <div class="g-info">
                <span class="status running">_Grunning</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Global Run Queue -->
      <div class="layer grq-layer">
        <div class="layer-label">Global Run Queue</div>
        <div
          :class="['grq-container', { highlighted: hoveredElement === 'grq' }]"
          @mouseenter="setHover('grq')"
          @mouseleave="setHover(null)"
        >
          <div class="grq-content">
            <div v-for="i in 5" :key="'grq' + i" class="g-mini">G</div>
            <span class="grq-arrow">→</span>
            <span class="grq-more">...</span>
          </div>
          <div class="grq-info">Linked list • Overflow + orphaned G</div>
        </div>
      </div>
    </div>

    <!-- Структуры runtime -->
    <Transition name="structs">
      <div v-if="showStructs" class="structs-panel">
        <div class="struct-card g-struct">
          <div class="struct-header">
            <span class="struct-name">runtime.g</span>
            <span class="struct-file">runtime/runtime2.go</span>
          </div>
          <div class="struct-fields">
            <div v-for="field in gFields" :key="field.name" class="field">
              <span class="field-name">{{ field.name }}</span>
              <span class="field-type">{{ field.type }}</span>
              <span class="field-desc">{{ field.desc }}</span>
            </div>
          </div>
        </div>

        <div class="struct-card m-struct">
          <div class="struct-header">
            <span class="struct-name">runtime.m</span>
            <span class="struct-file">runtime/runtime2.go</span>
          </div>
          <div class="struct-fields">
            <div v-for="field in mFields" :key="field.name" class="field">
              <span class="field-name">{{ field.name }}</span>
              <span class="field-type">{{ field.type }}</span>
              <span class="field-desc">{{ field.desc }}</span>
            </div>
          </div>
        </div>

        <div class="struct-card p-struct">
          <div class="struct-header">
            <span class="struct-name">runtime.p</span>
            <span class="struct-file">runtime/runtime2.go</span>
          </div>
          <div class="struct-fields">
            <div v-for="field in pFields" :key="field.name" class="field">
              <span class="field-name">{{ field.name }}</span>
              <span class="field-type">{{ field.type }}</span>
              <span class="field-desc">{{ field.desc }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Легенда -->
    <div class="legend">
      <div class="legend-item">
        <div class="legend-color p-color"></div>
        <span>P — логический процессор, контекст выполнения</span>
      </div>
      <div class="legend-item">
        <div class="legend-color m-color"></div>
        <span>M — OS thread, выполняет код</span>
      </div>
      <div class="legend-item">
        <div class="legend-color g-color"></div>
        <span>G — горутина, единица работы</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gmp-diagram {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.diagram-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.diagram-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.toggle-btn {
  padding: 8px 16px;
  background: #3a3a5e;
  border: 1px solid #4a4a7e;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s ease;
}

.toggle-btn:hover {
  background: #4a4a7e;
}

.diagram-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.layer {
  padding: 16px;
  border-radius: 6px;
  background: #252545;
}

.layer-label {
  font-size: 11px;
  color: #808080;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.elements-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.element {
  border-radius: 6px;
  padding: 10px;
  min-width: 120px;
  transition: all 0.2s ease;
}

.element.highlighted {
  transform: scale(1.02);
  box-shadow: 0 0 20px rgba(78, 205, 196, 0.3);
}

.element-header {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  text-align: center;
}

.element-body {
  font-size: 11px;
}

/* P Elements */
.p-element {
  background: linear-gradient(135deg, #1a3a5a, #2a4a6a);
  border: 1px solid #3a5a7a;
}

.p-element .element-header {
  color: #60a5fa;
}

.lrq {
  background: #0d1a2a;
  border-radius: 4px;
  padding: 6px;
  margin-bottom: 6px;
}

.lrq-label {
  font-size: 9px;
  color: #606080;
  display: block;
  margin-bottom: 4px;
}

.lrq-slots {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.g-mini {
  background: #4ade80;
  color: #0a0a0a;
  padding: 2px 4px;
  border-radius: 2px;
  font-size: 8px;
  font-weight: 600;
}

.g-mini.small {
  padding: 1px 3px;
  font-size: 7px;
}

.slot-more {
  color: #606080;
  font-size: 8px;
}

.runnext {
  display: flex;
  align-items: center;
  gap: 4px;
}

.runnext-label {
  color: #606080;
  font-size: 9px;
}

.nil {
  color: #f87171;
  font-size: 9px;
}

/* M Elements */
.m-element {
  background: linear-gradient(135deg, #3a2a1a, #4a3a2a);
  border: 1px solid #5a4a3a;
}

.m-element.idle {
  opacity: 0.6;
  border-style: dashed;
}

.m-element .element-header {
  color: #fbbf24;
}

.m-info {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.m-label {
  color: #606080;
  font-size: 9px;
}

.idle-pool {
  background: #1a1a2e;
  border: 1px dashed #3a3a5e;
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.idle-label {
  font-size: 9px;
  color: #606080;
}

.idle-m {
  background: #2a2a4e;
  color: #808080;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
}

/* G Elements */
.g-element {
  background: linear-gradient(135deg, #1a3a1a, #2a4a2a);
  border: 1px solid #3a5a3a;
}

.g-element .element-header {
  color: #4ade80;
}

.g-row {
  justify-content: flex-start;
  padding-left: 60px;
}

.g-info {
  text-align: center;
}

.status {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 9px;
}

.status.running {
  background: #166534;
  color: #4ade80;
}

/* GRQ */
.grq-layer {
  background: #1a1a2e;
}

.grq-container {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
  transition: all 0.2s ease;
}

.grq-container.highlighted {
  border-color: #4ecdc4;
  box-shadow: 0 0 10px rgba(78, 205, 196, 0.2);
}

.grq-content {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.grq-arrow {
  color: #606080;
}

.grq-more {
  color: #606080;
  font-size: 12px;
}

.grq-info {
  font-size: 10px;
  color: #606080;
}

/* Arrows */
.arrows-row {
  height: 40px;
  display: flex;
  justify-content: center;
}

.arrows-svg {
  width: 100%;
  max-width: 800px;
  height: 40px;
}

/* Structs Panel */
.structs-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #2a2a4e;
}

.struct-card {
  background: #0d0d1a;
  border-radius: 6px;
  overflow: hidden;
}

.struct-header {
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.g-struct .struct-header {
  background: #1a3a1a;
}

.m-struct .struct-header {
  background: #3a2a1a;
}

.p-struct .struct-header {
  background: #1a3a5a;
}

.struct-name {
  font-weight: 600;
  font-size: 13px;
}

.g-struct .struct-name {
  color: #4ade80;
}

.m-struct .struct-name {
  color: #fbbf24;
}

.p-struct .struct-name {
  color: #60a5fa;
}

.struct-file {
  font-size: 9px;
  color: #606080;
}

.struct-fields {
  padding: 8px 12px;
}

.field {
  display: grid;
  grid-template-columns: 100px 100px 1fr;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid #1a1a2e;
  font-size: 10px;
}

.field:last-child {
  border-bottom: none;
}

.field-name {
  color: #e0e0e0;
}

.field-type {
  color: #4ecdc4;
}

.field-desc {
  color: #808080;
}

/* Legend */
.legend {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #2a2a4e;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #a0a0a0;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.p-color {
  background: #60a5fa;
}

.m-color {
  background: #fbbf24;
}

.g-color {
  background: #4ade80;
}

/* Transitions */
.structs-enter-active,
.structs-leave-active {
  transition: all 0.3s ease;
}

.structs-enter-from,
.structs-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 600px) {
  .elements-row {
    flex-direction: column;
    align-items: stretch;
  }

  .element {
    min-width: auto;
  }

  .g-row {
    padding-left: 0;
  }

  .field {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
