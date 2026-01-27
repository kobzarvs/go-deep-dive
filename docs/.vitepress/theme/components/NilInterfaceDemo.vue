<script setup lang="ts">
import { ref, computed } from 'vue'

interface Scenario {
  id: string
  title: string
  code: string
  tabValue: string
  dataValue: string
  isNil: boolean
  explanation: string
}

const scenarios: Scenario[] = [
  {
    id: 'true-nil',
    title: 'True nil interface',
    code: 'var err error\n// err == nil',
    tabValue: 'nil',
    dataValue: 'nil',
    isNil: true,
    explanation: 'Оба поля nil → интерфейс равен nil',
  },
  {
    id: 'explicit-nil',
    title: 'Явное присваивание nil',
    code: 'var err error = nil\n// err == nil',
    tabValue: 'nil',
    dataValue: 'nil',
    isNil: true,
    explanation: 'Untyped nil → оба поля остаются nil',
  },
  {
    id: 'typed-nil',
    title: 'Typed nil pointer ⚠️',
    code: 'var p *MyError = nil\nvar err error = p\n// err != nil !',
    tabValue: '*_type(MyError)',
    dataValue: 'nil',
    isNil: false,
    explanation: 'tab хранит тип *MyError → интерфейс НЕ nil!',
  },
  {
    id: 'nil-return',
    title: 'Return typed nil ⚠️',
    code: 'func getErr() error {\n  var e *MyError\n  return e  // typed nil\n}',
    tabValue: '*_type(MyError)',
    dataValue: 'nil',
    isNil: false,
    explanation: 'Функция возвращает typed nil → caller получит != nil',
  },
  {
    id: 'concrete-value',
    title: 'Конкретное значение',
    code: 'var err error = &MyError{msg: "fail"}\n// err != nil',
    tabValue: '*_type(MyError)',
    dataValue: '&MyError{...}',
    isNil: false,
    explanation: 'Оба поля не nil → интерфейс не nil (ожидаемо)',
  },
  {
    id: 'correct-return',
    title: 'Правильный return nil ✓',
    code: 'func getErr() error {\n  if ok {\n    return nil  // явный nil\n  }\n  return &MyError{}\n}',
    tabValue: 'nil',
    dataValue: 'nil',
    isNil: true,
    explanation: 'Явный return nil → true nil interface',
  },
]

const selectedScenario = ref<string>('true-nil')

const currentScenario = computed(() =>
  scenarios.find(s => s.id === selectedScenario.value) || scenarios[0]
)
</script>

