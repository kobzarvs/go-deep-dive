<script setup lang="ts">
import { ref, computed } from 'vue'

interface CodeLine {
  code: string
  annotation?: string
  annotationType?: 'stack' | 'escape' | 'info'
}

interface Scenario {
  id: string
  title: string
  shortTitle: string
  result: 'stack' | 'heap'
  reason: string
  code: CodeLine[]
  compilerOutput: string[]
}

const scenarios: Scenario[] = [
  {
    id: 'return-pointer',
    title: 'Возврат указателя на локальную переменную',
    shortTitle: 'Return *T',
    result: 'heap',
    reason: 'Указатель возвращается из функции — переменная должна пережить stack frame',
    code: [
      { code: 'func newUser(name string) *User {' },
      { code: '    u := User{Name: name}', annotation: 'escapes to heap', annotationType: 'escape' },
      { code: '    return &u', annotation: '← причина escape', annotationType: 'escape' },
      { code: '}' },
      { code: '' },
      { code: 'func main() {' },
      { code: '    user := newUser("Alice")' },
      { code: '    fmt.Println(user.Name)' },
      { code: '}' },
    ],
    compilerOutput: [
      './main.go:2:2: moved to heap: u',
      './main.go:3:9: &u escapes to heap',
    ]
  },
  {
    id: 'local-only',
    title: 'Локальная переменная без escape',
    shortTitle: 'Local only',
    result: 'stack',
    reason: 'Переменная используется только внутри функции и не "убегает"',
    code: [
      { code: 'func sum(a, b int) int {' },
      { code: '    result := a + b', annotation: 'stack allocated', annotationType: 'stack' },
      { code: '    return result', annotation: 'копируется значение', annotationType: 'info' },
      { code: '}' },
      { code: '' },
      { code: 'func process() {' },
      { code: '    data := [4]int{1, 2, 3, 4}', annotation: 'stack allocated', annotationType: 'stack' },
      { code: '    total := 0' },
      { code: '    for _, v := range data {' },
      { code: '        total += v' },
      { code: '    }' },
      { code: '    fmt.Println(total)' },
      { code: '}' },
    ],
    compilerOutput: [
      './main.go:2:2: result does not escape',
      './main.go:7:2: data does not escape',
    ]
  },
  {
    id: 'interface-conversion',
    title: 'Присвоение в interface{}',
    shortTitle: 'Interface',
    result: 'heap',
    reason: 'Interface требует указатель на данные — компилятор не знает конкретный тип',
    code: [
      { code: 'func printAny(v any) {' },
      { code: '    fmt.Println(v)' },
      { code: '}' },
      { code: '' },
      { code: 'func main() {' },
      { code: '    x := 42', annotation: 'escapes to heap', annotationType: 'escape' },
      { code: '    printAny(x)', annotation: '← конвертация в interface{}', annotationType: 'escape' },
      { code: '' },
      { code: '    // Даже структуры:' },
      { code: '    u := User{Name: "Bob"}', annotation: 'escapes to heap', annotationType: 'escape' },
      { code: '    var i any = u', annotation: '← причина escape', annotationType: 'escape' },
      { code: '    _ = i' },
      { code: '}' },
    ],
    compilerOutput: [
      './main.go:6:2: x escapes to heap',
      './main.go:7:11: x converted to any escapes to heap',
      './main.go:10:2: u escapes to heap',
    ]
  },
  {
    id: 'closure-capture',
    title: 'Захват переменной в closure',
    shortTitle: 'Closure',
    result: 'heap',
    reason: 'Closure может пережить родительскую функцию — захваченные переменные на heap',
    code: [
      { code: 'func counter() func() int {' },
      { code: '    count := 0', annotation: 'escapes to heap', annotationType: 'escape' },
      { code: '    return func() int {', annotation: '← closure захватывает count', annotationType: 'escape' },
      { code: '        count++' },
      { code: '        return count' },
      { code: '    }' },
      { code: '}' },
      { code: '' },
      { code: 'func main() {' },
      { code: '    next := counter()' },
      { code: '    fmt.Println(next()) // 1' },
      { code: '    fmt.Println(next()) // 2' },
      { code: '}' },
    ],
    compilerOutput: [
      './main.go:2:2: moved to heap: count',
      './main.go:3:9: func literal escapes to heap',
    ]
  },
  {
    id: 'large-object',
    title: 'Слишком большой объект',
    shortTitle: 'Large obj',
    result: 'heap',
    reason: 'Объекты > ~64KB выделяются на heap независимо от escape analysis',
    code: [
      { code: 'func processLarge() {' },
      { code: '    // Маленький массив — stack' },
      { code: '    small := [1024]byte{}', annotation: 'stack allocated (1KB)', annotationType: 'stack' },
      { code: '    _ = small' },
      { code: '' },
      { code: '    // Большой массив — heap' },
      { code: '    large := [65537]byte{}', annotation: 'escapes to heap (64KB+)', annotationType: 'escape' },
      { code: '    _ = large' },
      { code: '' },
      { code: '    // make с большим размером' },
      { code: '    slice := make([]byte, 100000)', annotation: 'escapes to heap', annotationType: 'escape' },
      { code: '    _ = slice' },
      { code: '}' },
    ],
    compilerOutput: [
      './main.go:3:2: small does not escape',
      './main.go:7:2: moved to heap: large',
      './main.go:11:14: make([]byte, 100000) escapes to heap',
    ]
  },
  {
    id: 'slice-append',
    title: 'Slice и append',
    shortTitle: 'Slice/Append',
    result: 'heap',
    reason: 'slice header на stack, но backing array часто на heap из-за роста',
    code: [
      { code: 'func buildSlice() []int {' },
      { code: '    // slice header — stack, array — heap' },
      { code: '    s := make([]int, 0, 10)', annotation: 'backing array escapes', annotationType: 'escape' },
      { code: '    for i := 0; i < 10; i++ {' },
      { code: '        s = append(s, i)' },
      { code: '    }' },
      { code: '    return s', annotation: '← slice возвращается', annotationType: 'escape' },
      { code: '}' },
      { code: '' },
      { code: 'func localSlice() {' },
      { code: '    // Не убегает — может быть на stack' },
      { code: '    s := make([]int, 3)', annotation: 'может быть stack (зависит от оптимизатора)', annotationType: 'info' },
      { code: '    s[0], s[1], s[2] = 1, 2, 3' },
      { code: '    fmt.Println(s[0])' },
      { code: '}' },
    ],
    compilerOutput: [
      './main.go:3:12: make([]int, 0, 10) escapes to heap',
      './main.go:12:12: make([]int, 3) does not escape',
    ]
  }
]

