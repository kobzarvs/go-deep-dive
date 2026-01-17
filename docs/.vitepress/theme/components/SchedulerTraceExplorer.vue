<script setup lang="ts">
import { ref, computed } from 'vue'

interface TraceField {
  name: string
  value: string
  description: string
  status: 'ok' | 'warning' | 'danger'
  details: string
}

interface TraceExample {
  id: string
  label: string
  raw: string
  fields: TraceField[]
  diagnosis: string
}

const examples: TraceExample[] = [
  {
    id: 'healthy',
    label: 'Здоровая система',
    raw: 'SCHED 1004ms: gomaxprocs=4 idleprocs=1 threads=5 spinningthreads=1 needspinning=0 idlethreads=0 runqueue=0 [3 2 1 0]',
    fields: [
      { name: 'SCHED', value: '1004ms', description: 'Время с запуска программы', status: 'ok', details: 'Точка снятия метрики' },
      { name: 'gomaxprocs', value: '4', description: 'Количество логических процессоров (P)', status: 'ok', details: 'Обычно равно числу CPU cores' },
      { name: 'idleprocs', value: '1', description: 'Простаивающих P', status: 'ok', details: '25% idle — нормально для IO-bound' },
      { name: 'threads', value: '5', description: 'Всего OS threads (M)', status: 'ok', details: 'threads ≈ gomaxprocs + системные' },
      { name: 'spinningthreads', value: '1', description: 'M в spinning (ищут работу)', status: 'ok', details: '1 spinning — готов подхватить работу' },
      { name: 'needspinning', value: '0', description: 'Нужны ли ещё spinning M', status: 'ok', details: '0 — достаточно spinning threads' },
      { name: 'idlethreads', value: '0', description: 'Припаркованных M', status: 'ok', details: '0 idle — все M активны' },
      { name: 'runqueue', value: '0', description: 'Горутин в Global Run Queue', status: 'ok', details: 'Пустая GRQ — горутины распределены по P' },
      { name: '[3 2 1 0]', value: 'LRQ', description: 'Local Run Queue каждого P', status: 'ok', details: 'P0=3, P1=2, P2=1, P3=0 — хорошее распределение' },
    ],
    diagnosis: '✅ Система здорова: нагрузка распределена равномерно, GRQ пуста, есть spinning thread для быстрого подхвата новых горутин.',
  },
  {
    id: 'overloaded',
    label: 'Перегрузка',
    raw: 'SCHED 5023ms: gomaxprocs=4 idleprocs=0 threads=12 spinningthreads=0 needspinning=1 idlethreads=4 runqueue=847 [256 256 256 256]',
    fields: [
      { name: 'SCHED', value: '5023ms', description: 'Время с запуска программы', status: 'ok', details: 'Точка снятия метрики' },
      { name: 'gomaxprocs', value: '4', description: 'Количество логических процессоров (P)', status: 'ok', details: '4 P для обработки' },
      { name: 'idleprocs', value: '0', description: 'Простаивающих P', status: 'warning', details: '0 idle — все P загружены на 100%' },
      { name: 'threads', value: '12', description: 'Всего OS threads (M)', status: 'danger', details: '12 >> 4 — много blocked syscalls!' },
      { name: 'spinningthreads', value: '0', description: 'M в spinning (ищут работу)', status: 'danger', details: 'Нет spinning — все заняты!' },
      { name: 'needspinning', value: '1', description: 'Нужны ли ещё spinning M', status: 'danger', details: 'Система просит spinning, но все заняты' },
      { name: 'idlethreads', value: '4', description: 'Припаркованных M', status: 'warning', details: '4 idle после blocking syscalls' },
      { name: 'runqueue', value: '847', description: 'Горутин в Global Run Queue', status: 'danger', details: '847 горутин ждут! Сильная перегрузка' },
      { name: '[256 256 256 256]', value: 'LRQ', description: 'Local Run Queue каждого P', status: 'danger', details: 'Все LRQ переполнены (max 256)' },
    ],
    diagnosis: '🔴 Критическая перегрузка: 847+ горутин в очереди, все LRQ переполнены. Причины: слишком много горутин или blocking операции. Решение: добавить rate limiting, использовать worker pools, оптимизировать IO.',
  },
  {
    id: 'syscall_heavy',
    label: 'Много syscalls',
    raw: 'SCHED 2156ms: gomaxprocs=8 idleprocs=6 threads=24 spinningthreads=0 needspinning=0 idlethreads=14 runqueue=0 [0 0 0 0 0 0 0 0]',
    fields: [
      { name: 'SCHED', value: '2156ms', description: 'Время с запуска программы', status: 'ok', details: 'Точка снятия метрики' },
      { name: 'gomaxprocs', value: '8', description: 'Количество логических процессоров (P)', status: 'ok', details: '8 P настроено' },
      { name: 'idleprocs', value: '6', description: 'Простаивающих P', status: 'warning', details: '75% P простаивают — IO-bound?' },
      { name: 'threads', value: '24', description: 'Всего OS threads (M)', status: 'danger', details: '24 = 3x gomaxprocs! Много blocking syscalls' },
      { name: 'spinningthreads', value: '0', description: 'M в spinning', status: 'ok', details: 'Нет работы — не нужны spinning' },
      { name: 'needspinning', value: '0', description: 'Нужны ли ещё spinning M', status: 'ok', details: 'Всё тихо' },
      { name: 'idlethreads', value: '14', description: 'Припаркованных M', status: 'warning', details: '14 threads простаивают после syscalls' },
      { name: 'runqueue', value: '0', description: 'Горутин в Global Run Queue', status: 'ok', details: 'GRQ пуста' },
      { name: '[0 0 0 0 0 0 0 0]', value: 'LRQ', description: 'Local Run Queue каждого P', status: 'ok', details: 'Все LRQ пусты — IO wait' },
    ],
    diagnosis: '⚠️ IO-bound нагрузка: threads >> gomaxprocs указывает на много blocking syscalls (file IO, CGO, etc). 6 из 8 P простаивают. Если это ожидаемо — ОК. Иначе: используйте async IO, connection pooling.',
  },
]

