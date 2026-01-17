<script setup lang="ts">
import { ref } from 'vue'

const showUnsafe = ref(false)
</script>

<template>
  <div class="slice-structure">
    <div class="diagram-title">runtime.slice (Go 1.25)</div>

    <!-- Slice Header -->
    <div class="header-section">
      <div class="section-label">Slice Header (24 bytes на 64-bit)</div>
      <div class="slice-header-box">
        <div class="header-field ptr-field">
          <div class="field-name">array</div>
          <div class="field-type">*T</div>
          <div class="field-size">8 bytes</div>
          <div class="field-value">0xc000010080</div>
        </div>
        <div class="header-field">
          <div class="field-name">len</div>
          <div class="field-type">int</div>
          <div class="field-size">8 bytes</div>
          <div class="field-value num">3</div>
        </div>
        <div class="header-field">
          <div class="field-name">cap</div>
          <div class="field-type">int</div>
          <div class="field-size">8 bytes</div>
          <div class="field-value num">6</div>
        </div>
      </div>
    </div>

    <!-- Arrow -->
    <div class="arrow-section">
      <svg class="arrow" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#fbbf24" />
          </marker>
        </defs>
        <path d="M 50 0 L 50 35" stroke="#fbbf24" stroke-width="2" marker-end="url(#arrowhead)" />
      </svg>
      <span class="arrow-label">array указывает на backing array</span>
    </div>

    <!-- Backing Array -->
    <div class="array-section">
      <div class="section-label">Backing Array @ 0xc000010080</div>
      <div class="backing-array">
        <div class="array-cell len-zone">
          <div class="cell-value">10</div>
          <div class="cell-index">[0]</div>
        </div>
        <div class="array-cell len-zone">
          <div class="cell-value">20</div>
          <div class="cell-index">[1]</div>
        </div>
        <div class="array-cell len-zone active">
          <div class="cell-value">30</div>
          <div class="cell-index">[2]</div>
        </div>
        <div class="array-cell cap-zone">
          <div class="cell-value">∅</div>
          <div class="cell-index">[3]</div>
        </div>
        <div class="array-cell cap-zone">
          <div class="cell-value">∅</div>
          <div class="cell-index">[4]</div>
        </div>
        <div class="array-cell cap-zone">
          <div class="cell-value">∅</div>
          <div class="cell-index">[5]</div>
        </div>
      </div>
      <div class="array-markers">
        <div class="marker len-marker">
          <span class="marker-bracket">[</span>
          <span class="marker-range">0:3</span>
          <span class="marker-bracket">]</span>
          <span class="marker-label">len=3</span>
        </div>
        <div class="marker cap-marker">
          <span class="marker-bracket">[</span>
          <span class="marker-range">0:6</span>
          <span class="marker-bracket">]</span>
          <span class="marker-label">cap=6</span>
        </div>
      </div>
    </div>

    <!-- Key Points -->
    <div class="key-points">
      <div class="point">
        <span class="point-icon">→</span>
        <span class="point-text">Slice header передаётся по значению (копируется)</span>
      </div>
      <div class="point">
        <span class="point-icon">→</span>
        <span class="point-text">Backing array один на несколько slice headers</span>
      </div>
      <div class="point">
        <span class="point-icon">→</span>
        <span class="point-text"><code>append</code> возвращает новый header, но может писать в тот же array</span>
      </div>
    </div>

    <!-- Toggle for unsafe code -->
    <button class="toggle-btn" @click="showUnsafe = !showUnsafe">
      {{ showUnsafe ? '▼ Скрыть' : '▶ Показать' }} unsafe.SliceData()
    </button>

    <Transition name="fade">
      <div v-if="showUnsafe" class="unsafe-section">
        <div class="code-block">
          <pre><code><span class="kw">package</span> main

<span class="kw">import</span> (
    <span class="str">"fmt"</span>
    <span class="str">"unsafe"</span>
)

