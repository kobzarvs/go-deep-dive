<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'

interface DataItem {
  id: number
  value: number
  originalValue: number
  stage: number
  status: 'waiting' | 'processing' | 'done'
}

interface Stage {
  name: string
  operation: string
  items: DataItem[]
  processing: DataItem | null
}

interface CodeLine {
  num: number
  code: string
  indent: number
}

const pipelineMode = ref<'simple' | 'fanout'>('simple')
const step = ref(0)
const maxSteps = ref(0)
const currentLine = ref(0)
const dataItems = reactive<DataItem[]>([])
const processedCount = ref(0)

// История состояний для навигации
interface PipelineState {
  stages: { items: DataItem[], processing: DataItem | null }[]
  workers: { processing: DataItem | null }[]
  processedCount: number
  line: number
  description: string
}
const history = ref<PipelineState[]>([])
const stepDescription = ref('')

// Структурированный код для simple pipeline — показываем реальные функции
const simpleCodeLines: CodeLine[] = [
  { num: 1, code: 'func generate(nums ...int) <-chan int {', indent: 0 },
  { num: 2, code: '    out := make(chan int)', indent: 1 },
  { num: 3, code: '    go func() {', indent: 1 },
  { num: 4, code: '        for _, n := range nums {', indent: 2 },
  { num: 5, code: '            out <- n', indent: 3 },
  { num: 6, code: '        }', indent: 2 },
  { num: 7, code: '        close(out)', indent: 2 },
  { num: 8, code: '    }()', indent: 1 },
  { num: 9, code: '    return out', indent: 1 },
  { num: 10, code: '}', indent: 0 },
  { num: 11, code: '', indent: 0 },
  { num: 12, code: 'func square(in <-chan int) <-chan int {', indent: 0 },
  { num: 13, code: '    out := make(chan int)', indent: 1 },
  { num: 14, code: '    go func() {', indent: 1 },
  { num: 15, code: '        for n := range in {', indent: 2 },
  { num: 16, code: '            out <- n * n', indent: 3 },
  { num: 17, code: '        }', indent: 2 },
  { num: 18, code: '        close(out)', indent: 2 },
  { num: 19, code: '    }()', indent: 1 },
  { num: 20, code: '    return out', indent: 1 },
  { num: 21, code: '}', indent: 0 },
  { num: 22, code: '', indent: 0 },
  { num: 23, code: 'func filter(in <-chan int) <-chan int {', indent: 0 },
  { num: 24, code: '    out := make(chan int)', indent: 1 },
  { num: 25, code: '    go func() {', indent: 1 },
  { num: 26, code: '        for n := range in {', indent: 2 },
  { num: 27, code: '            if n > 10 {', indent: 3 },
  { num: 28, code: '                out <- n', indent: 4 },
  { num: 29, code: '            }', indent: 3 },
  { num: 30, code: '        }', indent: 2 },
  { num: 31, code: '        close(out)', indent: 2 },
  { num: 32, code: '    }()', indent: 1 },
  { num: 33, code: '    return out', indent: 1 },
  { num: 34, code: '}', indent: 0 },
  { num: 35, code: '', indent: 0 },
  { num: 36, code: '// main: iterate results', indent: 0 },
  { num: 37, code: 'for n := range filter(square(generate(...))) {', indent: 0 },
  { num: 38, code: '    fmt.Println(n)', indent: 1 },
  { num: 39, code: '}', indent: 0 },
]