const activeScenario = ref<string>('return-pointer')

const currentScenario = computed(() => {
  return scenarios.find(s => s.id === activeScenario.value) || scenarios[0]
})

function selectScenario(id: string) {
  activeScenario.value = id
}
</script>

<template>
  <div class="escape-playground">
    <div class="playground-header">
      <h3>Escape Analysis Playground</h3>
      <code class="hint">go build -gcflags='-m -m'</code>
    </div>

    <!-- Табы сценариев -->
    <div class="scenario-tabs">
      <button
        v-for="scenario in scenarios"
        :key="scenario.id"
        :class="['tab', { active: activeScenario === scenario.id }]"
        @click="selectScenario(scenario.id)"
      >
        <span :class="['result-icon', scenario.result]">
          {{ scenario.result === 'heap' ? '📦' : '📚' }}
        </span>
        {{ scenario.shortTitle }}
      </button>
    </div>

    <!-- Контент сценария -->
    <div class="scenario-content">
      <!-- Заголовок и результат -->
      <div class="scenario-header">
        <div class="scenario-title">{{ currentScenario.title }}</div>
        <div :class="['result-badge', currentScenario.result]">
          {{ currentScenario.result === 'heap' ? 'Heap' : 'Stack' }}
        </div>
      </div>

      <!-- Причина -->
      <div class="reason-box">
        <span class="reason-icon">💡</span>
        <span class="reason-text">{{ currentScenario.reason }}</span>
      </div>

      <!-- Код -->
      <div class="code-section">
        <div class="code-header">Код:</div>
        <div class="code-container">
          <pre class="code-block"><code><template v-for="(line, idx) in currentScenario.code" :key="idx"><span class="line-number">{{ String(idx + 1).padStart(2, ' ') }}</span><span :class="{ 'has-annotation': line.annotation }">{{ line.code }}</span><span v-if="line.annotation" :class="['annotation', line.annotationType]"> // {{ line.annotation }}</span>
