<script setup lang="ts">
import CodeDebugger from './CodeDebugger.vue'

const lines = [
  { code: 's1 := make([]int, 2, 4)', result: '// len=2, cap=4' },
  { code: 's1[0], s1[1] = 10, 20', result: '// → [10, 20, ∅, ∅]' },
  { code: '' },
  { code: '// Добавляем 1 элемент: 2+1=3 ≤ 4 (cap)', comment: true },
  { code: 's2 := append(s1, 30)', result: '// ✓ cap хватает → тот же массив' },
  { code: '' },
  { code: 'fmt.Println(&s1[0] == &s2[0])', result: '// true — один массив!' },
]

const steps = [
  { line: 1, memory: [{ label: 's1 →', cells: ['∅', '∅', '∅', '∅'] }] },
  { line: 2, memory: [{ label: 's1 →', cells: ['10', '20', '∅', '∅'] }], writtenCells: [0, 1] },
  { line: 5, memory: [{ label: 's1 & s2 →', cells: ['10', '20', '30', '∅'] }], writtenCells: [2] },
  { line: 7, memory: [{ label: 's1 & s2 →', cells: ['10', '20', '30', '∅'] }] },
]
</script>

<template>
  <CodeDebugger
    title="✅ Capacity достаточно — Shared Array"
    type="success"
    :lines="lines"
    :steps="steps"
  />
</template>
