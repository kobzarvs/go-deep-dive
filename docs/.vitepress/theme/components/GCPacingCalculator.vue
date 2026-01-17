<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const gogc = ref(100)
const gogcOff = ref(false)
const gomemlimit = ref(0) // 0 = disabled
const gomemlimitEnabled = ref(false)
const liveHeap = ref(100) // MB
const nonHeapMemory = ref(50) // MB (stacks, globals, etc)

// Формулы из runtime/mgcpacer.go
const gcGoalRatio = computed(() => {
  if (gogcOff.value) return Infinity
  return gogc.value / 100
})

// Эффективный GOGC с учётом GOMEMLIMIT
const effectiveGOGC = computed(() => {
  if (gogcOff.value) return 'off'
  if (!gomemlimitEnabled.value || gomemlimit.value === 0) {
    return gogc.value
  }

  // Формула: effectiveGOGC = min(GOGC, (GOMEMLIMIT - nonHeap - live) / live * 100)
  const availableForGrowth = gomemlimit.value - nonHeapMemory.value - liveHeap.value
  if (availableForGrowth <= 0) return 0

  const limitBasedGOGC = (availableForGrowth / liveHeap.value) * 100
  return Math.min(gogc.value, Math.round(limitBasedGOGC))
})

// Trigger point (когда GC запустится)
const gcTrigger = computed(() => {
  if (gogcOff.value) return Infinity
  const effGogc = typeof effectiveGOGC.value === 'number' ? effectiveGOGC.value : 0
  return Math.round(liveHeap.value * (1 + effGogc / 100))
})

// Goal (ожидаемый heap после GC)
const gcGoal = computed(() => {
  if (gogcOff.value) return Infinity
  const effGogc = typeof effectiveGOGC.value === 'number' ? effectiveGOGC.value : 0
  // Goal немного выше trigger из-за concurrent allocations
  return Math.round(liveHeap.value * (1 + effGogc / 100) * 1.1)
})

// Максимальный heap (с учётом GOMEMLIMIT)
const maxHeap = computed(() => {
  if (gomemlimitEnabled.value && gomemlimit.value > 0) {
    return gomemlimit.value - nonHeapMemory.value
  }
  return gcGoal.value
})

// GC overhead estimation
const estimatedGCOverhead = computed(() => {
  if (gogcOff.value) return 0
  const effGogc = typeof effectiveGOGC.value === 'number' ? effectiveGOGC.value : 100
  // Приблизительная формула: overhead ≈ 100 / (GOGC + 100) * 100
  return Math.round(100 / (effGogc + 100) * 100)
})

// Heap growth визуализация
const heapBars = computed(() => {
  const max = Math.max(
    gomemlimitEnabled.value && gomemlimit.value > 0 ? gomemlimit.value : 0,
    gcGoal.value === Infinity ? liveHeap.value * 3 : gcGoal.value,
    500
  )

  return {
    live: (liveHeap.value / max) * 100,
    trigger: gcTrigger.value === Infinity ? 100 : (gcTrigger.value / max) * 100,
    goal: gcGoal.value === Infinity ? 100 : (gcGoal.value / max) * 100,
    limit: gomemlimitEnabled.value && gomemlimit.value > 0 ? ((gomemlimit.value - nonHeapMemory.value) / max) * 100 : 0,
    max,
  }
})

