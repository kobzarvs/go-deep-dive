<script setup lang="ts">
import { ref } from 'vue'

const showDetails = ref(false)

const gStruct = [
  { field: 'stack.lo', value: '0xc000030000', desc: 'Нижняя граница стека' },
  { field: 'stack.hi', value: '0xc000032000', desc: 'Верхняя граница (lo + size)' },
  { field: 'stackguard0', value: '0xc000030370', desc: 'Триггер для morestack' },
  { field: 'stackguard1', value: '0xc000030370', desc: 'Для C stack (cgo)' },
]
</script>

<template>
  <div class="stack-layout">
    <div class="layout-header">
      <h3>Stack Frame Layout</h3>
      <button class="toggle-btn" @click="showDetails = !showDetails">
        {{ showDetails ? 'Скрыть runtime.g' : 'Показать runtime.g' }}
      </button>
    </div>

    <!-- ASCII диаграмма -->
    <div class="ascii-diagram">
      <pre class="diagram-content"><span class="addr">0xc000032000</span>   <span class="border">┌────────────────────────────────────────┐</span>  <span class="label-hi">◄── stack.hi</span>
               <span class="border">│</span>                                        <span class="border">│</span>
               <span class="border">│</span>          <span class="free">(свободное место)</span>             <span class="border">│</span>
               <span class="border">│</span>             <span class="arrow">↓ рост стека</span>               <span class="border">│</span>
               <span class="border">│</span>                                        <span class="border">│</span>
               <span class="border">├────────────────────────────────────────┤</span>  <span class="label-sp">◄── SP (текущий)</span>
               <span class="border">│</span> <span class="frame-header">main.main()</span>                            <span class="border">│</span>
               <span class="border">│</span>   <span class="border">├──</span> <span class="ret-addr">Return Address</span>          <span class="size">8 bytes</span>  <span class="border">│</span>
               <span class="border">│</span>   <span class="border">├──</span> <span class="frame-ptr">Frame Pointer (BP)</span>      <span class="size">8 bytes</span>  <span class="border">│</span>
               <span class="border">│</span>   <span class="border">├──</span> <span class="local">Local: result int</span>       <span class="size">8 bytes</span>  <span class="border">│</span>
               <span class="border">│</span>   <span class="border">└──</span> <span class="local">Local: data []byte</span>     <span class="size">24 bytes</span>  <span class="border">│</span>
               <span class="border">├────────────────────────────────────────┤</span>
               <span class="border">│</span> <span class="frame-header">main.processData()</span>                     <span class="border">│</span>
               <span class="border">│</span>   <span class="border">├──</span> <span class="ret-addr">Return Address</span>          <span class="size">8 bytes</span>  <span class="border">│</span>
               <span class="border">│</span>   <span class="border">├──</span> <span class="frame-ptr">Frame Pointer (BP)</span>      <span class="size">8 bytes</span>  <span class="border">│</span>
               <span class="border">│</span>   <span class="border">├──</span> <span class="arg">Arg: input []byte</span>      <span class="size">24 bytes</span>  <span class="border">│</span>
               <span class="border">│</span>   <span class="border">├──</span> <span class="local">Local: buf [64]byte</span>    <span class="size">64 bytes</span>  <span class="border">│</span>
               <span class="border">│</span>   <span class="border">└──</span> <span class="local">Local: n int</span>            <span class="size">8 bytes</span>  <span class="border">│</span>
               <span class="border">├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤</span>  <span class="label-guard">◄── stackguard0</span>
               <span class="border">│</span>                                        <span class="border">│</span>
               <span class="border">│</span>        <span class="guard">Guard Zone (928 bytes)</span>          <span class="border">│</span>
               <span class="border">│</span>    <span class="guard-desc">проверка переполнения стека</span>         <span class="border">│</span>
               <span class="border">│</span>                                        <span class="border">│</span>