// Структурированный код для fan-out pipeline — реальные функции
const fanoutCodeLines: CodeLine[] = [
  { num: 1, code: '// Fan-Out: один канал → N воркеров', indent: 0 },
  { num: 2, code: 'func worker(in <-chan int) <-chan int {', indent: 0 },
  { num: 3, code: '    out := make(chan int)', indent: 1 },
  { num: 4, code: '    go func() {', indent: 1 },
  { num: 5, code: '        for n := range in {', indent: 2 },
  { num: 6, code: '            out <- n * n  // square', indent: 3 },
  { num: 7, code: '        }', indent: 2 },
  { num: 8, code: '        close(out)', indent: 2 },
  { num: 9, code: '    }()', indent: 1 },
  { num: 10, code: '    return out', indent: 1 },
  { num: 11, code: '}', indent: 0 },
  { num: 12, code: '', indent: 0 },
  { num: 13, code: '// Fan-In: N каналов → один канал', indent: 0 },
  { num: 14, code: 'func merge(channels ...<-chan int) <-chan int {', indent: 0 },
  { num: 15, code: '    out := make(chan int)', indent: 1 },
  { num: 16, code: '    for _, ch := range channels {', indent: 1 },
  { num: 17, code: '        go func(c <-chan int) {', indent: 2 },
  { num: 18, code: '            for n := range c {', indent: 3 },
  { num: 19, code: '                out <- n', indent: 4 },
  { num: 20, code: '            }', indent: 3 },
  { num: 21, code: '        }(ch)', indent: 2 },
  { num: 22, code: '    }', indent: 1 },
  { num: 23, code: '    return out', indent: 1 },
  { num: 24, code: '}', indent: 0 },
  { num: 25, code: '', indent: 0 },
  { num: 26, code: '// Использование', indent: 0 },
  { num: 27, code: 'in := generate(1, 2, 3, 4, 5, 6)', indent: 0 },
  { num: 28, code: 'w1, w2, w3 := worker(in), worker(in), worker(in)', indent: 0 },
  { num: 29, code: 'merged := merge(w1, w2, w3)', indent: 0 },
  { num: 30, code: 'for n := range filter(merged) {', indent: 0 },
  { num: 31, code: '    fmt.Println(n)', indent: 1 },
  { num: 32, code: '}', indent: 0 },
]

const currentCodeLines = computed(() =>
  pipelineMode.value === 'simple' ? simpleCodeLines : fanoutCodeLines
)

const stages = reactive<Stage[]>([
  { name: 'Generate', operation: 'n → n', items: [], processing: null },
  { name: 'Square', operation: 'n → n²', items: [], processing: null },
  { name: 'Filter', operation: 'n > 10 ?', items: [], processing: null },
  { name: 'Output', operation: 'print(n)', items: [], processing: null }
])

const fanoutWorkers = reactive<{ id: number; processing: DataItem | null }[]>([
  { id: 1, processing: null },
  { id: 2, processing: null },
  { id: 3, processing: null }
])

let nextId = 1
let inputIndex = 0

// Фиксированные числа для предсказуемости
const inputNumbers = [1, 2, 3, 4, 5, 6]

function generateItem(): DataItem {
  const value = inputNumbers[inputIndex % inputNumbers.length]
  inputIndex++
  return {
    id: nextId++,
    value: value,
    originalValue: value,
    stage: 0,
    status: 'waiting'
  }
}

function cloneState(description: string = ''): PipelineState {
  return {
    stages: stages.map(s => ({
      items: s.items.map(i => ({ ...i })),
      processing: s.processing ? { ...s.processing } : null
    })),
    workers: fanoutWorkers.map(w => ({
      processing: w.processing ? { ...w.processing } : null
    })),
    processedCount: processedCount.value,
    line: currentLine.value,
    description
  }
}

function applyState(state: PipelineState) {
  stages.forEach((s, i) => {
    s.items = state.stages[i].items.map(item => ({ ...item }))
    s.processing = state.stages[i].processing ? { ...state.stages[i].processing } : null
  })
  fanoutWorkers.forEach((w, i) => {
    w.processing = state.workers[i].processing ? { ...state.workers[i].processing } : null
  })
  processedCount.value = state.processedCount
  currentLine.value = state.line
  stepDescription.value = state.description
}