<template>
  <div class="nil-demo">
    <div class="demo-header">
      <h3>nil Interface Trap</h3>
    </div>

    <div class="scenario-tabs">
      <button
        v-for="scenario in scenarios"
        :key="scenario.id"
        :class="['tab-btn', { active: selectedScenario === scenario.id, danger: !scenario.isNil && scenario.id.includes('nil') }]"
        @click="selectedScenario = scenario.id"
      >
        {{ scenario.title }}
      </button>
    </div>

    <div class="demo-content">
      <div class="code-section">
        <div class="section-label">Код</div>
        <pre class="code-block"><code>{{ currentScenario.code }}</code></pre>
      </div>

      <div class="memory-section">
        <div class="section-label">iface / eface в памяти</div>
        <div class="memory-viz">
          <div class="interface-box">
            <div class="field">
              <span class="field-name">tab/_type</span>
              <span
                :class="['field-value', { nil: currentScenario.tabValue === 'nil' }]"
              >
                {{ currentScenario.tabValue }}
              </span>
            </div>
            <div class="field">
              <span class="field-name">data</span>
              <span
                :class="['field-value', { nil: currentScenario.dataValue === 'nil' }]"
              >
                {{ currentScenario.dataValue }}
              </span>
            </div>
          </div>

          <div class="comparison">
            <div class="comparison-label">interface == nil ?</div>
            <div class="comparison-formula">
              <span :class="{ nil: currentScenario.tabValue === 'nil' }">
                tab {{ currentScenario.tabValue === 'nil' ? '==' : '!=' }} nil
              </span>
              <span class="operator">&&</span>
              <span :class="{ nil: currentScenario.dataValue === 'nil' }">
                data {{ currentScenario.dataValue === 'nil' ? '==' : '!=' }} nil
              </span>
            </div>
          </div>

          <div :class="['result', { 'is-nil': currentScenario.isNil, 'not-nil': !currentScenario.isNil }]">
            <span class="result-icon">{{ currentScenario.isNil ? '✓' : '✗' }}</span>
            <span class="result-text">
              {{ currentScenario.isNil ? 'interface == nil: TRUE' : 'interface == nil: FALSE' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="explanation">
      <div class="explanation-icon">💡</div>
      <div class="explanation-text">{{ currentScenario.explanation }}</div>
    </div>

    <div class="rule-box">
      <div class="rule-title">Правило</div>
      <div class="rule-text">
        Интерфейс <code>== nil</code> только когда <strong>оба</strong> поля (tab/type и data) равны nil.
        <br>
        Typed nil pointer присвоенный интерфейсу сохраняет type info → <code>!= nil</code>.
      </div>
    </div>
  </div>
</template>

<style scoped>
.nil-demo {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.demo-header {
  margin-bottom: 16px;
}

.demo-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.scenario-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.tab-btn {
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

.tab-btn:hover {
  background: #3a3a5e;
  color: #e0e0e0;
}

.tab-btn.active {
  background: #4ecdc4;
  border-color: #4ecdc4;
  color: #0a0a0a;
}

.tab-btn.danger.active {
  background: #f87171;
  border-color: #f87171;
}

.demo-content {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.code-section,
.memory-section {
  flex: 1;
  min-width: 250px;
}

.section-label {
  font-size: 11px;
  color: #808080;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.code-block {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
}

.code-block code {
  color: #e0e0e0;
}

.memory-viz {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
}

.interface-box {
  background: #1a1a2e;
  border: 2px solid #4a4a7e;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 12px;
}

.field {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid #2a2a4e;
}

.field:last-child {
  border-bottom: none;
}

.field-name {
  font-size: 11px;
  color: #808080;
}

.field-value {
  font-size: 12px;
  color: #fbbf24;
  font-weight: 500;
}

.field-value.nil {
  color: #606080;
}

.comparison {
  margin-bottom: 12px;
  text-align: center;
}

.comparison-label {
  font-size: 11px;
  color: #808080;
  margin-bottom: 4px;
}

.comparison-formula {
  font-size: 11px;
  color: #a0a0a0;
}

.comparison-formula span.nil {
  color: #4ade80;
}

.comparison-formula .operator {
  margin: 0 8px;
  color: #606080;
}

.result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  border-radius: 4px;
  font-weight: 600;
}

.result.is-nil {
  background: #1a3a1a;
  border: 1px solid #4ade80;
  color: #4ade80;
}

.result.not-nil {
  background: #3a1a1a;
  border: 1px solid #f87171;
  color: #f87171;
}

.result-icon {
  font-size: 16px;
}

.result-text {
  font-size: 12px;
}

.explanation {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #252545;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.explanation-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.explanation-text {
  font-size: 12px;
  color: #a0a0a0;
  line-height: 1.5;
}

.rule-box {
  background: #0d0d1a;
  border: 1px solid #4ecdc4;
  border-radius: 6px;
  padding: 12px;
}

.rule-title {
  font-size: 11px;
  color: #4ecdc4;
  margin-bottom: 8px;
  text-transform: uppercase;
  font-weight: 600;
}

.rule-text {
  font-size: 12px;
  color: #a0a0a0;
  line-height: 1.6;
}

.rule-text code {
  background: #2a2a4e;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  color: #fbbf24;
}

.rule-text strong {
  color: #f87171;
}

@media (max-width: 600px) {
  .scenario-tabs {
    flex-direction: column;
  }

  .tab-btn {
    text-align: left;
  }
}
</style>
