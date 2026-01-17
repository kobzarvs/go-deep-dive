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
    raw: 'gc 1 @0.004s 2%: 0.019+0.35+0.003 ms clock, 0.076+0.10/0.32/0.065+0.012 ms cpu, 4->4->0 MB, 4 MB goal, 0 MB stacks, 0 MB globals, 4 P',
    fields: [
      { name: 'gc 1', value: '1', description: 'Номер GC цикла', status: 'ok', details: 'Первый GC цикл с момента старта' },
      { name: '@0.004s', value: '0.004s', description: 'Время с запуска', status: 'ok', details: 'GC запустился через 4ms после старта программы' },
      { name: '2%', value: '2%', description: 'CPU время на GC', status: 'ok', details: '2% CPU использовано для GC — отлично' },
      { name: '0.019+0.35+0.003 ms clock', value: 'clock', description: 'Wall clock time фаз', status: 'ok', details: 'STW1=19μs, concurrent mark=350μs, STW2=3μs' },
      { name: '0.076+0.10/0.32/0.065+0.012 ms cpu', value: 'cpu', description: 'CPU time по фазам', status: 'ok', details: 'assist=100μs, dedicated=320μs, idle=65μs' },
      { name: '4->4->0 MB', value: 'heap', description: 'Heap: before→after→live', status: 'ok', details: '4MB до GC, 4MB после, 0MB живых — почти всё garbage' },
      { name: '4 MB goal', value: 'goal', description: 'Heap goal', status: 'ok', details: 'Цель для следующего trigger = 4MB' },
      { name: '0 MB stacks', value: 'stacks', description: 'Стеки горутин', status: 'ok', details: 'Память стеков горутин (в heap)' },
      { name: '4 P', value: '4 P', description: 'Количество P', status: 'ok', details: '4 процессора = GOMAXPROCS' },
    ],
    diagnosis: '✅ Идеальный GC: STW < 100μs, CPU overhead 2%, почти весь heap — garbage. Система работает эффективно.',
  },
  {
    id: 'high_stw',
    label: 'Высокий STW',
    raw: 'gc 15 @1.234s 8%: 2.1+45+1.8 ms clock, 8.4+12/38/2.1+7.2 ms cpu, 128->156->98 MB, 180 MB goal, 12 MB stacks, 4 MB globals, 4 P',
    fields: [
      { name: 'gc 15', value: '15', description: 'Номер GC цикла', status: 'ok', details: '15-й цикл GC' },
      { name: '@1.234s', value: '1.234s', description: 'Время с запуска', status: 'ok', details: 'GC через 1.2 секунды' },
      { name: '8%', value: '8%', description: 'CPU время на GC', status: 'warning', details: '8% CPU на GC — повышено, следите за трендом' },
      { name: '2.1+45+1.8 ms clock', value: 'clock', description: 'Wall clock time', status: 'danger', details: 'STW1=2.1ms! STW2=1.8ms! Слишком долго' },
      { name: '8.4+12/38/2.1+7.2 ms cpu', value: 'cpu', description: 'CPU time', status: 'warning', details: 'Много времени на assist (12ms) — приложение помогает GC' },
      { name: '128->156->98 MB', value: 'heap', description: 'Heap size', status: 'warning', details: '98MB живых из 156MB — 63% retention' },
      { name: '180 MB goal', value: 'goal', description: 'Heap goal', status: 'ok', details: 'Goal = 180MB для следующего GC' },
      { name: '12 MB stacks', value: 'stacks', description: 'Стеки горутин', status: 'warning', details: '12MB стеков — много горутин или глубокая рекурсия' },
      { name: '4 P', value: '4 P', description: 'Количество P', status: 'ok', details: '4 процессора' },
    ],
    diagnosis: '⚠️ Проблема: STW паузы > 2ms. Причины: много goroutines (12MB стеков), большой heap (98MB live). Решения: уменьшить количество goroutines, проверить утечки памяти, рассмотреть GOMEMLIMIT.',
  },
  {
    id: 'memory_pressure',
    label: 'Memory Pressure',
    raw: 'gc 847 @120.5s 25%: 0.15+180+0.089 ms clock, 0.60+450/175/12+0.35 ms cpu, 1890->1950->1870 MB, 1900 MB goal (forced), 45 MB stacks, 8 MB globals, 4 P',
    fields: [
      { name: 'gc 847', value: '847', description: 'Номер GC цикла', status: 'danger', details: '847 циклов за 2 минуты = ~7 GC/sec!' },
      { name: '@120.5s', value: '120.5s', description: 'Время с запуска', status: 'ok', details: '2 минуты работы' },
      { name: '25%', value: '25%', description: 'CPU время на GC', status: 'danger', details: '25% CPU на GC — критически много!' },
      { name: '0.15+180+0.089 ms clock', value: 'clock', description: 'Wall clock time', status: 'warning', details: 'Concurrent mark = 180ms — долго' },
      { name: '0.60+450/175/12+0.35 ms cpu', value: 'cpu', description: 'CPU time', status: 'danger', details: 'assist=450ms! Приложение тратит больше на GC assist чем на работу' },
      { name: '1890->1950->1870 MB', value: 'heap', description: 'Heap size', status: 'danger', details: '1870MB live из 1950MB — 96% retention! Нет мусора' },
      { name: '1900 MB goal (forced)', value: 'goal', description: 'Heap goal', status: 'danger', details: '(forced) = GOMEMLIMIT достигнут, GC принудительный' },
      { name: '45 MB stacks', value: 'stacks', description: 'Стеки', status: 'warning', details: '45MB стеков = тысячи горутин' },
      { name: '4 P', value: '4 P', description: 'Количество P', status: 'ok', details: '4 процессора' },
    ],
    diagnosis: '🔴 Критическая ситуация: (forced) GC из-за GOMEMLIMIT, 96% heap — живые данные, 25% CPU на GC. Приложение захлёбывается. Решения: увеличить GOMEMLIMIT, уменьшить потребление памяти, использовать off-heap storage.',
  },
  {
    id: 'frequent_gc',
    label: 'Частый GC',
    raw: 'gc 1542 @30.1s 15%: 0.008+0.45+0.004 ms clock, 0.032+0.08/0.40/0.02+0.016 ms cpu, 8->8->4 MB, 8 MB goal, 2 MB stacks, 1 MB globals, 4 P',
    fields: [
      { name: 'gc 1542', value: '1542', description: 'Номер GC цикла', status: 'danger', details: '1542 GC за 30 секунд = 51 GC/sec!' },
      { name: '@30.1s', value: '30.1s', description: 'Время с запуска', status: 'ok', details: '30 секунд работы' },
      { name: '15%', value: '15%', description: 'CPU время на GC', status: 'warning', details: '15% CPU — много для маленького heap' },
      { name: '0.008+0.45+0.004 ms clock', value: 'clock', description: 'Wall clock time', status: 'ok', details: 'STW отличные (<10μs), но слишком часто' },
      { name: '0.032+...', value: 'cpu', description: 'CPU time', status: 'ok', details: 'CPU time в норме' },
      { name: '8->8->4 MB', value: 'heap', description: 'Heap size', status: 'warning', details: 'Маленький heap, но 50% garbage каждый раз' },
      { name: '8 MB goal', value: 'goal', description: 'Heap goal', status: 'warning', details: 'Очень низкий goal = частые GC' },
      { name: '2 MB stacks', value: 'stacks', description: 'Стеки', status: 'ok', details: 'Стеки в норме' },
      { name: '4 P', value: '4 P', description: 'Количество P', status: 'ok', details: '4 процессора' },
    ],
    diagnosis: '⚠️ High allocation rate: 51 GC/sec означает ~200MB/sec allocations при GOGC=100. STW хорошие, но overhead 15%. Решения: увеличить GOGC, использовать sync.Pool, pre-allocate, уменьшить allocations.',
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
  if (!fieldName) return escapeHtml(raw)

  const patterns: Record<string, RegExp> = {
    'gc 1': /gc \d+/,
    'gc 15': /gc \d+/,
    'gc 847': /gc \d+/,
    'gc 1542': /gc \d+/,
    '@0.004s': /@[\d.]+s/,
    '@1.234s': /@[\d.]+s/,
    '@120.5s': /@[\d.]+s/,
    '@30.1s': /@[\d.]+s/,
    '2%': /\d+%:/,
    '8%': /\d+%:/,
    '25%': /\d+%:/,
    '15%': /\d+%:/,
    '0.019+0.35+0.003 ms clock': /[\d.]+\+[\d.]+\+[\d.]+ ms clock/,
    '2.1+45+1.8 ms clock': /[\d.]+\+[\d.]+\+[\d.]+ ms clock/,
    '0.15+180+0.089 ms clock': /[\d.]+\+[\d.]+\+[\d.]+ ms clock/,
    '0.008+0.45+0.004 ms clock': /[\d.]+\+[\d.]+\+[\d.]+ ms clock/,
    '0.076+0.10/0.32/0.065+0.012 ms cpu': /[\d.]+\+[\d.]+\/[\d.]+\/[\d.]+\+[\d.]+ ms cpu/,
    '8.4+12/38/2.1+7.2 ms cpu': /[\d.]+\+[\d.]+\/[\d.]+\/[\d.]+\+[\d.]+ ms cpu/,
    '0.60+450/175/12+0.35 ms cpu': /[\d.]+\+[\d.]+\/[\d.]+\/[\d.]+\+[\d.]+ ms cpu/,
    '0.032+...': /[\d.]+\+[\d.]+\/[\d.]+\/[\d.]+\+[\d.]+ ms cpu/,
    '4->4->0 MB': /\d+->[\d]+->[\d]+ MB/,
    '128->156->98 MB': /\d+->[\d]+->[\d]+ MB/,
    '1890->1950->1870 MB': /\d+->[\d]+->[\d]+ MB/,
    '8->8->4 MB': /\d+->[\d]+->[\d]+ MB/,
    '4 MB goal': /\d+ MB goal/,
    '180 MB goal': /\d+ MB goal/,
    '1900 MB goal (forced)': /\d+ MB goal( \(forced\))?/,
    '8 MB goal': /\d+ MB goal/,
    '0 MB stacks': /\d+ MB stacks/,
    '12 MB stacks': /\d+ MB stacks/,
    '45 MB stacks': /\d+ MB stacks/,
    '2 MB stacks': /\d+ MB stacks/,
    '4 P': /\d+ P$/,
  }

  const pattern = patterns[fieldName]
  if (!pattern) return escapeHtml(raw)

  const escaped = escapeHtml(raw)
  return escaped.replace(pattern, match => `<mark>${match}</mark>`)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
</script>

<template>
  <div class="gc-trace-explorer">
    <div class="explorer-header">
      <h3>GC Trace Explorer</h3>
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
      <div class="raw-label">GODEBUG=gctrace=1 ./app</div>
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

    <!-- Format explanation -->
    <div class="format-section">
      <div class="format-header">Формат gctrace</div>
      <div class="format-content">
        <div class="format-line">
          <code>gc {N} @{time}s {cpu}%: {STW1}+{mark}+{STW2} ms clock</code>
        </div>
        <div class="format-desc">
          <span class="fmt-item"><strong>STW1</strong> — Stop-The-World mark setup</span>
          <span class="fmt-item"><strong>mark</strong> — concurrent marking</span>
          <span class="fmt-item"><strong>STW2</strong> — mark termination</span>
        </div>
        <div class="format-line mt">
          <code>{assist}+{dedicated}/{fractional}/{idle}+{term} ms cpu</code>
        </div>
        <div class="format-desc">
          <span class="fmt-item"><strong>assist</strong> — mutator assist (горутины помогают GC)</span>
          <span class="fmt-item"><strong>dedicated</strong> — 25% P dedicated workers</span>
          <span class="fmt-item"><strong>fractional</strong> — partial workers</span>
          <span class="fmt-item"><strong>idle</strong> — idle workers</span>
        </div>
        <div class="format-line mt">
          <code>{before}->{after}->{live} MB, {goal} MB goal</code>
        </div>
        <div class="format-desc">
          <span class="fmt-item"><strong>before</strong> — heap до GC</span>
          <span class="fmt-item"><strong>after</strong> — heap после GC (до sweep)</span>
          <span class="fmt-item"><strong>live</strong> — живые данные</span>
          <span class="fmt-item"><strong>goal</strong> — trigger для следующего GC</span>
        </div>
      </div>
    </div>

    <!-- Red flags -->
    <div class="redflags">
      <div class="redflags-header">🚩 Red Flags в gctrace</div>
      <div class="redflags-list">
        <div class="redflag">
          <span class="rf-indicator">STW > 1ms</span>
          <span class="rf-desc">Паузы влияют на latency. Проверьте количество горутин, heap size.</span>
        </div>
        <div class="redflag">
          <span class="rf-indicator">CPU > 10%</span>
          <span class="rf-desc">Слишком много времени на GC. Уменьшите allocations или увеличьте GOGC.</span>
        </div>
        <div class="redflag">
          <span class="rf-indicator">(forced)</span>
          <span class="rf-desc">GOMEMLIMIT достигнут. Приложение под memory pressure.</span>
        </div>
        <div class="redflag">
          <span class="rf-indicator">live ≈ goal</span>
          <span class="rf-desc">Почти нет garbage. Рассмотрите увеличение GOMEMLIMIT.</span>
        </div>
        <div class="redflag">
          <span class="rf-indicator">> 10 GC/sec</span>
          <span class="rf-desc">High allocation rate. Используйте sync.Pool, pre-allocate.</span>
        </div>
      </div>
    </div>

    <!-- Usage hint -->
    <div class="usage-hint">
      <div class="hint-header">Как использовать gctrace</div>
      <div class="hint-content">
        <code>GODEBUG=gctrace=1 ./app</code> — базовый вывод<br>
        <code>GODEBUG=gctrace=1,gcpacertrace=1 ./app</code> — с debug pacer<br>
        <code>go tool trace trace.out</code> — визуализация GC events
      </div>
    </div>
  </div>
</template>

<style scoped>
.gc-trace-explorer {
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
  font-size: 10px;
  color: #a0a0a0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-value {
  font-size: 11px;
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

.diagnosis.high_stw,
.diagnosis.frequent_gc {
  border-left: 4px solid #fbbf24;
}

.diagnosis.memory_pressure {
  border-left: 4px solid #f87171;
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

/* Format section */
.format-section {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

.format-header {
  font-size: 12px;
  color: #808080;
  margin-bottom: 12px;
}

.format-content {
  font-size: 11px;
}

.format-line {
  margin-bottom: 8px;
}

.format-line.mt {
  margin-top: 16px;
}

.format-line code {
  background: #252545;
  padding: 4px 8px;
  border-radius: 4px;
  color: #4ecdc4;
}

.format-desc {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-left: 12px;
  color: #808080;
}

.fmt-item {
  font-size: 10px;
}

.fmt-item strong {
  color: #a0a0a0;
}

/* Red flags */
.redflags {
  background: #252535;
  border: 1px solid #3a3a4e;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

.redflags-header {
  font-size: 12px;
  color: #f87171;
  margin-bottom: 12px;
}

.redflags-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.redflag {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.rf-indicator {
  background: #7f1d1d;
  color: #f87171;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  white-space: nowrap;
}

.rf-desc {
  font-size: 11px;
  color: #a0a0a0;
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

  .format-desc {
    flex-direction: column;
    gap: 6px;
  }
}
</style>