const selectedExample = ref<string>('healthy')
const hoveredField = ref<string | null>(null)

const currentExample = computed(() => {
  return examples.find(e => e.id === selectedExample.value) || examples[0]
})

function getStatusClass(status: string) {
  return {
    ok: 'status-ok',
    warning: 'status-warning',
    danger: 'status-danger',
  }[status] || ''
}

function highlightRaw(raw: string, fieldName: string | null): string {
  if (!fieldName) return raw

  // Map field names to their patterns in the raw string
  const patterns: Record<string, RegExp> = {
    'SCHED': /SCHED \d+ms/,
    'gomaxprocs': /gomaxprocs=\d+/,
    'idleprocs': /idleprocs=\d+/,
    'threads': /threads=\d+/,
    'spinningthreads': /spinningthreads=\d+/,
    'needspinning': /needspinning=\d+/,
    'idlethreads': /idlethreads=\d+/,
    'runqueue': /runqueue=\d+/,
    '[3 2 1 0]': /\[\d+ \d+ \d+ \d+\]/,
    '[256 256 256 256]': /\[\d+ \d+ \d+ \d+ \d+ \d+ \d+ \d+\]|\[\d+ \d+ \d+ \d+\]/,
    '[0 0 0 0 0 0 0 0]': /\[\d+ \d+ \d+ \d+ \d+ \d+ \d+ \d+\]|\[\d+ \d+ \d+ \d+\]/,
  }

  const pattern = patterns[fieldName]
  if (!pattern) return raw

  return raw.replace(pattern, match => `<mark>${match}</mark>`)
}
</script>