function initSimplePipeline() {
  history.value = []
  step.value = 0
  processedCount.value = 0
  nextId = 1
  inputIndex = 0
  currentLine.value = 1
  stepDescription.value = ''

  stages.forEach(s => {
    s.items = []
    s.processing = null
  })

  // Генерируем начальные данные
  for (let i = 0; i < 6; i++) {
    stages[0].items.push(generateItem())
  }

  // Сохраняем начальное состояние
  history.value.push(cloneState('Начальное состояние: числа 1-6 в очереди Generate'))

  // Генерируем все шаги
  generateSimpleSteps()
  maxSteps.value = history.value.length - 1
}

function generateSimpleSteps() {
  // Симулируем весь pipeline, сохраняя состояния с описаниями
  while (true) {
    let anyWork = false
    let desc = ''

    // Generate: line 5 (out <- n)
    if (stages[0].items.length > 0 || stages[0].processing) {
      currentLine.value = 5
      if (stages[0].processing) {
        const val = stages[0].processing.value
        desc = `Generate: out <- ${val} (отправляем в канал)`
        stages[0].processing.stage = 1
        stages[0].processing.status = 'waiting'
        stages[1].items.push(stages[0].processing)
        stages[0].processing = null
        history.value.push(cloneState(desc))
      }
      if (stages[0].items.length > 0) {
        stages[0].processing = stages[0].items.shift()!
        stages[0].processing.status = 'processing'
        desc = `Generate: for _, n := range nums — n = ${stages[0].processing.value}`
        history.value.push(cloneState(desc))
      }
      anyWork = true
    }

    // Square: line 16 (out <- n * n)
    if (stages[1].items.length > 0 || stages[1].processing) {
      currentLine.value = 16
      if (stages[1].processing) {
        const orig = stages[1].processing.originalValue
        const squared = orig * orig
        stages[1].processing.value = squared
        desc = `Square: out <- ${orig} * ${orig} = ${squared}`
        stages[1].processing.stage = 2
        stages[1].processing.status = 'waiting'
        stages[2].items.push(stages[1].processing)
        stages[1].processing = null
        history.value.push(cloneState(desc))
      }
      if (stages[1].items.length > 0) {
        stages[1].processing = stages[1].items.shift()!
        stages[1].processing.status = 'processing'
        desc = `Square: for n := range in — n = ${stages[1].processing.originalValue}`
        history.value.push(cloneState(desc))
      }
      anyWork = true
    }

    // Filter: line 27 (if n > 10)
    if (stages[2].items.length > 0 || stages[2].processing) {
      currentLine.value = 27
      if (stages[2].processing) {
        const val = stages[2].processing.value
        const passes = val > 10
        if (passes) {
          currentLine.value = 28
          desc = `Filter: ${val} > 10 ✓ → out <- ${val}`
          stages[2].processing.stage = 3
          stages[2].processing.status = 'waiting'
          stages[3].items.push(stages[2].processing)
        } else {
          desc = `Filter: ${val} > 10 ? Нет, отфильтровано`
        }
        stages[2].processing = null
        history.value.push(cloneState(desc))
      }
      if (stages[2].items.length > 0) {
        stages[2].processing = stages[2].items.shift()!
        stages[2].processing.status = 'processing'
        desc = `Filter: for n := range in — n = ${stages[2].processing.value}`
        history.value.push(cloneState(desc))
      }
      anyWork = true
    }

    // Output: line 38 (fmt.Println(n))
    if (stages[3].items.length > 0 || stages[3].processing) {
      currentLine.value = 38
      if (stages[3].processing) {
        desc = `Output: print(${stages[3].processing.value}) — выведено!`
        processedCount.value++
        stages[3].processing = null
        history.value.push(cloneState(desc))
      }
      if (stages[3].items.length > 0) {
        currentLine.value = 37
        stages[3].processing = stages[3].items.shift()!
        stages[3].processing.status = 'processing'
        desc = `Output: for n := range filtered — n = ${stages[3].processing.value}`
        history.value.push(cloneState(desc))
      }
      anyWork = true
    }

    if (!anyWork) break
  }

  currentLine.value = 39
  history.value.push(cloneState('Pipeline завершён — все горутины закрыли каналы'))
}

