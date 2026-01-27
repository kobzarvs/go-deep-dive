<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface AssertionStep {
  title: string
  description: string
  code: string
  phase: 'start' | 'check-nil' | 'check-type' | 'success' | 'fail' | 'copy'
  highlight?: string
}

const step = ref(0)
const isPlaying = ref(false)
const playInterval = ref<number | null>(null)
const assertionMode = ref<'success' | 'fail'>('success')

const successSteps: AssertionStep[] = [
  {
    title: 'Начало assertion',
    description: 'var x any = "hello" → s := x.(string)',
    code: 'var x any = "hello"\ns := x.(string)',
    phase: 'start',
  },
  {
    title: 'Проверка на nil',
    description: 'runtime проверяет: x._type != nil?',
    code: 'if x._type == nil {\n  panic("nil interface")\n}',
    phase: 'check-nil',
    highlight: 'x._type = *_type(string) ✓',
  },
  {
    title: 'Сравнение типов',
    description: 'x._type == targetType (string)?',
    code: 'if x._type != stringType {\n  panic("type mismatch")\n}',
    phase: 'check-type',
    highlight: '*_type(string) == *_type(string) ✓',
  },
  {
    title: 'Копирование значения',
    description: 'typedmemmove копирует x.data в результат',
    code: 's = *(*string)(x.data)\n// s = "hello"',
    phase: 'copy',
    highlight: 'data → "hello"',
  },
  {
    title: 'Успех!',
    description: 's теперь содержит "hello" с типом string',
    code: 's := x.(string)\n// s = "hello", type = string',
    phase: 'success',
  },
]

const failSteps: AssertionStep[] = [
  {
    title: 'Начало assertion',
    description: 'var x any = 42 → s := x.(string)',
    code: 'var x any = 42\ns := x.(string)',
    phase: 'start',
  },
  {
    title: 'Проверка на nil',
    description: 'runtime проверяет: x._type != nil?',
    code: 'if x._type == nil {\n  panic("nil interface")\n}',
    phase: 'check-nil',
    highlight: 'x._type = *_type(int) ✓',
  },
  {
    title: 'Сравнение типов',
    description: 'x._type == targetType (string)?',
    code: 'if x._type != stringType {\n  panic("type mismatch")\n}',
    phase: 'check-type',
    highlight: '*_type(int) != *_type(string) ✗',
  },
  {
    title: 'Panic!',
    description: 'Типы не совпадают → panic',
    code: 'panic: interface conversion:\n  any is int, not string',
    phase: 'fail',
  },
]

const steps = computed(() => assertionMode.value === 'success' ? successSteps : failSteps)
const currentStep = computed(() => steps.value[step.value])

function nextStep() {
  if (step.value < steps.value.length - 1) {
    step.value++
  } else {
    stopAutoPlay()
  }
}

function prevStep() {
  if (step.value > 0) {
    step.value--
  }
}

function reset() {
  stopAutoPlay()
  step.value = 0
}

function toggleAutoPlay() {
  if (isPlaying.value) {
    stopAutoPlay()
  } else {
    startAutoPlay()
  }
}

function startAutoPlay() {
  isPlaying.value = true
  playInterval.value = window.setInterval(() => {
    if (step.value < steps.value.length - 1) {
      step.value++
    } else {
      stopAutoPlay()
    }
  }, 2500)
}

function stopAutoPlay() {
  isPlaying.value = false
  if (playInterval.value) {
    clearInterval(playInterval.value)
    playInterval.value = null
  }
}

function switchMode(mode: 'success' | 'fail') {
  assertionMode.value = mode
  step.value = 0
  stopAutoPlay()
}

onUnmounted(() => {
  stopAutoPlay()
})

function getPhaseClass(phase: string) {
  return {
    'phase-start': phase === 'start',
    'phase-check': phase === 'check-nil' || phase === 'check-type',
    'phase-copy': phase === 'copy',
    'phase-success': phase === 'success',
    'phase-fail': phase === 'fail',
  }
}
</script>

<template>
  <div class="assertion-debugger">
    <div class="debugger-header">
      <h3>Type Assertion Debugger</h3>
      <div class="mode-switch">
        <button
          :class="['mode-btn', { active: assertionMode === 'success' }]"
          @click="switchMode('success')"
        >
          ✓ Success
        </button>
        <button
          :class="['mode-btn fail', { active: assertionMode === 'fail' }]"
          @click="switchMode('fail')"
        >
          ✗ Fail
        </button>
      </div>
    </div>

    <div class="controls">
      <button class="btn" :disabled="step === 0" @click="prevStep">←</button>
      <button class="btn play" @click="toggleAutoPlay">
        {{ isPlaying ? '⏸' : '▶' }}
      </button>
      <button class="btn" :disabled="step === steps.length - 1" @click="nextStep">→</button>
      <button class="btn reset" @click="reset">⟲</button>
      <div class="step-indicator">{{ step + 1 }}/{{ steps.length }}</div>
    </div>

    <div class="progress-bar">
      <div
        v-for="(s, idx) in steps"
        :key="idx"
        :class="['progress-step', getPhaseClass(s.phase), { active: idx === step, done: idx < step }]"
        @click="step = idx; stopAutoPlay()"
      >
        <span class="step-dot"></span>
        <span class="step-label">{{ s.title }}</span>
      </div>
    </div>

    <div :class="['step-content', getPhaseClass(currentStep.phase)]">
      <div class="step-header">
        <span class="step-title">{{ currentStep.title }}</span>
        <span v-if="currentStep.highlight" class="step-highlight">
          {{ currentStep.highlight }}
        </span>
      </div>
      <div class="step-description">{{ currentStep.description }}</div>
      <pre class="step-code"><code>{{ currentStep.code }}</code></pre>
    </div>

    <div class="flow-diagram">
      <div class="flow-title">Assertion Flow</div>
      <div class="flow-steps">
        <div :class="['flow-node', { active: step >= 0 }]">
          <span class="flow-icon">📥</span>
          <span class="flow-label">Input</span>
        </div>
        <span class="flow-arrow">→</span>
        <div :class="['flow-node', { active: step >= 1 }]">
          <span class="flow-icon">❓</span>
          <span class="flow-label">nil?</span>
        </div>
        <span class="flow-arrow">→</span>
        <div :class="['flow-node', { active: step >= 2 }]">
          <span class="flow-icon">🔍</span>
          <span class="flow-label">type?</span>
        </div>
        <span class="flow-arrow">→</span>
        <div v-if="assertionMode === 'success'" :class="['flow-node success', { active: step >= 3 }]">
          <span class="flow-icon">📤</span>
          <span class="flow-label">copy</span>
        </div>
        <div v-else :class="['flow-node fail', { active: step >= 3 }]">
          <span class="flow-icon">💥</span>
          <span class="flow-label">panic</span>
        </div>
      </div>
    </div>

    <div class="comma-ok-section">
      <div class="comma-ok-title">💡 Comma-ok pattern (без panic)</div>
      <pre class="comma-ok-code"><code>s, ok := x.(string)
