<script setup lang="ts">
import { ref, computed } from 'vue'

type Scenario = 'shared' | 'new'

const scenario = ref<Scenario>('shared')
const step = ref(0)

// Сценарий 1: Capacity достаточно — Shared Array
const sharedLines = [
  { num: 1, code: 's1 := make([]int, 2, 4)', result: '// len=2, cap=4' },
  { num: 2, code: 's1[0], s1[1] = 10, 20', result: '// → [10, 20, ∅, ∅]' },
  { num: 3, code: '' },
  { num: 4, code: '// Добавляем 1 элемент: 2+1=3 ≤ 4 (cap)', comment: true },
  { num: 5, code: 's2 := append(s1, 30)', result: '// ✓ cap хватает → тот же массив' },
  { num: 6, code: '' },
  { num: 7, code: 'fmt.Println(&s1[0] == &s2[0])', result: '// true — один массив!' },
]

const sharedExec = [1, 2, 5, 7]
const sharedMemory = [
  ['∅', '∅', '∅', '∅'],
  ['∅', '∅', '∅', '∅'],
  ['10', '20', '∅', '∅'],
  ['10', '20', '30', '∅'],
  ['10', '20', '30', '∅'],
]

// Сценарий 2: Capacity превышен — New Array
const newLines = [
  { num: 1, code: 's1 := make([]int, 2, 4)', result: '// len=2, cap=4' },
  { num: 2, code: 's1[0], s1[1] = 10, 20', result: '// → [10, 20, ∅, ∅]' },
  { num: 3, code: '' },
  { num: 4, code: '// Добавляем 3 элемента: 2+3=5 > 4 (cap)', comment: true },
  { num: 5, code: 's2 := append(s1, 30, 40, 50)', result: '// ✗ cap мало → новый массив!' },
  { num: 6, code: '' },
  { num: 7, code: 'fmt.Println(&s1[0] == &s2[0])', result: '// false — разные массивы' },
]

const newExec = [1, 2, 5, 7]
const newMemory1 = [
  ['∅', '∅', '∅', '∅'],
  ['∅', '∅', '∅', '∅'],
  ['10', '20', '∅', '∅'],
  ['10', '20', '∅', '∅'],
  ['10', '20', '∅', '∅'],
]
const newMemory2 = [
  null,
  null,
  null,
  ['10', '20', '30', '40', '50', '∅', '∅', '∅'],
  ['10', '20', '30', '40', '50', '∅', '∅', '∅'],
]

const currentLines = computed(() => scenario.value === 'shared' ? sharedLines : newLines)
const currentExec = computed(() => scenario.value === 'shared' ? sharedExec : newExec)
const maxSteps = computed(() => currentExec.value.length)

const currentLine = computed(() => currentExec.value[step.value] || null)

function isExecuted(lineNum: number) {
  const idx = currentExec.value.indexOf(lineNum)
  return idx !== -1 && idx < step.value
}

function isActive(lineNum: number) {
  return lineNum === currentLine.value
}

function next() {
  if (step.value < maxSteps.value) step.value++
}

function prev() {
  if (step.value > 0) step.value--
}

function switchScenario(s: Scenario) {
  scenario.value = s
  step.value = 0
}

// Память
const memory1 = computed(() => {
  if (scenario.value === 'shared') {
    return sharedMemory[Math.min(step.value, sharedMemory.length - 1)]
  }
  return newMemory1[Math.min(step.value, newMemory1.length - 1)]
})

const memory2 = computed(() => {
  if (scenario.value === 'new') {
    return newMemory2[Math.min(step.value, newMemory2.length - 1)]
  }
  return null
})

const writtenCells = computed(() => {
  if (step.value === 2) return [0, 1]
  if (step.value === 3 && scenario.value === 'shared') return [2]
  return []
})

// Подсветка синтаксиса
function highlight(code: string, isComment?: boolean) {
  if (isComment) return `<span class="cmt">${code}</span>`
  return code
    .replace(/\b(fmt)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(make|append|Println)\b/g, '<span class="fn">$1</span>')
    .replace(/\b(int)\b/g, '<span class="typ">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="num">$1</span>')
    .replace(/(\/\/.*)/g, '<span class="cmt">$1</span>')
    .replace(/\b(s1|s2)\b/g, '<span class="var">$1</span>')
    .replace(/(&amp;|&)/g, '<span class="op">&</span>')
}
</script>

