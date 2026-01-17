<script setup lang="ts">
import CodeDebugger from './CodeDebugger.vue'

const lines = [
  { code: 's1 := make([]int, 2, 4)', result: '// len=2, cap=4' },
  { code: 's1[0], s1[1] = 10, 20', result: '// → [10, 20, ∅, ∅]' },
  { code: '' },
  { code: '// Добавляем 3 элемента: 2+3=5 > 4 (cap)', comment: true },
  { code: 's2 := append(s1, 30, 40, 50)', result: '// ✗ cap мало → новый массив!', error: true },
  { code: '' },
  { code: 'fmt.Println(&s1[0] == &s2[0])', result: '// false — разные массивы' },
]

const steps = [
  { line: 1, memory: [{ label: 's1 →', cells: ['∅', '∅', '∅', '∅'] }] },
  { line: 2, memory: [{ label: 's1 →', cells: ['10', '20', '∅', '∅'] }], writtenCells: [0, 1] },
  {
    line: 5,
    memory: [
      { label: 's1 →', cells: ['10', '20', '∅', '∅'] },
      { label: 's2 → (новый)', cells: ['10', '20', '30', '40', '50', '∅', '∅', '∅'], type: 'new' }
    ]
  },
  {
    line: 7,
    memory: [
      { label: 's1 →', cells: ['10', '20', '∅', '∅'] },
      { label: 's2 → (новый)', cells: ['10', '20', '30', '40', '50', '∅', '∅', '∅'], type: 'new' }
    ]
  },
]
</script>

<template>
  <CodeDebugger
    title="❌ Capacity превышен — New Array"
    type="error"
    :lines="lines"
    :steps="steps"
  />
</template>
