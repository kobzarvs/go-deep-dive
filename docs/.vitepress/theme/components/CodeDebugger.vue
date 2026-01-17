<script setup lang="ts">
import { ref, computed } from 'vue'

interface CodeLine {
  code: string
  result?: string
  comment?: boolean
  warn?: boolean
  error?: boolean
}

interface MemoryBlock {
  label: string
  cells: string[]
  type?: 'default' | 'new' | 'error'
}

interface Step {
  line: number // номер строки (1-based) которая выполняется
  memory?: MemoryBlock[]
  writtenCells?: number[] // индексы ячеек которые подсвечиваются
}

const props = withDefaults(defineProps<{
  title: string
  type?: 'success' | 'error' | 'neutral'
  lines: CodeLine[]
  steps: Step[]
}>(), {
  type: 'neutral'
})

const step = ref(0)
const maxSteps = computed(() => props.steps.length)

// Текущий шаг
const currentStep = computed(() => props.steps[step.value] || null)
const currentLine = computed(() => currentStep.value?.line || null)

// Какие строки выполнены (все шаги до текущего)
const executedLines = computed(() => {
  const executed = new Set<number>()
  for (let i = 0; i < step.value; i++) {
    executed.add(props.steps[i].line)
  }
  return executed
})

function isExecuted(lineIndex: number) {
  return executedLines.value.has(lineIndex + 1)
}

function isActive(lineIndex: number) {
  return currentLine.value === lineIndex + 1
}

function next() {
  if (step.value < maxSteps.value) step.value++
}

function prev() {
  if (step.value > 0) step.value--
}

// Подсветка синтаксиса Go
function highlight(code: string, isComment?: boolean) {
  if (!code) return ''
  if (isComment) return `<span class="cmt">${code}</span>`

  // Сначала защищаем строки и комментарии плейсхолдерами
  const strings: string[] = []
  const comments: string[] = []

  let result = code
    // Извлекаем комментарии
    .replace(/(\/\/.*)/g, (match) => {
      comments.push(match)
      return `__COMMENT_${comments.length - 1}__`
    })
    // Извлекаем строки
    .replace(/("(?:[^"\\]|\\.)*")/g, (match) => {
      strings.push(match)
      return `__STRING_${strings.length - 1}__`
    })

  // Теперь безопасно подсвечиваем
  result = result
    .replace(/\b(func|return|package|import|var|const|type|struct|interface|if|else|for|range|switch|case|default|go|defer|select|chan|map|nil|true|false)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(make|append|len|cap|copy|new|delete|close|panic|recover|print|println|Println|Printf|Sprintf|Errorf)\b/g, '<span class="fn">$1</span>')
    .replace(/\b(int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|complex64|complex128|byte|rune|string|bool|error|any)\b/g, '<span class="typ">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="num">$1</span>')

  // Восстанавливаем строки и комментарии с подсветкой
  result = result
    .replace(/__STRING_(\d+)__/g, (_, idx) => `<span class="str">${strings[parseInt(idx)]}</span>`)
    .replace(/__COMMENT_(\d+)__/g, (_, idx) => `<span class="cmt">${comments[parseInt(idx)]}</span>`)

  return result
}

// Память для текущего шага
const currentMemory = computed(() => {
  // Ищем последний шаг с памятью
  for (let i = step.value - 1; i >= 0; i--) {
    if (props.steps[i]?.memory) {
      return props.steps[i].memory
    }
  }
  return null
})

const writtenCells = computed(() => {
  if (step.value > 0 && props.steps[step.value - 1]?.writtenCells) {
    return props.steps[step.value - 1].writtenCells
  }
  return []
})
</script>