function initFanoutPipeline() {
  history.value = []
  step.value = 0
  processedCount.value = 0
  nextId = 1
  inputIndex = 0
  currentLine.value = 1
  stepDescription.value = ''

  stages.forEach(s => {
    s.items = []
    s.processing = null
  })
  fanoutWorkers.forEach(w => w.processing = null)

  for (let i = 0; i < 9; i++) {
    stages[0].items.push(generateItem())
  }

  history.value.push(cloneState('Fan-Out: начальное состояние'))
  generateFanoutSteps()
  maxSteps.value = history.value.length - 1
}

function generateFanoutSteps() {
  while (true) {
    let anyWork = false
    let desc = ''

    // Generate: line 27 (in := generate(...))
    if (stages[0].items.length > 0 || stages[0].processing) {
      currentLine.value = 27
      if (stages[0].processing) {
        desc = `Generate → Fan-Out: ${stages[0].processing.value} идёт к свободному воркеру`
        stages[0].processing.stage = 1
        stages[0].processing.status = 'waiting'
        stages[1].items.push(stages[0].processing)
        stages[0].processing = null
        history.value.push(cloneState(desc))
      }
      if (stages[0].items.length > 0) {
        stages[0].processing = stages[0].items.shift()!
        stages[0].processing.status = 'processing'
        desc = `Generate: in <- ${stages[0].processing.value}`
        history.value.push(cloneState(desc))
      }
      anyWork = true
    }

    // Workers: line 6 (out <- n * n)
    if (stages[1].items.length > 0 || fanoutWorkers.some(w => w.processing)) {
      currentLine.value = 6
      const descriptions: string[] = []
      for (const worker of fanoutWorkers) {
        if (worker.processing) {
          const orig = worker.processing.originalValue
          const squared = orig * orig
          worker.processing.value = squared
          worker.processing.status = 'done'
          worker.processing.stage = 2
          stages[2].items.push(worker.processing)
          descriptions.push(`W${worker.id}: ${orig}² = ${squared}`)
          worker.processing = null
        }
        if (!worker.processing && stages[1].items.length > 0) {
          worker.processing = stages[1].items.shift()!
          worker.processing.status = 'processing'
        }
      }
      desc = descriptions.length > 0
        ? `Worker: out <- n*n → ${descriptions.join(', ')}`
        : 'Workers ждут данные из канала in'
      history.value.push(cloneState(desc))
      anyWork = true
    }

    // Fan-In (merge): line 19 (out <- n) → Filter: line 30
    if (stages[2].items.length > 0 || stages[2].processing) {
      currentLine.value = 19
      if (stages[2].processing) {
        const val = stages[2].processing.value
        const passes = val > 10
        currentLine.value = 30
        if (passes) {
          desc = `Fan-In → Filter: ${val} > 10 ✓ проходит`
          stages[2].processing.stage = 3
          stages[2].processing.status = 'waiting'
          stages[3].items.push(stages[2].processing)
        } else {
          desc = `Fan-In → Filter: ${val} ≤ 10 ✗ отфильтровано`
        }
        stages[2].processing = null
        history.value.push(cloneState(desc))
      }
      if (stages[2].items.length > 0) {
        stages[2].processing = stages[2].items.shift()!
        stages[2].processing.status = 'processing'
        desc = `Fan-In: merge собирает ${stages[2].processing.value} из воркера`
        history.value.push(cloneState(desc))
      }
      anyWork = true
    }

    // Output: line 31 (fmt.Println(n))
    if (stages[3].items.length > 0 || stages[3].processing) {
      currentLine.value = 31
      if (stages[3].processing) {
        desc = `Output: fmt.Println(${stages[3].processing.value})`
        processedCount.value++
        stages[3].processing = null
        history.value.push(cloneState(desc))
      }
      if (stages[3].items.length > 0) {
        currentLine.value = 30
        stages[3].processing = stages[3].items.shift()!
        stages[3].processing.status = 'processing'
        desc = `Output: for n := range filtered — n = ${stages[3].processing.value}`
        history.value.push(cloneState(desc))
      }
      anyWork = true
    }

    if (!anyWork) break
  }

  currentLine.value = 32
  history.value.push(cloneState('Fan-Out/Fan-In pipeline завершён'))
}