<span class="kw">func</span> main() {
    s := []<span class="typ">int</span>{<span class="num">10</span>, <span class="num">20</span>, <span class="num">30</span>}

    <span class="cmt">// Go 1.20+: получаем указатель на backing array</span>
    ptr := unsafe.SliceData(s)

    fmt.Printf(<span class="str">"Slice header:\n"</span>)
    fmt.Printf(<span class="str">"  array: %p\n"</span>, ptr)
    fmt.Printf(<span class="str">"  len:   %d\n"</span>, <span class="fn">len</span>(s))
    fmt.Printf(<span class="str">"  cap:   %d\n"</span>, <span class="fn">cap</span>(s))
}</code></pre>
        </div>
        <div class="output-block">
          <div class="output-label">Output:</div>
          <pre>Slice header:
  array: 0xc000010080
  len:   3
  cap:   3</pre>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.slice-structure {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.diagram-title {
  font-size: 14px;
  font-weight: 600;
  color: #4ecdc4;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #2a2a4e;
}

.section-label {
  font-size: 11px;
  color: #808080;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

/* Slice Header Box */
.header-section {
  margin-bottom: 8px;
}

.slice-header-box {
  display: flex;
  gap: 0;
  background: #252545;
  border: 2px solid #4ecdc4;
  border-radius: 6px;
  overflow: hidden;
  width: fit-content;
}

.header-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px;
  border-right: 1px solid #3a3a5e;
  min-width: 100px;
}

.header-field:last-child {
  border-right: none;
}

.header-field.ptr-field {
  background: #2a2a4e;
}

.field-name {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 4px;
}

.field-type {
  font-size: 11px;
  color: #a78bfa;
  margin-bottom: 2px;
}

.field-size {
  font-size: 10px;
  color: #606060;
  margin-bottom: 6px;
}

.field-value {
  font-size: 12px;
  color: #fbbf24;
  font-weight: 500;
}

.field-value.num {
  color: #4ade80;
}

/* Arrow */
.arrow-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-left: 45px;
  margin: 4px 0;
}

.arrow {
  width: 100px;
  height: 35px;
}

.arrow-label {
  font-size: 10px;
  color: #fbbf24;
  margin-top: -8px;
  margin-left: 60px;
}

/* Backing Array */
.array-section {
  margin-top: 4px;
}

.backing-array {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.array-cell {
  width: 56px;
  height: 56px;
  background: #1a1a2e;
  border: 2px solid #3a3a5e;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.array-cell.len-zone {
  border-color: #4ecdc4;
  background: #1a2e2e;
}

.array-cell.len-zone.active {
  border-color: #4ade80;
  background: #1a2e1a;
}

.array-cell.cap-zone {
  border-color: #ff6b6b;
  border-style: dashed;
  background: #1a1a2e;
}

.cell-value {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.cell-index {
  font-size: 10px;
  color: #606060;
  margin-top: 2px;
}

/* Array Markers */
.array-markers {
  display: flex;
  gap: 24px;
  font-size: 11px;
}

.marker {
  display: flex;
  align-items: center;
  gap: 4px;
}

.marker-bracket {
  color: #606060;
}

.marker-range {
  font-weight: 600;
}

.len-marker .marker-range,
.len-marker .marker-label {
  color: #4ecdc4;
}

.cap-marker .marker-range,
.cap-marker .marker-label {
  color: #ff6b6b;
}

.marker-label {
  margin-left: 4px;
}

/* Key Points */
.key-points {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #2a2a4e;
}

.point {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.point-icon {
  color: #4ecdc4;
  font-weight: bold;
}

.point-text {
  color: #c0c0c0;
}

.point-text code {
  background: #2a2a4e;
  padding: 2px 6px;
  border-radius: 3px;
  color: #7dd3fc;
  font-size: 12px;
}

/* Toggle Button */
.toggle-btn {
  margin-top: 16px;
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

.toggle-btn:hover {
  background: #3a3a5e;
  color: #ffffff;
}

/* Unsafe Section */
.unsafe-section {
  margin-top: 12px;
  padding: 16px;
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
}

.code-block {
  margin-bottom: 12px;
}

.code-block pre {
  margin: 0;
  padding: 12px;
  background: #1a1a2e;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
}

.code-block code {
  color: #e0e0e0;
}

.kw { color: #ff79c6; }
.str { color: #f1fa8c; }
.typ { color: #8be9fd; }
.num { color: #bd93f9; }
.fn { color: #50fa7b; }
.cmt { color: #6272a4; }

.output-block {
  padding: 12px;
  background: #1a1a2e;
  border-radius: 4px;
  border-left: 3px solid #4ade80;
}

.output-label {
  font-size: 10px;
  color: #4ade80;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.output-block pre {
  margin: 0;
  color: #c0c0c0;
  font-size: 12px;
  line-height: 1.4;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