<span class="addr">0xc000030000</span>   <span class="border">└────────────────────────────────────────┘</span>  <span class="label-lo">◄── stack.lo</span></pre>
    </div>

    <!-- Легенда -->
    <div class="legend">
      <div class="legend-item">
        <span class="legend-box ret-addr-bg"></span>
        <span>Return Address</span>
      </div>
      <div class="legend-item">
        <span class="legend-box frame-ptr-bg"></span>
        <span>Frame Pointer</span>
      </div>
      <div class="legend-item">
        <span class="legend-box arg-bg"></span>
        <span>Arguments</span>
      </div>
      <div class="legend-item">
        <span class="legend-box local-bg"></span>
        <span>Local Variables</span>
      </div>
    </div>

    <!-- runtime.g структура -->
    <Transition name="slide">
      <div v-if="showDetails" class="g-struct">
        <div class="struct-header">
          <code>runtime.g</code> — структура горутины
        </div>
        <pre class="struct-code">type g struct {
    stack       stack   <span class="comment">// lo и hi границы стека</span>
    stackguard0 uintptr <span class="comment">// проверка в Go коде</span>
    stackguard1 uintptr <span class="comment">// проверка в C коде (cgo)</span>
    <span class="comment">// ... другие поля</span>
}

type stack struct {
    lo uintptr <span class="comment">// 0xc000030000</span>
    hi uintptr <span class="comment">// 0xc000032000 (lo + 8KB)</span>
}</pre>
        <div class="struct-fields">
          <div v-for="item in gStruct" :key="item.field" class="struct-field">
            <span class="field-name">{{ item.field }}</span>
            <span class="field-value">{{ item.value }}</span>
            <span class="field-desc">{{ item.desc }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.stack-layout {
  background: #0f1219;
  border: 1px solid #2d3748;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #e2e8f0;
  margin: 24px 0;
  overflow-x: auto;
}

.layout-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.layout-header h3 {
  margin: 0;
  font-size: 16px;
  color: #f7fafc;
}

.toggle-btn {
  padding: 6px 12px;
  background: #2d3748;
  border: 1px solid #4a5568;
  border-radius: 4px;
  color: #a0aec0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: all 0.2s ease;
}

.toggle-btn:hover {
  background: #4a5568;
  color: #f7fafc;
}

/* ASCII Diagram */
.ascii-diagram {
  overflow-x: auto;
  margin-bottom: 16px;
}

.diagram-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.2;
  white-space: pre;
  color: #a0aec0;
}

/* Цвета для элементов диаграммы */
.border { color: #4a5568; }
.addr { color: #68d391; font-weight: bold; }
.free { color: #718096; font-style: italic; }
.arrow { color: #63b3ed; }
.size { color: #718096; }

.frame-header { color: #f6e05e; font-weight: bold; }
.ret-addr { color: #fc8181; }
.frame-ptr { color: #b794f4; }
.arg { color: #63b3ed; }
.local { color: #68d391; }

.guard { color: #fc8181; font-weight: bold; }
.guard-desc { color: #718096; font-style: italic; }

.label-hi { color: #68d391; }
.label-lo { color: #63b3ed; }
.label-sp { color: #f6e05e; }
.label-guard { color: #fc8181; }

/* Легенда */
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 12px 16px;
  background: #1a202c;
  border-radius: 4px;
  margin-bottom: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #a0aec0;
}

.legend-box {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}

.ret-addr-bg { background: #fc8181; }
.frame-ptr-bg { background: #b794f4; }
.arg-bg { background: #63b3ed; }
.local-bg { background: #68d391; }

/* runtime.g структура */
.g-struct {
  background: #1a202c;
  border: 1px solid #2d3748;
  border-radius: 6px;
  overflow: hidden;
}

.struct-header {
  background: #2d3748;
  padding: 10px 16px;
  font-size: 13px;
  color: #f7fafc;
}

.struct-header code {
  color: #63b3ed;
  background: #1a202c;
  padding: 2px 6px;
  border-radius: 3px;
}

.struct-code {
  margin: 0;
  padding: 16px;
  font-size: 12px;
  line-height: 1.2;
  color: #e2e8f0;
  border-bottom: 1px solid #2d3748;
}

.struct-code .comment {
  color: #718096;
}

.struct-fields {
  padding: 12px 16px;
}

.struct-field {
  display: grid;
  grid-template-columns: 110px 130px 1fr;
  gap: 12px;
  padding: 6px 0;
  font-size: 12px;
  border-bottom: 1px solid #2d3748;
}

.struct-field:last-child {
  border-bottom: none;
}

.field-name {
  color: #63b3ed;
  font-weight: 500;
}

.field-value {
  color: #68d391;
  font-family: monospace;
}

.field-desc {
  color: #718096;
}

/* Transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Mobile */
@media (max-width: 640px) {
  .diagram-content {
    font-size: 10px;
  }

  .struct-field {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .legend {
    gap: 12px;
  }
}
</style>