function next() {
  if (step.value < maxSteps.value) {
    step.value++
    applyState(history.value[step.value])
  }
}

function prev() {
  if (step.value > 0) {
    step.value--
    applyState(history.value[step.value])
  }
}

function reset() {
  if (pipelineMode.value === 'simple') {
    initSimplePipeline()
  } else {
    initFanoutPipeline()
  }
  applyState(history.value[0])
}

// Подсветка синтаксиса Go
function highlightCode(code: string): string {
  if (!code) return '&nbsp;'

  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Keywords
    .replace(/\b(func|for|range|return|make|if|else|var|const|type|struct|interface|chan|go|defer|select|case|default)\b/g, '<span class="kw">$1</span>')
    // Types
    .replace(/\b(int|string|bool|error|byte|rune)\b/g, '<span class="ty">$1</span>')
    // Functions (word followed by parenthesis)
    .replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, '<span class="fn">$1</span>(')
    // Numbers
    .replace(/\b(\d+)\b/g, '<span class="nm">$1</span>')
    // Comments
    .replace(/(\/\/.*)$/g, '<span class="cm">$1</span>')
    // Channel operators
    .replace(/(&lt;-)/g, '<span class="op">$1</span>')
}

onMounted(() => {
  initSimplePipeline()
  applyState(history.value[0])
})

watch(pipelineMode, () => {
  reset()
})
</script>