<template>
  <div :class="['debugger', type]">
    <div class="header">
      <span class="title">{{ title }}</span>
      <div class="controls">
        <button @click="prev" :disabled="step === 0">←</button>
        <span class="step">{{ step }}/{{ maxSteps }}</span>
        <button @click="next" :disabled="step === maxSteps" class="primary">→</button>
      </div>
    </div>

    <div class="code-container">
      <div
        v-for="(line, idx) in lines"
        :key="idx"
        :class="['line', {
          active: isActive(idx),
          executed: isExecuted(idx),
          empty: !line.code
        }]"
      >
        <span class="line-num">{{ idx + 1 }}</span>
        <span class="line-code" v-html="highlight(line.code, line.comment)"></span>
        <span
          v-if="isExecuted(idx) && line.result"
          :class="['line-result', { warn: line.warn, error: line.error }]"
        >
          {{ line.result }}
        </span>
      </div>
    </div>

    <div v-if="currentMemory" class="memory-section">
      <div
        v-for="(block, idx) in currentMemory"
        :key="idx"
        :class="['mem-row', block.type]"
      >
        <span class="mem-label">{{ block.label }}</span>
        <div class="mem-cells">
          <span
            v-for="(val, cidx) in block.cells"
            :key="cidx"
            :class="['mem-cell', {
              written: idx === 0 && writtenCells?.includes(cidx),
              new: block.type === 'new',
              error: block.type === 'error'
            }]"
          >{{ val }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.debugger {
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: #d4d4d4;
  margin: 16px 0;
  overflow: hidden;
}

.debugger.success { border-color: #2d5a3d; }
.debugger.error { border-color: #5a2d2d; }

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: #d4d4d4;
}

.debugger.success .title { color: #4ecd9c; }
.debugger.error .title { color: #f44747; }

.controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.controls button {
  padding: 4px 10px;
  background: #3c3c3c;
  border: 1px solid #5a5a5a;
  border-radius: 4px;
  color: #d4d4d4;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  transition: all 0.15s;
}

.controls button:hover:not(:disabled) {
  background: #505050;
}

.controls button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.controls button.primary {
  background: #0e639c;
  border-color: #1177bb;
}

.step {
  color: #808080;
  font-size: 11px;
  min-width: 36px;
  text-align: center;
}

/* Code */
.code-container {
  padding: 10px 0;
}

.line {
  display: flex;
  align-items: center;
  padding: 2px 14px;
  min-height: 22px;
  transition: background 0.15s;
}

.line.active {
  background: #264f78;
}

.line.executed {
  background: rgba(78, 205, 156, 0.08);
}

.line.empty {
  min-height: 16px;
}

.line-num {
  width: 24px;
  color: #5a5a5a;
  text-align: right;
  margin-right: 14px;
  font-size: 11px;
  user-select: none;
}

.line.active .line-num { color: #fbbf24; }
.line.executed .line-num { color: #4ecd9c; }

.line-code {
  flex: 1;
  white-space: pre;
}

.line-result {
  margin-left: 20px;
  color: #6a9955;
  font-size: 11px;
  white-space: nowrap;
}

.line-result.warn { color: #cca700; }
.line-result.error { color: #f44747; }

/* Syntax highlighting */
:deep(.kw) { color: #c586c0; }
:deep(.fn) { color: #dcdcaa; }
:deep(.typ) { color: #4ec9b0; }
:deep(.num) { color: #b5cea8; }
:deep(.str) { color: #ce9178; }
:deep(.cmt) { color: #6a9955; }

/* Memory */
.memory-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  background: #252526;
  border-top: 1px solid #3c3c3c;
  font-size: 11px;
}

.mem-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mem-label {
  color: #808080;
  min-width: 90px;
}

.mem-row.new .mem-label { color: #f44747; }
.mem-row.error .mem-label { color: #f44747; }

.mem-cells {
  display: flex;
  gap: 3px;
}

.mem-cell {
  min-width: 32px;
  height: 24px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 3px;
  font-weight: 600;
  transition: all 0.2s;
}

.mem-cell.written {
  border-color: #4ecd9c;
  background: rgba(78, 205, 156, 0.2);
}

.mem-cell.new {
  border-color: #569cd6;
  background: rgba(86, 156, 214, 0.15);
}

.mem-cell.error {
  border-color: #f44747;
  background: rgba(244, 71, 71, 0.15);
}
</style>