function formatMB(value: number): string {
  if (value === Infinity) return '∞'
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`
  return `${value} MB`
}

// Presets
function applyPreset(preset: string) {
  switch (preset) {
    case 'default':
      gogc.value = 100
      gogcOff.value = false
      gomemlimitEnabled.value = false
      gomemlimit.value = 0
      liveHeap.value = 100
      nonHeapMemory.value = 50
      break
    case 'memory_constrained':
      gogc.value = 100
      gogcOff.value = false
      gomemlimitEnabled.value = true
      gomemlimit.value = 256
      liveHeap.value = 100
      nonHeapMemory.value = 50
      break
    case 'throughput':
      gogc.value = 400
      gogcOff.value = false
      gomemlimitEnabled.value = false
      gomemlimit.value = 0
      liveHeap.value = 100
      nonHeapMemory.value = 50
      break
    case 'low_latency':
      gogc.value = 50
      gogcOff.value = false
      gomemlimitEnabled.value = true
      gomemlimit.value = 512
      liveHeap.value = 100
      nonHeapMemory.value = 50
      break
    case 'large_heap':
      gogc.value = 100
      gogcOff.value = false
      gomemlimitEnabled.value = true
      gomemlimit.value = 8192
      liveHeap.value = 4000
      nonHeapMemory.value = 200
      break
  }
}

watch(gogcOff, (off) => {
  if (off) {
    gomemlimitEnabled.value = false
  }
})
</script>

<template>
  <div class="gc-pacing-calc">
    <div class="calc-header">
      <h3>GC Pacing Calculator</h3>
      <div class="presets">
        <button class="preset-btn" @click="applyPreset('default')">Default</button>
        <button class="preset-btn" @click="applyPreset('memory_constrained')">Memory Constrained</button>
        <button class="preset-btn" @click="applyPreset('throughput')">Throughput</button>
        <button class="preset-btn" @click="applyPreset('low_latency')">Low Latency</button>
        <button class="preset-btn" @click="applyPreset('large_heap')">Large Heap</button>
      </div>
    </div>

    <div class="calc-content">
      <!-- Inputs -->
      <div class="inputs-section">
        <div class="input-group">
          <div class="input-header">
            <label>GOGC</label>
            <span class="input-value">{{ gogcOff ? 'off' : gogc }}</span>
          </div>
          <div class="input-controls">
            <input
              type="range"
              v-model.number="gogc"
              :disabled="gogcOff"
              min="10"
              max="500"
              step="10"
              class="slider"
            />
            <label class="checkbox">
              <input type="checkbox" v-model="gogcOff" />
              <span>off (GOGC=off)</span>
            </label>
          </div>
          <div class="input-hint">
            GOGC=100 означает: GC trigger когда heap удвоится
          </div>
        </div>

        <div class="input-group">
          <div class="input-header">
            <label>GOMEMLIMIT</label>
            <span class="input-value">
              {{ gomemlimitEnabled ? formatMB(gomemlimit) : 'disabled' }}
            </span>
          </div>
          <div class="input-controls">
            <label class="checkbox">
              <input type="checkbox" v-model="gomemlimitEnabled" :disabled="gogcOff" />
              <span>Enabled</span>
            </label>
            <input
              v-if="gomemlimitEnabled"
              type="range"
              v-model.number="gomemlimit"
              min="128"
              max="16384"
              step="64"
              class="slider"
            />
          </div>
          <div class="input-hint">
            Soft memory limit (Go 1.19+). GC будет агрессивнее при приближении к лимиту.
          </div>
        </div>

        <div class="input-group">
          <div class="input-header">
            <label>Live Heap</label>
            <span class="input-value">{{ formatMB(liveHeap) }}</span>
          </div>
          <input
            type="range"
            v-model.number="liveHeap"
            min="10"
            max="8000"
            step="10"
            class="slider"
          />
          <div class="input-hint">
            Живые данные в heap после GC
          </div>
        </div>

        <div class="input-group">
          <div class="input-header">
            <label>Non-Heap Memory</label>
            <span class="input-value">{{ formatMB(nonHeapMemory) }}</span>
          </div>
          <input
            type="range"
            v-model.number="nonHeapMemory"
            min="10"
            max="500"
            step="10"
            class="slider"
          />
          <div class="input-hint">
            Стеки горутин, globals, runtime structures
          </div>
        </div>
      </div>

      <!-- Results -->
      <div class="results-section">
        <div class="result-card">
          <div class="result-label">Effective GOGC</div>
          <div :class="['result-value', { warning: effectiveGOGC !== gogc && !gogcOff.value }]">
            {{ effectiveGOGC }}
          </div>
          <div class="result-note" v-if="effectiveGOGC !== gogc && !gogcOff.value">
            Уменьшен из-за GOMEMLIMIT
          </div>
        </div>

        <div class="result-card">
          <div class="result-label">GC Trigger</div>
          <div class="result-value">{{ formatMB(gcTrigger) }}</div>
          <div class="result-note">heapLive × (1 + GOGC/100)</div>
        </div>

        <div class="result-card">
          <div class="result-label">GC Goal</div>
          <div class="result-value">{{ formatMB(gcGoal) }}</div>
          <div class="result-note">Ожидаемый heap после marking</div>
        </div>

        <div class="result-card">
          <div class="result-label">Max Heap</div>
          <div :class="['result-value', { limit: gomemlimitEnabled && gomemlimit > 0 }]">
            {{ formatMB(maxHeap) }}
          </div>
          <div class="result-note">
            {{ gomemlimitEnabled && gomemlimit > 0 ? 'GOMEMLIMIT - nonHeap' : 'Не ограничен' }}
          </div>
        </div>

        <div class="result-card">
          <div class="result-label">Est. GC Overhead</div>
          <div :class="['result-value', { warning: estimatedGCOverhead > 10, danger: estimatedGCOverhead > 25 }]">
            ~{{ estimatedGCOverhead }}%
          </div>
          <div class="result-note">CPU на GC (приблизительно)</div>
        </div>
      </div>

      <!-- Heap visualization -->
      <div class="heap-viz">
        <div class="viz-header">Heap Growth Visualization</div>
        <div class="heap-bar-container">
          <div class="heap-bar">
            <!-- Live heap -->
            <div
              class="bar-segment live"
              :style="{ width: heapBars.live + '%' }"
            >
              <span v-if="heapBars.live > 15">Live</span>
            </div>
            <!-- Growth until trigger -->
            <div
              v-if="gcTrigger !== Infinity"
              class="bar-segment growth"
              :style="{ width: (heapBars.trigger - heapBars.live) + '%' }"
            >
              <span v-if="(heapBars.trigger - heapBars.live) > 15">Growth</span>
            </div>
            <!-- Goal overshoot -->
            <div
              v-if="gcGoal !== Infinity && heapBars.goal > heapBars.trigger"
              class="bar-segment overshoot"
              :style="{ width: (heapBars.goal - heapBars.trigger) + '%' }"
            />
          </div>

          <!-- Markers -->
          <div class="bar-markers">
            <div
              class="marker trigger"
              :style="{ left: heapBars.trigger + '%' }"
              v-if="gcTrigger !== Infinity"
            >
              <div class="marker-line"></div>
              <div class="marker-label">Trigger</div>
            </div>
            <div
              class="marker goal"
              :style="{ left: heapBars.goal + '%' }"
              v-if="gcGoal !== Infinity"
            >
              <div class="marker-line"></div>
              <div class="marker-label">Goal</div>
            </div>
            <div
              class="marker limit"
              :style="{ left: heapBars.limit + '%' }"
              v-if="gomemlimitEnabled && gomemlimit > 0"
            >
              <div class="marker-line"></div>
              <div class="marker-label">Limit</div>
            </div>
          </div>
        </div>

        <div class="viz-legend">
          <div class="legend-item">
            <span class="legend-color live"></span>
            <span>Live Heap: {{ formatMB(liveHeap) }}</span>
          </div>
          <div class="legend-item" v-if="gcTrigger !== Infinity">
            <span class="legend-color growth"></span>
            <span>Growth until GC: {{ formatMB(gcTrigger - liveHeap) }}</span>
          </div>
          <div class="legend-item" v-if="gomemlimitEnabled && gomemlimit > 0">
            <span class="legend-color limit"></span>
            <span>GOMEMLIMIT: {{ formatMB(gomemlimit) }}</span>
          </div>
        </div>
      </div>

      <!-- Formula -->
      <div class="formula-section">
        <div class="formula-header">Формулы из runtime/mgcpacer.go</div>
        <div class="formula-content">
          <div class="formula">
            <code>trigger = heapLive × (1 + GOGC/100)</code>
          </div>
          <div class="formula">
            <code>effectiveGOGC = min(GOGC, (GOMEMLIMIT - nonHeap - live) / live × 100)</code>
          </div>
          <div class="formula">
            <code>gcCPUFraction ≈ 100 / (GOGC + 100)</code>
          </div>
        </div>
      </div>

      <!-- Recommendations -->
      <div class="recommendations">
        <div class="rec-header">Рекомендации</div>
        <div class="rec-list">
          <div class="rec-item" v-if="gogcOff">
            ⚠️ GOGC=off отключает GC! Используйте только для краткоживущих процессов.
          </div>
          <div class="rec-item" v-if="effectiveGOGC !== gogc && !gogcOff && typeof effectiveGOGC === 'number'">
            ℹ️ GOMEMLIMIT снизил эффективный GOGC с {{ gogc }} до {{ effectiveGOGC }}.
          </div>
          <div class="rec-item" v-if="estimatedGCOverhead > 25">
            🔴 GC overhead > 25%! Увеличьте GOGC или GOMEMLIMIT.
          </div>
          <div class="rec-item" v-if="estimatedGCOverhead > 10 && estimatedGCOverhead <= 25">
            ⚠️ GC overhead {{ estimatedGCOverhead }}% — повышен. Для throughput увеличьте GOGC.
          </div>
          <div class="rec-item" v-if="liveHeap > 1000 && !gomemlimitEnabled">
            💡 Для large heap (> 1GB) рекомендуется GOMEMLIMIT для предсказуемого memory usage.
          </div>
          <div class="rec-item" v-if="gomemlimitEnabled && gcTrigger > gomemlimit - nonHeapMemory">
            🔴 Trigger превышает лимит! GC будет форсироваться.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gc-pacing-calc {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.calc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.calc-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-btn {
  padding: 4px 10px;
  background: #2a2a4e;
  border: 1px solid #3a3a5e;
  border-radius: 4px;
  color: #a0a0a0;
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  background: #3a3a5e;
  color: #e0e0e0;
}

.calc-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Inputs */
.inputs-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.input-group {
  background: #252545;
  border-radius: 6px;
  padding: 14px;
}

.input-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.input-header label {
  font-size: 12px;
  color: #a0a0a0;
}

.input-value {
  font-size: 14px;
  font-weight: 600;
  color: #4ecdc4;
}

.input-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #3a3a5e;
  -webkit-appearance: none;
  appearance: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4ecdc4;
  cursor: pointer;
  transition: all 0.2s ease;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.slider:disabled {
  opacity: 0.4;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #808080;
  cursor: pointer;
}

.checkbox input {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.input-hint {
  margin-top: 8px;
  font-size: 10px;
  color: #606080;
  line-height: 1.4;
}

/* Results */
.results-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.result-card {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
  text-align: center;
}

.result-label {
  font-size: 10px;
  color: #808080;
  margin-bottom: 6px;
}

.result-value {
  font-size: 18px;
  font-weight: 700;
  color: #4ecdc4;
}

.result-value.warning {
  color: #fbbf24;
}

.result-value.danger {
  color: #f87171;
}

.result-value.limit {
  color: #f472b6;
}

.result-note {
  font-size: 9px;
  color: #606080;
  margin-top: 6px;
}

/* Heap visualization */
.heap-viz {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.viz-header {
  font-size: 12px;
  color: #808080;
  margin-bottom: 16px;
}

.heap-bar-container {
  position: relative;
  margin-bottom: 40px;
}

.heap-bar {
  height: 32px;
  background: #0d0d1a;
  border-radius: 4px;
  display: flex;
  overflow: hidden;
}

.bar-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
  transition: all 0.3s ease;
}

.bar-segment.live {
  background: #166534;
}

.bar-segment.growth {
  background: #1e40af;
}

.bar-segment.overshoot {
  background: #7c3aed;
}

.bar-markers {
  position: relative;
  height: 30px;
}

.marker {
  position: absolute;
  transform: translateX(-50%);
}

.marker-line {
  width: 2px;
  height: 12px;
  margin: 0 auto;
}

.marker-label {
  font-size: 9px;
  margin-top: 4px;
  white-space: nowrap;
}

.marker.trigger .marker-line {
  background: #fbbf24;
}

.marker.trigger .marker-label {
  color: #fbbf24;
}

.marker.goal .marker-line {
  background: #a78bfa;
}

.marker.goal .marker-label {
  color: #a78bfa;
}

.marker.limit .marker-line {
  background: #f87171;
}

.marker.limit .marker-label {
  color: #f87171;
}

.viz-legend {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: #a0a0a0;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-color.live {
  background: #166534;
}

.legend-color.growth {
  background: #1e40af;
}

.legend-color.limit {
  background: #f87171;
}

/* Formula */
.formula-section {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 16px;
}

.formula-header {
  font-size: 11px;
  color: #808080;
  margin-bottom: 12px;
}

.formula-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.formula code {
  display: block;
  background: #252545;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 11px;
  color: #4ecdc4;
}

/* Recommendations */
.recommendations {
  background: #252535;
  border: 1px solid #3a3a4e;
  border-radius: 6px;
  padding: 16px;
}

.rec-header {
  font-size: 12px;
  color: #808080;
  margin-bottom: 12px;
}

.rec-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rec-item {
  font-size: 11px;
  color: #a0a0a0;
  padding: 8px 12px;
  background: #1a1a2e;
  border-radius: 4px;
  line-height: 1.4;
}

@media (max-width: 600px) {
  .inputs-section {
    grid-template-columns: 1fr;
  }

  .results-section {
    grid-template-columns: repeat(2, 1fr);
  }

  .presets {
    width: 100%;
  }

  .preset-btn {
    flex: 1;
  }
}
</style>