<template>
  <div class="pipeline-viz">
    <div class="viz-header">
      <h3>Pipeline Pattern</h3>
      <div class="controls">
        <div class="mode-selector">
          <button
            class="mode-btn"
            :class="{ active: pipelineMode === 'simple' }"
            @click="pipelineMode = 'simple'"
            :disabled="isRunning"
          >
            Simple
          </button>
          <button
            class="mode-btn"
            :class="{ active: pipelineMode === 'fanout' }"
            @click="pipelineMode = 'fanout'"
            :disabled="isRunning"
          >
            Fan-Out
          </button>
        </div>
        <button class="btn btn-nav" @click="prev" :disabled="step === 0">←</button>
        <span class="step-counter">{{ step }}/{{ maxSteps }}</span>
        <button class="btn btn-nav btn-primary" @click="next" :disabled="step === maxSteps">→</button>
        <button class="btn btn-reset" @click="reset">Reset</button>
      </div>
    </div>

    <div class="main-layout">
      <!-- Left Column: Visualization -->
      <div class="viz-column">
        <div class="stats">
          <span class="stat-item">
            <span class="stat-label">Processed:</span>
            <span class="stat-value">{{ processedCount }}</span>
          </span>
          <span class="stat-item">
            <span class="stat-label">In Pipeline:</span>
            <span class="stat-value">{{ stages.reduce((sum, s) => sum + s.items.length + (s.processing ? 1 : 0), 0) + (pipelineMode === 'fanout' ? fanoutWorkers.filter(w => w.processing).length : 0) }}</span>
          </span>
        </div>

        <!-- Описание текущего шага -->
        <div v-if="stepDescription" class="step-description">
          {{ stepDescription }}
        </div>

        <!-- Simple Pipeline -->
        <div v-if="pipelineMode === 'simple'" class="pipeline-container">
          <div class="pipeline-flow">
            <div v-for="(stage, idx) in stages" :key="stage.name" class="stage-wrapper">
              <div class="stage-box">
                <div class="stage-header">
                  <span class="stage-name">{{ stage.name }}</span>
                  <span class="stage-op">{{ stage.operation }}</span>
                </div>
                <div class="stage-content">
                  <div class="stage-queue">
                    <div
                      v-for="item in stage.items"
                      :key="item.id"
                      class="data-item waiting"
                    >
                      {{ item.value }}
                    </div>
                  </div>
                  <!-- Generate: просто число -->
                  <div v-if="stage.processing && idx === 0" class="processing-slot">
                    <div class="data-item processing">
                      {{ stage.processing.value }}
                    </div>
                  </div>
                  <!-- Square: показать трансформацию -->
                  <div v-else-if="stage.processing && idx === 1" class="processing-slot transform">
                    <span class="orig">{{ stage.processing.originalValue }}</span>
                    <span class="transform-arrow">→</span>
                    <span class="result">{{ stage.processing.value }}</span>
                  </div>
                  <!-- Filter: показать проверку -->
                  <div v-else-if="stage.processing && idx === 2" class="processing-slot check">
                    <span class="check-value">{{ stage.processing.value }}</span>
                    <span :class="stage.processing.value > 10 ? 'pass' : 'fail'">
                      {{ stage.processing.value > 10 ? '✓' : '✗' }}
                    </span>
                  </div>
                  <!-- Output: просто число -->
                  <div v-else-if="stage.processing && idx === 3" class="processing-slot">
                    <div class="data-item processing">
                      {{ stage.processing.value }}
                    </div>
                  </div>
                  <div v-else class="processing-slot empty">
                    —
                  </div>
                </div>
              </div>
              <div v-if="idx < stages.length - 1" class="channel-arrow">
                <span class="arrow">→</span>
                <span class="chan-label">chan</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Fan-Out Pipeline (компактный) -->
        <div v-else class="pipeline-container fanout">
          <div class="fanout-compact">
            <!-- Row 1: Generate + очередь -->
            <div class="fo-row">
              <div class="fo-label">Generate</div>
              <div class="fo-items">
                <div v-for="item in stages[0].items" :key="item.id" class="data-item waiting">{{ item.value }}</div>
                <div v-if="stages[0].processing" class="data-item processing">{{ stages[0].processing.value }}</div>
              </div>
              <div class="fo-arrow">→</div>
              <div class="fo-label">in</div>
              <div class="fo-items queue">
                <div v-for="item in stages[1].items" :key="item.id" class="data-item waiting">{{ item.value }}</div>
              </div>
            </div>

            <!-- Row 2: Workers -->
            <div class="fo-row workers-row">
              <div class="fo-label">Fan-Out<br/>Workers</div>
              <div class="workers-compact">
                <div v-for="worker in fanoutWorkers" :key="worker.id" class="worker-compact">
                  <span class="worker-id">#{{ worker.id }}</span>
                  <span v-if="worker.processing" class="worker-calc">
                    {{ worker.processing.originalValue }}²={{ worker.processing.originalValue * worker.processing.originalValue }}
                  </span>
                  <span v-else class="worker-idle">—</span>
                </div>
              </div>
            </div>

            <!-- Row 3: Fan-In + Filter + Output -->
            <div class="fo-row">
              <div class="fo-label">Fan-In</div>
              <div class="fo-items queue">
                <div v-for="item in stages[2].items" :key="item.id" class="data-item waiting">{{ item.value }}</div>
              </div>
              <div class="fo-arrow">→</div>
              <div class="fo-label">Filter<br/>>10</div>
              <div class="fo-items">
                <div v-if="stages[2].processing" class="data-item processing">
                  {{ stages[2].processing.value }}
                  <span :class="stages[2].processing.value > 10 ? 'pass' : 'fail'">
                    {{ stages[2].processing.value > 10 ? '✓' : '✗' }}
                  </span>
                </div>
              </div>
              <div class="fo-arrow">→</div>
              <div class="fo-label">Out</div>
              <div class="fo-items">
                <div v-if="stages[3].processing" class="data-item processing">{{ stages[3].processing.value }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Code -->
      <div class="code-column">
        <div class="code-panel">
          <div class="panel-label">Pipeline Code</div>
          <div class="code-block">
            <div
              v-for="line in currentCodeLines"
              :key="line.num"
              class="code-line"
              :class="{ 'active': currentLine === line.num }"
            >
              <span class="line-num">{{ line.num }}</span>
              <span class="line-code" v-html="highlightCode(line.code)"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pipeline-viz {
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
  flex-wrap: wrap;
  gap: 12px;
}

.viz-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.mode-selector {
  display: flex;
  gap: 4px;
}

.mode-btn {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #3a3a5e;
  background: #252545;
  color: #a0a0a0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s ease;
}

.mode-btn.active {
  background: #3a3a5e;
  color: #ffffff;
  border-color: #4a4a7e;
}

.mode-btn:hover:not(:disabled) {
  background: #3a3a5e;
}

.mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-reset {
  background: #3a3a5e;
  color: #e0e0e0;
  border: 1px solid #4a4a7e;
}

.btn-reset:hover:not(:disabled) {
  background: #4a4a7e;
}

.btn-nav {
  background: #3a3a5e;
  color: #e0e0e0;
  font-weight: 600;
  min-width: 36px;
}

.btn-nav:hover:not(:disabled) {
  background: #4a4a7e;
}

.btn-nav.btn-primary {
  background: #60a5fa;
  color: #0a0a0a;
}

.btn-nav.btn-primary:hover:not(:disabled) {
  background: #3b82f6;
}

.step-counter {
  font-size: 12px;
  color: #a0a0a0;
  min-width: 50px;
  text-align: center;
}

.main-layout {
  display: flex;
  gap: 20px;
}

.viz-column {
  flex: 1;
  min-width: 0;
}

.code-column {
  width: 480px;
  flex-shrink: 0;
}

.stats {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
}

.stat-item {
  font-size: 12px;
}

.stat-label {
  color: #808080;
  margin-right: 8px;
}

.stat-value {
  color: #4ade80;
  font-weight: 600;
}

.step-description {
  background: linear-gradient(135deg, #2a2a4e 0%, #1a1a2e 100%);
  border: 1px solid #4a4a7e;
  border-left: 3px solid #60a5fa;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #e0e0e0;
  line-height: 1.4;
}

.pipeline-container {
  background: #252545;
  border-radius: 6px;
  padding: 20px;
  overflow-x: auto;
}

.pipeline-flow {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: fit-content;
}

.stage-wrapper {
  display: flex;
  align-items: center;
}

.stage-box {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 6px;
  padding: 12px;
  min-width: 120px;
}

.stage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #2a2a4e;
}

.stage-name {
  font-weight: 600;
  font-size: 12px;
  color: #ffffff;
}

.stage-op {
  font-size: 10px;
  color: #60a5fa;
}

.stage-content {
  min-height: 60px;
}

.stage-queue {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  min-height: 24px;
}

.data-item {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.data-item.waiting {
  background: #3a3a5e;
  color: #a0a0a0;
}

.data-item.processing {
  background: #60a5fa;
  color: #0a0a0a;
  animation: pulse 0.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.processing-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  background: #2a2a4e;
  border-radius: 4px;
  padding: 2px;
}

.processing-slot.empty {
  color: #606080;
  font-size: 12px;
}

.processing-slot.transform {
  gap: 6px;
  font-size: 12px;
  padding: 4px 8px;
}

.processing-slot.transform .orig {
  color: #a0a0a0;
}

.processing-slot.transform .transform-arrow {
  color: #60a5fa;
  font-size: 14px;
}

.processing-slot.transform .result {
  color: #4ade80;
  font-weight: 600;
}

.processing-slot.check {
  gap: 6px;
  font-size: 12px;
  padding: 4px 8px;
}

.processing-slot.check .check-value {
  color: #e0e0e0;
  font-weight: 600;
}

.processing-slot.check .pass {
  color: #4ade80;
  font-size: 14px;
}

.processing-slot.check .fail {
  color: #f87171;
  font-size: 14px;
}

.channel-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 8px;
}

.arrow {
  font-size: 20px;
  color: #4ade80;
}

.chan-label {
  font-size: 9px;
  color: #606080;
}

/* Fan-out specific styles */
.fanout-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.distribution-queue {
  background: #1a1a2e;
  border: 1px solid #4ade80;
  border-radius: 6px;
  padding: 12px;
  width: 100%;
  max-width: 400px;
}

.queue-label {
  font-size: 10px;
  color: #4ade80;
  margin-bottom: 8px;
  text-align: center;
}

.queue-items {
  display: flex;
  gap: 4px;
  justify-content: center;
  flex-wrap: wrap;
  min-height: 24px;
}

.fanout-workers {
  width: 100%;
}

.fanout-label {
  font-size: 11px;
  color: #808080;
  text-align: center;
  margin-bottom: 8px;
}

.workers-grid {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.worker-box {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 6px;
  padding: 12px;
  min-width: 100px;
}

.worker-header {
  font-size: 10px;
  color: #a78bfa;
  margin-bottom: 8px;
  text-align: center;
}

.worker-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
  min-height: 24px;
}

.worker-content.active {
  color: #4ade80;
}

.worker-content.idle {
  color: #606080;
}

.in-value {
  color: #a0a0a0;
}

.out-value {
  color: #4ade80;
  font-weight: 600;
}

.final-stages {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stage-box.small {
  min-width: 80px;
  padding: 8px;
}

.stage-box.generate {
  min-width: 100px;
}

.channel-arrow.small {
  padding: 0 4px;
}

.channel-arrow.small .arrow {
  font-size: 16px;
}

.channel-arrow.vertical {
  padding: 8px 0;
}

/* Compact Fan-Out styles */
.fanout-compact {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fo-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fo-label {
  font-size: 10px;
  color: #60a5fa;
  font-weight: 600;
  min-width: 50px;
  text-align: right;
  line-height: 1.2;
}

.fo-items {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  min-height: 24px;
  align-items: center;
}

.fo-items.queue {
  background: #2a2a4e;
  border-radius: 4px;
  padding: 4px 8px;
  min-width: 60px;
}

.fo-arrow {
  color: #4ade80;
  font-size: 16px;
  font-weight: bold;
}

.workers-row {
  background: #252545;
  border-radius: 6px;
  padding: 8px 12px;
}

.workers-compact {
  display: flex;
  gap: 12px;
}

.worker-compact {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
}

.worker-id {
  color: #a78bfa;
  font-weight: 600;
}

.worker-calc {
  color: #4ade80;
}

.worker-idle {
  color: #606080;
}

.code-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-label {
  font-size: 11px;
  color: #808080;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.code-block {
  margin: 0;
  padding: 8px 0;
  background: #1a1a2e;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  overflow-x: auto;
  flex: 1;
}

.code-line {
  display: flex;
  align-items: stretch;
  padding: 2px 0;
  transition: background 0.2s ease;
  border-left: 3px solid transparent;
}

.code-line.active {
  background: rgba(96, 165, 250, 0.15);
  border-left-color: #60a5fa;
}

.line-num {
  width: 32px;
  padding: 0 8px;
  text-align: right;
  color: #606080;
  font-size: 10px;
  user-select: none;
  flex-shrink: 0;
}

.code-line.active .line-num {
  color: #60a5fa;
  font-weight: 600;
}

.line-code {
  flex: 1;
  padding-right: 12px;
  white-space: pre;
}

/* Syntax highlighting */
.code-block :deep(.kw) { color: #c792ea; }
.code-block :deep(.fn) { color: #82aaff; }
.code-block :deep(.ty) { color: #ffcb6b; }
.code-block :deep(.nm) { color: #f78c6c; }
.code-block :deep(.cm) { color: #546e7a; }
.code-block :deep(.op) { color: #4ade80; }

@media (max-width: 900px) {
  .main-layout {
    flex-direction: column;
  }

  .code-column {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .pipeline-flow {
    flex-direction: column;
    gap: 16px;
  }

  .channel-arrow {
    transform: rotate(90deg);
  }

  .workers-grid {
    flex-direction: column;
    align-items: center;
  }
}
</style>
