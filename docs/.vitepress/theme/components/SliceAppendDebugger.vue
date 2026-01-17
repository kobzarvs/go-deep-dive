<script setup lang="ts">
import CodeDebugger from './CodeDebugger.vue'

const lines = [
  { code: 'func addElement(items []int, elem int) []int {' },
  { code: '    return append(items, elem)' },
  { code: '}' },
  { code: '' },
  { code: 'func main() {' },
  { code: '    original := make([]int, 2, 4)', result: '// len=2, cap=4' },
  { code: '    original[0], original[1] = 1, 2', result: '// → [1, 2, ∅, ∅]' },
  { code: '' },
  { code: '    resultA := addElement(original, 100)', result: '// len=2+1≤4 → пишем в [2]' },
  { code: '    resultB := addElement(original, 200)', result: '// ⚠️ len=2! Снова в [2]!', warn: true },
  { code: '' },
  { code: '    fmt.Printf("len: original=%d, resultA=%d, resultB=%d\\n",' },
  { code: '        len(original), len(resultA), len(resultB))', result: '// len: original=2, resultA=3, resultB=3' },
  { code: '' },
  { code: '    fmt.Println("original:", original)', result: '// original: [1 2]' },
  { code: '    fmt.Println("resultA: ", resultA)', result: '// resultA:  [1 2 200] ← ожидали 100!', error: true },
  { code: '    fmt.Println("resultB: ", resultB)', result: '// resultB:  [1 2 200]' },
  { code: '' },
  { code: '    // Но данные в памяти УЖЕ изменены!', comment: true },
  { code: '    fmt.Println("original[:cap]:", original[:cap(original)])', result: '// original[:cap]: [1 2 200 0]', error: true },
  { code: '}' },
]

const steps = [
  // Начальное состояние
  { line: 5, memory: [] },
  // make([]int, 2, 4)
  { line: 6, memory: [{ label: 'original →', cells: ['∅', '∅', '∅', '∅'] }] },
  // original[0], original[1] = 1, 2
  { line: 7, memory: [{ label: 'original →', cells: ['1', '2', '∅', '∅'] }], writtenCells: [0, 1] },
  // resultA := addElement(original, 100)
  { line: 9, memory: [{ label: 'original/resultA →', cells: ['1', '2', '100', '∅'] }], writtenCells: [2] },
  // resultB := addElement(original, 200) — ПЕРЕЗАПИСЫВАЕТ!
  { line: 10, memory: [{ label: 'original/resultA/resultB →', cells: ['1', '2', '200', '∅'], type: 'error' }], writtenCells: [2] },
  // fmt.Printf len
  { line: 13, memory: [{ label: 'original/resultA/resultB →', cells: ['1', '2', '200', '∅'], type: 'error' }] },
  // fmt.Println original
  { line: 15, memory: [{ label: 'original/resultA/resultB →', cells: ['1', '2', '200', '∅'], type: 'error' }] },
  // fmt.Println resultA — СЮРПРИЗ!
  { line: 16, memory: [{ label: 'original/resultA/resultB →', cells: ['1', '2', '200', '∅'], type: 'error' }] },
  // fmt.Println resultB
  { line: 17, memory: [{ label: 'original/resultA/resultB →', cells: ['1', '2', '200', '∅'], type: 'error' }] },
  // original[:cap]
  { line: 20, memory: [{ label: 'original/resultA/resultB →', cells: ['1', '2', '200', '∅'], type: 'error' }] },
  // конец
  { line: 21, memory: [{ label: 'original/resultA/resultB →', cells: ['1', '2', '200', '∅'], type: 'error' }] },
]
</script>

<template>
  <CodeDebugger
    title="Slice Mutation Bug — пошаговое выполнение"
    type="error"
    :lines="lines"
    :steps="steps"
  />
</template>