<template>
  <div class="trace-explorer">
    <div class="explorer-header">
      <h3>Scheduler Trace Explorer</h3>
      <div class="example-selector">
        <button
          v-for="example in examples"
          :key="example.id"
          :class="['example-btn', { active: selectedExample === example.id }]"
          @click="selectedExample = example.id"
        >
          {{ example.label }}
        </button>
      </div>
    </div>

    <!-- Raw output -->
    <div class="raw-output">
      <div class="raw-label">GODEBUG=schedtrace=1000 ./app</div>
      <pre class="raw-trace" v-html="highlightRaw(currentExample.raw, hoveredField)"></pre>
    </div>

    <!-- Fields breakdown -->
    <div class="fields-container">
      <div class="fields-header">Разбор полей (наведите для подробностей)</div>
      <div class="fields-grid">
        <div
          v-for="field in currentExample.fields"
          :key="field.name"
          :class="['field-card', getStatusClass(field.status)]"
          @mouseenter="hoveredField = field.name"
          @mouseleave="hoveredField = null"
        >
          <div class="field-header">
            <span class="field-name">{{ field.name }}</span>
            <span :class="['field-value', getStatusClass(field.status)]">{{ field.value }}</span>
          </div>
          <div class="field-desc">{{ field.description }}</div>
          <Transition name="details">
            <div v-if="hoveredField === field.name" class="field-details">
              {{ field.details }}
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Diagnosis -->
    <div :class="['diagnosis', currentExample.id]">
      <div class="diagnosis-label">Диагностика</div>
      <div class="diagnosis-text">{{ currentExample.diagnosis }}</div>
    </div>

    <!-- Usage hint -->
    <div class="usage-hint">
      <div class="hint-header">Как использовать schedtrace</div>
      <div class="hint-content">
        <code>GODEBUG=schedtrace=1000 ./app</code> — вывод каждые 1000ms<br>
        <code>GODEBUG=schedtrace=1000,scheddetail=1 ./app</code> — детальный вывод с каждым P
      </div>
    </div>
  </div>
</template>

<style scoped>
.trace-explorer {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.explorer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.explorer-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.example-selector {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.example-btn {
  padding: 6px 12px;
  background: #2a2a4e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  color: #a0a0a0;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  transition: all 0.2s ease;
}

.example-btn:hover {
  background: #3a3a5e;
  color: #e0e0e0;
}

.example-btn.active {
  background: #4ecdc4;
  border-color: #4ecdc4;
  color: #0a0a0a;
}

/* Raw output */
.raw-output {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 20px;
}

.raw-label {
  background: #252545;
  padding: 8px 12px;
  font-size: 11px;
  color: #808080;
}

.raw-trace {
  padding: 12px 16px;
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.raw-trace :deep(mark) {
  background: rgba(251, 191, 36, 0.3);
  color: #fbbf24;
  padding: 2px 4px;
  border-radius: 2px;
}

/* Fields */
.fields-container {
  margin-bottom: 20px;
}

.fields-header {
  font-size: 12px;
  color: #808080;
  margin-bottom: 12px;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.field-card {
  background: #252545;
  border: 1px solid #3a3a5e;
  border-radius: 6px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.field-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.field-card.status-ok {
  border-left: 3px solid #4ade80;
}

.field-card.status-warning {
  border-left: 3px solid #fbbf24;
}

.field-card.status-danger {
  border-left: 3px solid #f87171;
}

.field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.field-name {
  font-size: 11px;
  color: #a0a0a0;
}

.field-value {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
}

.field-value.status-ok {
  background: #166534;
  color: #4ade80;
}

.field-value.status-warning {
  background: #713f12;
  color: #fbbf24;
}

.field-value.status-danger {
  background: #7f1d1d;
  color: #f87171;
}

.field-desc {
  font-size: 10px;
  color: #808080;
}

.field-details {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #3a3a5e;
  font-size: 10px;
  color: #4ecdc4;
}

/* Diagnosis */
.diagnosis {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

.diagnosis.healthy {
  border-left: 4px solid #4ade80;
}

.diagnosis.overloaded {
  border-left: 4px solid #f87171;
}

.diagnosis.syscall_heavy {
  border-left: 4px solid #fbbf24;
}

.diagnosis-label {
  font-size: 11px;
  color: #808080;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.diagnosis-text {
  font-size: 12px;
  line-height: 1.6;
}

/* Usage hint */
.usage-hint {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
}

.hint-header {
  font-size: 11px;
  color: #808080;
  margin-bottom: 8px;
}

.hint-content {
  font-size: 11px;
  line-height: 1.8;
}

.hint-content code {
  background: #252545;
  padding: 2px 6px;
  border-radius: 3px;
  color: #4ecdc4;
}

/* Transitions */
.details-enter-active,
.details-leave-active {
  transition: all 0.2s ease;
}

.details-enter-from,
.details-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

@media (max-width: 600px) {
  .fields-grid {
    grid-template-columns: 1fr;
  }

  .example-selector {
    width: 100%;
  }

  .example-btn {
    flex: 1;
    text-align: center;
  }
}
</style>
