<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'

interface Job {
  id: string
  status: 'queued' | 'processing' | 'done'
  workerId?: number
}

interface Worker {
  id: number
  status: 'idle' | 'processing'
  currentJob?: string
}

interface SimState {
  step: number
  title: string
  description: string
  jobs: Job[]
  workers: Worker[]
  results: string[]
  phase: 'init' | 'spawn' | 'send' | 'process' | 'collect' | 'done'
  codeHighlight: number[]
}

const isOpen = ref(false)
const step = ref(0)
const isPlaying = ref(false)
const playInterval = ref<number | null>(null)

const states: SimState[] = [
  {
    step: 0,
    title: '1. jobs := make(...)',
    description: 'Создаём buffered канал jobs с размером len(items)',
    jobs: [],
    workers: [],
    results: [],
    phase: 'init',
    codeHighlight: [1],
  },
  {
    step: 1,
    title: '2. results := make(...)',
    description: 'Создаём buffered канал results с размером len(items)',
    jobs: [],
    workers: [],
    results: [],
    phase: 'init',
    codeHighlight: [2],
  },
  {
    step: 2,
    title: '3. for i := 0; i < workers',
    description: 'Запускаем цикл создания воркеров',
    jobs: [],
    workers: [],
    results: [],
    phase: 'spawn',
    codeHighlight: [3],
  },
  {
    step: 3,
    title: '4. go func() — Worker 1',
    description: 'Запускаем первую горутину-воркер',
    jobs: [],
    workers: [
      { id: 1, status: 'idle' },
    ],
    results: [],
    phase: 'spawn',
    codeHighlight: [4],
  },
  {
    step: 4,
    title: '5. go func() — Worker 2',
    description: 'Запускаем вторую горутину-воркер',
    jobs: [],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
    ],
    results: [],
    phase: 'spawn',
    codeHighlight: [4],
  },
  {
    step: 5,
    title: '6. go func() — Worker 3',
    description: 'Запускаем третью горутину-воркер. Все 3 воркера ждут задачи',
    jobs: [],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: [],
    phase: 'spawn',
    codeHighlight: [4],
  },
  {
    step: 6,
    title: '7. jobs ← A',
    description: 'Producer отправляет первую задачу A в канал',
    jobs: [
      { id: 'A', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: [],
    phase: 'send',
    codeHighlight: [11],
  },
  {
    step: 7,
    title: '8. jobs ← B',
    description: 'Producer отправляет задачу B',
    jobs: [
      { id: 'A', status: 'queued' },
      { id: 'B', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: [],
    phase: 'send',
    codeHighlight: [11],
  },
  {
    step: 8,
    title: '9. jobs ← C',
    description: 'Producer отправляет задачу C',
    jobs: [
      { id: 'A', status: 'queued' },
      { id: 'B', status: 'queued' },
      { id: 'C', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: [],
    phase: 'send',
    codeHighlight: [11],
  },
  {
    step: 9,
    title: '10. jobs ← D',
    description: 'Producer отправляет задачу D',
    jobs: [
      { id: 'A', status: 'queued' },
      { id: 'B', status: 'queued' },
      { id: 'C', status: 'queued' },
      { id: 'D', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: [],
    phase: 'send',
    codeHighlight: [11],
  },
  {
    step: 10,
    title: '11. jobs ← E',
    description: 'Producer отправляет последнюю задачу E. Все 5 задач в канале',
    jobs: [
      { id: 'A', status: 'queued' },
      { id: 'B', status: 'queued' },
      { id: 'C', status: 'queued' },
      { id: 'D', status: 'queued' },
      { id: 'E', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: [],
    phase: 'send',
    codeHighlight: [11],
  },
  {
    step: 11,
    title: '12. close(jobs)',
    description: 'Producer закрыл канал. Воркеры прочитают все задачи и завершат for range',
    jobs: [
      { id: 'A', status: 'queued' },
      { id: 'B', status: 'queued' },
      { id: 'C', status: 'queued' },
      { id: 'D', status: 'queued' },
      { id: 'E', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: [],
    phase: 'send',
    codeHighlight: [13],
  },
  {
    step: 12,
    title: '13. Worker 1: for item := range jobs',
    description: 'Worker 1 забирает задачу A из канала',
    jobs: [
      { id: 'A', status: 'processing', workerId: 1 },
      { id: 'B', status: 'queued' },
      { id: 'C', status: 'queued' },
      { id: 'D', status: 'queued' },
      { id: 'E', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'processing', currentJob: 'A' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: [],
    phase: 'process',
    codeHighlight: [5],
  },
  {
    step: 13,
    title: '14. Worker 2: for item := range jobs',
    description: 'Worker 2 забирает задачу B',
    jobs: [
      { id: 'A', status: 'processing', workerId: 1 },
      { id: 'B', status: 'processing', workerId: 2 },
      { id: 'C', status: 'queued' },
      { id: 'D', status: 'queued' },
      { id: 'E', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'processing', currentJob: 'A' },
      { id: 2, status: 'processing', currentJob: 'B' },
      { id: 3, status: 'idle' },
    ],
    results: [],
    phase: 'process',
    codeHighlight: [5],
  },
  {
    step: 14,
    title: '15. Worker 3: for item := range jobs',
    description: 'Worker 3 забирает задачу C. Все воркеры заняты!',
    jobs: [
      { id: 'A', status: 'processing', workerId: 1 },
      { id: 'B', status: 'processing', workerId: 2 },
      { id: 'C', status: 'processing', workerId: 3 },
      { id: 'D', status: 'queued' },
      { id: 'E', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'processing', currentJob: 'A' },
      { id: 2, status: 'processing', currentJob: 'B' },
      { id: 3, status: 'processing', currentJob: 'C' },
    ],
    results: [],
    phase: 'process',
    codeHighlight: [5],
  },
  {
    step: 15,
    title: '16. Worker 2: results ← process(B)',
    description: 'Worker 2 первым завершил и отправил результат Rb',
    jobs: [
      { id: 'A', status: 'processing', workerId: 1 },
      { id: 'B', status: 'done', workerId: 2 },
      { id: 'C', status: 'processing', workerId: 3 },
      { id: 'D', status: 'queued' },
      { id: 'E', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'processing', currentJob: 'A' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'processing', currentJob: 'C' },
    ],
    results: ['Rb'],
    phase: 'process',
    codeHighlight: [6],
  },
  {
    step: 16,
    title: '17. Worker 2: for item := range jobs',
    description: 'Worker 2 сразу берёт следующую задачу D',
    jobs: [
      { id: 'A', status: 'processing', workerId: 1 },
      { id: 'B', status: 'done', workerId: 2 },
      { id: 'C', status: 'processing', workerId: 3 },
      { id: 'D', status: 'processing', workerId: 2 },
      { id: 'E', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'processing', currentJob: 'A' },
      { id: 2, status: 'processing', currentJob: 'D' },
      { id: 3, status: 'processing', currentJob: 'C' },
    ],
    results: ['Rb'],
    phase: 'process',
    codeHighlight: [5],
  },
  {
    step: 17,
    title: '18. Worker 1: results ← process(A)',
    description: 'Worker 1 завершил A. Порядок: Rb, Ra (не A, B!)',
    jobs: [
      { id: 'A', status: 'done', workerId: 1 },
      { id: 'B', status: 'done', workerId: 2 },
      { id: 'C', status: 'processing', workerId: 3 },
      { id: 'D', status: 'processing', workerId: 2 },
      { id: 'E', status: 'queued' },
    ],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'processing', currentJob: 'D' },
      { id: 3, status: 'processing', currentJob: 'C' },
    ],
    results: ['Rb', 'Ra'],
    phase: 'process',
    codeHighlight: [6],
  },
  {
    step: 18,
    title: '19. Worker 1: for item := range jobs',
    description: 'Worker 1 берёт последнюю задачу E',
    jobs: [
      { id: 'A', status: 'done', workerId: 1 },
      { id: 'B', status: 'done', workerId: 2 },
      { id: 'C', status: 'processing', workerId: 3 },
      { id: 'D', status: 'processing', workerId: 2 },
      { id: 'E', status: 'processing', workerId: 1 },
    ],
    workers: [
      { id: 1, status: 'processing', currentJob: 'E' },
      { id: 2, status: 'processing', currentJob: 'D' },
      { id: 3, status: 'processing', currentJob: 'C' },
    ],
    results: ['Rb', 'Ra'],
    phase: 'process',
    codeHighlight: [5],
  },
  {
    step: 19,
    title: '20. Worker 3: results ← process(C)',
    description: 'Worker 3 завершил C. Канал jobs пуст',
    jobs: [
      { id: 'A', status: 'done', workerId: 1 },
      { id: 'B', status: 'done', workerId: 2 },
      { id: 'C', status: 'done', workerId: 3 },
      { id: 'D', status: 'processing', workerId: 2 },
      { id: 'E', status: 'processing', workerId: 1 },
    ],
    workers: [
      { id: 1, status: 'processing', currentJob: 'E' },
      { id: 2, status: 'processing', currentJob: 'D' },
      { id: 3, status: 'idle' },
    ],
    results: ['Rb', 'Ra', 'Rc'],
    phase: 'process',
    codeHighlight: [6],
  },
  {
    step: 20,
    title: '21. Worker 2: results ← process(D)',
    description: 'Worker 2 завершил D',
    jobs: [
      { id: 'A', status: 'done', workerId: 1 },
      { id: 'B', status: 'done', workerId: 2 },
      { id: 'C', status: 'done', workerId: 3 },
      { id: 'D', status: 'done', workerId: 2 },
      { id: 'E', status: 'processing', workerId: 1 },
    ],
    workers: [
      { id: 1, status: 'processing', currentJob: 'E' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: ['Rb', 'Ra', 'Rc', 'Rd'],
    phase: 'process',
    codeHighlight: [6],
  },
  {
    step: 21,
    title: '22. Worker 1: results ← process(E)',
    description: 'Worker 1 завершил последнюю задачу. Все воркеры idle',
    jobs: [
      { id: 'A', status: 'done', workerId: 1 },
      { id: 'B', status: 'done', workerId: 2 },
      { id: 'C', status: 'done', workerId: 3 },
      { id: 'D', status: 'done', workerId: 2 },
      { id: 'E', status: 'done', workerId: 1 },
    ],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: ['Rb', 'Ra', 'Rc', 'Rd', 'Re'],
    phase: 'process',
    codeHighlight: [6],
  },
  {
    step: 22,
    title: '23. for range items',
    description: 'Consumer начинает собирать результаты',
    jobs: [
      { id: 'A', status: 'done', workerId: 1 },
      { id: 'B', status: 'done', workerId: 2 },
      { id: 'C', status: 'done', workerId: 3 },
      { id: 'D', status: 'done', workerId: 2 },
      { id: 'E', status: 'done', workerId: 1 },
    ],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: ['Rb', 'Ra', 'Rc', 'Rd', 'Re'],
    phase: 'collect',
    codeHighlight: [14],
  },
  {
    step: 23,
    title: '24. <-results',
    description: 'Читаем 5 результатов. Порядок Rb,Ra,Rc,Rd,Re ≠ A,B,C,D,E!',
    jobs: [
      { id: 'A', status: 'done', workerId: 1 },
      { id: 'B', status: 'done', workerId: 2 },
      { id: 'C', status: 'done', workerId: 3 },
      { id: 'D', status: 'done', workerId: 2 },
      { id: 'E', status: 'done', workerId: 1 },
    ],
    workers: [
      { id: 1, status: 'idle' },
      { id: 2, status: 'idle' },
      { id: 3, status: 'idle' },
    ],
    results: ['Rb', 'Ra', 'Rc', 'Rd', 'Re'],
    phase: 'done',
    codeHighlight: [15],
  },
]

const currentState = computed(() => states[step.value])
const maxSteps = computed(() => states.length)

function openModal() {
  isOpen.value = true
  document.body.style.overflow = 'hidden'
}

function closeModal() {
  isOpen.value = false
  stopAutoPlay()
  document.body.style.overflow = ''
}

function nextStep() {
  if (step.value < maxSteps.value - 1) {
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
    if (step.value < maxSteps.value - 1) {
      step.value++
    } else {
      stopAutoPlay()
    }
  }, 1000)
}

function stopAutoPlay() {
  isPlaying.value = false
  if (playInterval.value) {
    clearInterval(playInterval.value)
    playInterval.value = null
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!isOpen.value) return
  if (e.key === 'Escape') closeModal()
  if (e.key === 'ArrowRight') nextStep()
  if (e.key === 'ArrowLeft') prevStep()
  if (e.key === ' ') { e.preventDefault(); toggleAutoPlay() }
}

watch(isOpen, (val) => {
  if (val) {
    window.addEventListener('keydown', handleKeydown)
  } else {
    window.removeEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  stopAutoPlay()
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})

function getWorkerColor(id: number): string {
  const colors = ['#60a5fa', '#4ade80', '#fbbf24']
  return colors[(id - 1) % colors.length]
}
</script>

<template>
  <!-- Trigger button -->
  <button class="open-btn" @click="openModal">
    ▶ Запустить интерактивную анимацию Worker Pool
  </button>

  <!-- Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="closeModal">
        <div class="modal-content">
          <!-- Header -->
          <div class="modal-header">
            <h3>Worker Pool Simulation</h3>
            <div class="header-controls">
              <button class="btn" :disabled="step === 0" @click="prevStep">←</button>
              <button class="btn play" @click="toggleAutoPlay">{{ isPlaying ? '⏸' : '▶' }}</button>
              <button class="btn" :disabled="step === maxSteps - 1" @click="nextStep">→</button>
              <button class="btn" @click="reset">⟲</button>
              <span class="step-indicator">{{ step + 1 }}/{{ maxSteps }}</span>
              <button class="btn close" @click="closeModal">✕</button>
            </div>
          </div>

          <!-- Progress -->
          <div class="progress-bar">
            <div
              v-for="(_, idx) in states"
              :key="idx"
              :class="['dot', { active: idx === step, done: idx < step }]"
              @click="step = idx; stopAutoPlay()"
            />
          </div>

          <!-- State info -->
          <div class="state-info">
            <div class="state-title">{{ currentState.title }}</div>
            <div class="state-desc">{{ currentState.description }}</div>
          </div>

          <!-- Main content: 2 columns -->
          <div class="modal-body">
            <!-- Left: Visualization -->
            <div class="viz-column">
              <!-- Producer -->
              <div class="section producer">
                <div class="label">PRODUCER (main)</div>
                <div class="box">items: [A, B, C, D, E]</div>
              </div>

              <!-- Jobs Channel: visible after step 0 (jobs := make) -->
              <template v-if="step >= 1">
                <div class="arrow">↓</div>
                <div class="section">
                  <div class="label">JOBS CHANNEL</div>
                  <div class="channel jobs">
                    <TransitionGroup name="item" tag="div" class="items">
                      <span v-for="job in currentState.jobs.filter(j => j.status === 'queued')" :key="job.id" class="item job">{{ job.id }}</span>
                    </TransitionGroup>
                    <span v-if="currentState.jobs.filter(j => j.status === 'queued').length === 0" class="empty">
                      {{ currentState.phase === 'collect' || currentState.phase === 'done' ? 'closed' : 'empty' }}
                    </span>
                  </div>
                </div>
              </template>

              <!-- Workers: visible after step 2 (for loop started) -->
              <template v-if="step >= 3">
                <div class="arrow">↓</div>
                <div class="section">
                  <div class="label">WORKERS (goroutines)</div>
                  <div class="workers">
                    <div
                      v-for="w in currentState.workers"
                      :key="w.id"
                      :class="['worker', w.status]"
                      :style="{ borderColor: getWorkerColor(w.id) }"
                    >
                      <div class="w-header">
                        <span :style="{ color: getWorkerColor(w.id) }">Worker {{ w.id }}</span>
                        <span :class="['status', w.status]">{{ w.status }}</span>
                      </div>
                      <div v-if="w.currentJob" class="w-job">
                        → <span class="badge" :style="{ background: getWorkerColor(w.id) }">{{ w.currentJob }}</span>
                      </div>
                      <div v-else class="w-idle">waiting...</div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Results Channel: visible after step 1 (results := make) -->
              <template v-if="step >= 2">
                <div class="arrow">↓</div>
                <div class="section">
                  <div class="label">RESULTS CHANNEL</div>
                  <div class="channel results">
                    <TransitionGroup name="item" tag="div" class="items">
                      <span v-for="(r, i) in currentState.results" :key="r + i" class="item result">{{ r }}</span>
                    </TransitionGroup>
                    <span v-if="currentState.results.length === 0" class="empty">empty</span>
                  </div>
                </div>
              </template>

              <!-- Consumer: visible after step 1 -->
              <template v-if="step >= 2">
                <div class="arrow">↓</div>
                <div class="section consumer">
                  <div class="label">CONSUMER (main)</div>
                  <div class="box">
                    for range items { &lt;-results }
                    <div v-if="currentState.phase === 'done'" class="done-msg">✓ Собрано 5 результатов</div>
                  </div>
                </div>
              </template>
            </div>

            <!-- Right: Code -->
            <div class="code-column">
              <div class="code-label">Код:</div>
              <pre class="code"><span :class="{ hl: currentState.codeHighlight.includes(1) }"><i>jobs</i> := <f>make</f>(<k>chan</k> <t>Item</t>, <f>len</f>(<i>items</i>))</span><span :class="{ hl: currentState.codeHighlight.includes(2) }"><i>results</i> := <f>make</f>(<k>chan</k> <t>Result</t>, <f>len</f>(<i>items</i>))</span><span :class="{ hl: currentState.codeHighlight.includes(3) }"><k>for</k> <i>i</i> := <n>0</n>; <i>i</i> &lt; <i>workers</i>; <i>i</i>++ {</span><span :class="{ hl: currentState.codeHighlight.includes(4) }">    <k>go</k> <k>func</k>() {</span><span :class="{ hl: currentState.codeHighlight.includes(5) }">        <k>for</k> <i>item</i> := <k>range</k> <i>jobs</i> {</span><span :class="{ hl: currentState.codeHighlight.includes(6) }">            <i>results</i> &lt;- <f>process</f>(<i>item</i>)</span><span :class="{ hl: currentState.codeHighlight.includes(7) }">        }</span><span :class="{ hl: currentState.codeHighlight.includes(8) }">    }()</span><span :class="{ hl: currentState.codeHighlight.includes(9) }">}</span><span :class="{ hl: currentState.codeHighlight.includes(10) }"><k>for</k> _, <i>item</i> := <k>range</k> <i>items</i> {</span><span :class="{ hl: currentState.codeHighlight.includes(11) }">    <i>jobs</i> &lt;- <i>item</i></span><span :class="{ hl: currentState.codeHighlight.includes(12) }">}</span><span :class="{ hl: currentState.codeHighlight.includes(13) }"><f>close</f>(<i>jobs</i>)</span><span :class="{ hl: currentState.codeHighlight.includes(14) }"><k>for</k> <k>range</k> <i>items</i> {</span><span :class="{ hl: currentState.codeHighlight.includes(15) }">    &lt;-<i>results</i></span><span :class="{ hl: currentState.codeHighlight.includes(16) }">}</span></pre>
            </div>
          </div>

          <!-- Warning -->
          <div v-if="currentState.phase === 'done'" class="warning">
            ⚠️ Порядок результатов <strong>Rb, Ra, Rc, Rd, Re</strong> ≠ входному <strong>A, B, C, D, E</strong>
          </div>

          <div class="hint">Клавиши: ← → навигация, Space — play/pause, Esc — закрыть</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.open-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #3a3a5e 0%, #2a2a4e 100%);
  border: 1px solid #4a4a7e;
  border-radius: 8px;
  color: #e0e0e0;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin: 16px 0;
}

.open-btn:hover {
  background: linear-gradient(135deg, #4a4a7e 0%, #3a3a5e 100%);
  border-color: #6a6a9e;
  transform: translateY(-1px);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 12px;
  width: 100%;
  max-width: 1000px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn {
  padding: 6px 12px;
  background: #3a3a5e;
  border: 1px solid #4a4a7e;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn:hover:not(:disabled) { background: #4a4a7e; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.play { background: #2a5a2a; border-color: #3a7a3a; }
.btn.play:hover { background: #3a7a3a; }
.btn.close { background: #5a2a2a; border-color: #7a3a3a; }
.btn.close:hover { background: #7a3a3a; }

.step-indicator {
  background: #4a4a7e;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
}

/* Progress */
.progress-bar {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #2a2a4e;
  cursor: pointer;
  transition: all 0.2s;
}

.dot:hover { background: #4a4a7e; }
.dot.done { background: #4ecdc4; }
.dot.active { background: #fbbf24; transform: scale(1.3); }

/* State info */
.state-info {
  background: #252545;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 20px;
}

.state-title { font-size: 14px; font-weight: 600; color: #fff; }
.state-desc { font-size: 12px; color: #a0a0a0; margin-top: 4px; }

/* Body: 2 columns */
.modal-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 800px) {
  .modal-body { grid-template-columns: 1fr; }
}

/* Visualization */
.viz-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.section { text-align: center; width: 100%; }
.label { font-size: 10px; color: #a0a0c0; margin-bottom: 4px; text-transform: uppercase; font-weight: 600; }

.box {
  background: #252545;
  border: 1px solid #4a4a7e;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 12px;
  display: inline-block;
}

.arrow { color: #8080b0; font-size: 16px; }

.channel {
  background: #0d0d1a;
  border: 2px solid #3a3a5e;
  border-radius: 6px;
  padding: 10px;
  min-height: 36px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.channel.jobs { border-color: #60a5fa; }
.channel.results { border-color: #4ade80; }

.items { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }

.item {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.item.job { background: #60a5fa; color: #0a0a0a; }
.item.result { background: #4ade80; color: #0a0a0a; }

.empty { color: #9090b0; font-size: 11px; font-style: italic; }

/* Workers */
.workers {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.worker {
  background: #252545;
  border: 2px solid #3a3a5e;
  border-radius: 6px;
  padding: 8px 12px;
  min-width: 100px;
  transition: all 0.3s;
}

.worker.processing { background: #2a2a3e; }
.worker.idle { opacity: 0.7; border-style: dashed; }

.w-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 11px; }
.status { font-size: 8px; padding: 2px 4px; border-radius: 2px; text-transform: uppercase; }
.status.processing { background: #166534; color: #4ade80; }
.status.idle { background: #374151; color: #9ca3af; }

.w-job { font-size: 11px; margin-top: 6px; }
.badge { padding: 2px 6px; border-radius: 3px; color: #0a0a0a; font-weight: 600; }
.w-idle { font-size: 10px; color: #9090b0; margin-top: 6px; }

.done-msg { color: #4ade80; margin-top: 6px; font-weight: 600; }

/* Code */
.code-column {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 6px;
  padding: 12px;
}

.code-label { font-size: 11px; color: #a0a0c0; margin-bottom: 8px; }

.code {
  margin: 0;
  font-size: 13px;
  line-height: 1.2;
  color: #b0b0c0;
  white-space: pre;
}

.code > span { display: block; padding: 2px 4px; border-radius: 2px; transition: all 0.2s; }
.code > span.hl { background: #2a3a4a; border-left: 2px solid #4ecdc4; }
.code k { color: #c792ea; font-style: normal; } /* keywords: for, range, func, go, chan */
.code t { color: #82aaff; font-style: normal; } /* types: Item, Result */
.code f { color: #c3e88d; font-style: normal; } /* functions: make, len, process, close */
.code i { color: #89ddff; font-style: normal; } /* identifiers */
.code n { color: #f78c6c; font-style: normal; } /* numbers */

/* Warning */
.warning {
  background: #3a3a1a;
  border: 1px solid #5a5a2a;
  border-radius: 6px;
  padding: 10px 14px;
  margin-top: 16px;
  font-size: 12px;
  color: #fbbf24;
}

.hint {
  text-align: center;
  font-size: 10px;
  color: #9090b0;
  margin-top: 12px;
}

/* Transitions */
.modal-enter-active, .modal-leave-active { transition: all 0.3s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-content, .modal-leave-to .modal-content { transform: scale(0.95); }

.item-enter-active, .item-leave-active { transition: all 0.3s ease; }
.item-enter-from { opacity: 0; transform: scale(0.5); }
.item-leave-to { opacity: 0; transform: translateY(-10px); }
</style>