if ok {
    // s содержит значение
} else {
    // assertion не удался, s = ""
}</code></pre>
    </div>
  </div>
</template>

<style scoped>
.assertion-debugger {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.debugger-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.debugger-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.mode-switch {
  display: flex;
  gap: 8px;
}

.mode-btn {
  padding: 6px 14px;
  background: #2a2a4e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  color: #a0a0a0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  background: #3a3a5e;
}

.mode-btn.active {
  background: #1a3a1a;
  border-color: #4ade80;
  color: #4ade80;
}

.mode-btn.fail.active {
  background: #3a1a1a;
  border-color: #f87171;
  color: #f87171;
}

.controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
}

.btn {
  padding: 6px 12px;
  background: #3a3a5e;
  border: 1px solid #4a4a7e;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  transition: all 0.2s ease;
  min-width: 36px;
}

.btn:hover:not(:disabled) {
  background: #4a4a7e;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn.play {
  background: #2a5a2a;
  border-color: #3a7a3a;
}

.btn.reset {
  background: #2a2a4e;
}

.step-indicator {
  background: #4a4a7e;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  margin-left: 8px;
}

.progress-bar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 8px;
  flex-wrap: wrap;
}

.progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  opacity: 0.4;
  transition: all 0.2s ease;
}

.progress-step.done,
.progress-step.active {
  opacity: 1;
}

.step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #4a4a7e;
  transition: all 0.2s ease;
}

.progress-step.active .step-dot {
  transform: scale(1.3);
}

.progress-step.phase-start .step-dot { background: #4ecdc4; }
.progress-step.phase-check .step-dot { background: #fbbf24; }
.progress-step.phase-copy .step-dot { background: #4ade80; }
.progress-step.phase-success .step-dot { background: #4ade80; }
.progress-step.phase-fail .step-dot { background: #f87171; }

.step-label {
  font-size: 9px;
  color: #808080;
  text-align: center;
}

.step-content {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
  border-left: 4px solid #4a4a7e;
}

.step-content.phase-start { border-left-color: #4ecdc4; }
.step-content.phase-check { border-left-color: #fbbf24; }
.step-content.phase-copy { border-left-color: #4ade80; }
.step-content.phase-success { border-left-color: #4ade80; background: #1a3a1a; }
.step-content.phase-fail { border-left-color: #f87171; background: #3a1a1a; }

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.step-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.step-highlight {
  font-size: 11px;
  padding: 4px 8px;
  background: #0d0d1a;
  border-radius: 4px;
  color: #4ecdc4;
}

.step-description {
  font-size: 12px;
  color: #a0a0a0;
  margin-bottom: 12px;
}

.step-code {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 4px;
  padding: 12px;
  margin: 0;
  font-size: 12px;
  overflow-x: auto;
}

.step-code code {
  color: #e0e0e0;
}

.flow-diagram {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.flow-title {
  font-size: 11px;
  color: #808080;
  margin-bottom: 12px;
  text-transform: uppercase;
}

.flow-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.flow-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: #1a1a2e;
  border: 2px solid #3a3a5e;
  border-radius: 6px;
  opacity: 0.4;
  transition: all 0.2s ease;
}

.flow-node.active {
  opacity: 1;
  border-color: #4ecdc4;
}

.flow-node.success.active {
  border-color: #4ade80;
}

.flow-node.fail.active {
  border-color: #f87171;
}

.flow-icon {
  font-size: 20px;
}

.flow-label {
  font-size: 10px;
  color: #a0a0a0;
}

.flow-arrow {
  color: #4a4a7e;
  font-size: 16px;
}

.comma-ok-section {
  background: #252545;
  border-radius: 6px;
  padding: 12px;
}

.comma-ok-title {
  font-size: 12px;
  color: #4ecdc4;
  margin-bottom: 8px;
}

.comma-ok-code {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 4px;
  padding: 10px;
  margin: 0;
  font-size: 11px;
}

.comma-ok-code code {
  color: #a0a0a0;
}

@media (max-width: 500px) {
  .progress-bar {
    justify-content: center;
  }

  .step-label {
    display: none;
  }
}
</style>