<template>
  <div class="scenarios">
    <!-- Табы -->
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
      <div class="controls">
        <button @click="prev" :disabled="step === 0">←</button>
        <span class="step">{{ step }}/{{ maxSteps }}</span>
        <button @click="next" :disabled="step === maxSteps" class="primary">→</button>
      </div>
    </div>

    <!-- Код -->
    <div class="code-container">
      <div
        v-for="line in currentLines"
        :key="line.num"
        :class="['line', {
          active: isActive(line.num),
          executed: isExecuted(line.num),
          empty: !line.code,
          comment: line.comment
        }]"
      >
        <span class="line-num">{{ line.num }}</span>
        <span class="line-code" v-html="highlight(line.code, line.comment)"></span>
        <span
          v-if="isExecuted(line.num) && line.result"
          :class="['line-result', { success: line.result?.includes('✓'), fail: line.result?.includes('✗') }]"
        >
          {{ line.result }}
        </span>
      </div>
    </div>

    <!-- Память -->
    <div class="memory-section">
      <div class="mem-block">
        <span class="mem-label">{{ scenario === 'shared' ? 's1 & s2 →' : 's1 →' }}</span>
        <div class="mem-cells">
          <span
            v-for="(val, idx) in memory1"
            :key="idx"
            :class="['mem-cell', { written: writtenCells.includes(idx) }]"
          >
            {{ val }}
          </span>
        </div>
      </div>
      <div v-if="memory2" class="mem-block new">
        <span class="mem-label">s2 → (новый)</span>
        <div class="mem-cells">
          <span
            v-for="(val, idx) in memory2"
            :key="idx"
            class="mem-cell new"
          >
            {{ val }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scenarios {
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: #d4d4d4;
  margin: 24px 0;
  overflow: hidden;
}

.tabs {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
  gap: 8px;
}

.tab {
  padding: 6px 14px;
  background: #3c3c3c;
  border: 1px solid #4a4a4a;
  border-radius: 4px;
  color: #a0a0a0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.15s;
}

.tab:hover {
  background: #4a4a4a;
}

.tab.active {
  background: #0e639c;
  border-color: #1177bb;
  color: #fff;
}

.controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
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

/* Код */
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
  min-height: 18px;
}

.line.comment {
  opacity: 0.7;
}

.line-num {
  width: 24px;
  color: #5a5a5a;
  text-align: right;
  margin-right: 14px;
  user-select: none;
  font-size: 11px;
}

.line.active .line-num {
  color: #fbbf24;
}

.line.executed .line-num {
  color: #4ecd9c;
}

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

.line-result.success {
  color: #4ecd9c;
}

.line-result.fail {
  color: #f44747;
}

/* Подсветка */
:deep(.kw) { color: #c586c0; }
:deep(.fn) { color: #dcdcaa; }
:deep(.typ) { color: #4ec9b0; }
:deep(.num) { color: #b5cea8; }
:deep(.cmt) { color: #6a9955; }
:deep(.var) { color: #9cdcfe; }
:deep(.op) { color: #d4d4d4; }

/* Память */
.memory-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  background: #252526;
  border-top: 1px solid #3c3c3c;
}

.mem-block {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mem-label {
  color: #808080;
  font-size: 11px;
  min-width: 80px;
}

.mem-block.new .mem-label {
  color: #f44747;
}

.mem-cells {
  display: flex;
  gap: 3px;
}

.mem-cell {
  width: 32px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e1e1e;
  border: 1px solid #3c3c3c;
  border-radius: 3px;
  color: #d4d4d4;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.2s;
}

.mem-cell.written {
  border-color: #4ecd9c;
  background: rgba(78, 205, 156, 0.15);
}

.mem-cell.new {
  border-color: #f44747;
  background: rgba(244, 71, 71, 0.1);
}
</style>