</template></code></pre>
        </div>
      </div>

      <!-- Вывод компилятора -->
      <div class="compiler-output">
        <div class="output-header">
          <span class="output-icon">$</span>
          <code>go build -gcflags='-m -m' main.go</code>
        </div>
        <div class="output-lines">
          <div
            v-for="(line, idx) in currentScenario.compilerOutput"
            :key="idx"
            :class="['output-line', { escape: line.includes('escapes'), stack: line.includes('does not escape') }]"
          >
            {{ line }}
          </div>
        </div>
      </div>

      <!-- Легенда -->
      <div class="legend">
        <div class="legend-item">
          <span class="legend-badge stack">stack</span>
          <span>Аллокация на стеке</span>
        </div>
        <div class="legend-item">
          <span class="legend-badge escape">heap</span>
          <span>Escapes to heap</span>
        </div>
        <div class="legend-item">
          <span class="legend-badge info">info</span>
          <span>Пояснение</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.escape-playground {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.playground-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.playground-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.hint {
  background: #0d0d1a;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #7dd3fc;
}

/* Tabs */
.scenario-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #2a2a4e;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #2a2a4e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  color: #a0a0a0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s ease;
}

.tab:hover {
  background: #3a3a5e;
  color: #ffffff;
}

.tab.active {
  background: #4a4a7e;
  border-color: #6a6aae;
  color: #ffffff;
}

.result-icon {
  font-size: 14px;
}

/* Scenario content */
.scenario-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.scenario-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.scenario-title {
  font-size: 15px;
  font-weight: 600;
  color: #ffffff;
}

.result-badge {
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
}

.result-badge.heap {
  background: #3a1a1a;
  border: 1px solid #5a2a2a;
  color: #f87171;
}

.result-badge.stack {
  background: #1a3a1a;
  border: 1px solid #2a5a2a;
  color: #4ade80;
}

/* Reason box */
.reason-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  background: #252545;
  border-radius: 6px;
  border-left: 3px solid #fbbf24;
}

.reason-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.reason-text {
  font-size: 13px;
  color: #c0c0c0;
  line-height: 1.5;
}

/* Code section */
.code-section {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  overflow: hidden;
}

.code-header {
  background: #1a1a30;
  padding: 8px 16px;
  font-size: 12px;
  color: #808080;
  border-bottom: 1px solid #2a2a4e;
}

.code-container {
  overflow-x: auto;
}

.code-block {
  margin: 0;
  padding: 16px;
  font-size: 12px;
  line-height: 1.7;
}

.code-block code {
  color: #e0e0e0;
}

.line-number {
  color: #404060;
  margin-right: 16px;
  user-select: none;
}

.has-annotation {
  color: #ffffff;
}

.annotation {
  font-style: italic;
}

.annotation.stack {
  color: #4ade80;
}

.annotation.escape {
  color: #f87171;
}

.annotation.info {
  color: #60a5fa;
}

/* Compiler output */
.compiler-output {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  overflow: hidden;
}

.output-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #1a1a30;
  border-bottom: 1px solid #2a2a4e;
  font-size: 12px;
}

.output-icon {
  color: #4ade80;
  font-weight: bold;
}

.output-header code {
  color: #7dd3fc;
}

.output-lines {
  padding: 12px 16px;
  font-size: 11px;
  line-height: 1.8;
}

.output-line {
  color: #808080;
}

.output-line.escape {
  color: #f87171;
}

.output-line.stack {
  color: #4ade80;
}

/* Legend */
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 16px;
  background: #151525;
  border-radius: 4px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #a0a0a0;
}

.legend-badge {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
}

.legend-badge.stack {
  background: #1a3a1a;
  color: #4ade80;
}

.legend-badge.escape {
  background: #3a1a1a;
  color: #f87171;
}

.legend-badge.info {
  background: #1a2a3a;
  color: #60a5fa;
}

/* Mobile */
@media (max-width: 600px) {
  .scenario-tabs {
    justify-content: center;
  }

  .tab {
    flex: 1;
    min-width: 100px;
    justify-content: center;
  }
}
</style>
