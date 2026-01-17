# Slice Append: Shared vs Separate Backing Arrays

Когда `s1` и `s2` указывают на одну память, а когда на разную?

## Два сценария append

### ✅ Capacity достаточно — Shared Array

```go
s1 := make([]int, 2, 4) // len=2, cap=4
s1[0], s1[1] = 10, 20

// Добавляем 1 элемент: 2+1=3 ≤ 4 (cap)
s2 := append(s1, 30)

fmt.Println(&s1[0] == &s2[0]) // true — один массив!
```

### ❌ Capacity превышен — New Array

```go
s1 := make([]int, 2, 4) // len=2, cap=4
s1[0], s1[1] = 10, 20

// Добавляем 3 элемента: 2+3=5 > 4 (cap)
s2 := append(s1, 30, 40, 50)

fmt.Println(&s1[0] == &s2[0]) // false — разные массивы
```

## Реальный баг: неожиданная мутация

Функция получает слайс, добавляет элемент и возвращает новый слайс.
Проблема: если capacity хватило, оба результата указывают на один массив и затирают друг друга.

::: danger append — частичный мутатор
| Что | Мутирует? |
|-----|-----------|
| Slice header (Data, Len, Cap) | ❌ Нет — возвращает новую копию |
| Backing array (если cap хватило) | ⚠️ **Да** — пишет в существующую память |
:::

```go
package main

import "fmt"

func addElement(items []int, elem int) []int {
    return append(items, elem)
}

func main() {
    original := make([]int, 2, 4) // len=2, cap=4
    original[0], original[1] = 1, 2

    resultA := addElement(original, 100)
    resultB := addElement(original, 200)

    // len: original не изменился!
    fmt.Printf("len: original=%d, resultA=%d, resultB=%d\n",
        len(original), len(resultA), len(resultB))

    fmt.Println("original:", original)
    fmt.Println("resultA: ", resultA)  // [1 2 200] — ожидали 100!
    fmt.Println("resultB: ", resultB)

    // Но данные в памяти УЖЕ изменены!
    fmt.Println("original[:cap]:", original[:cap(original)])
}
```

**Вывод:**
```
len: original=2, resultA=3, resultB=3  ← original.len не изменился!

original: [1 2]            ← видит только len=2 элемента
resultA:  [1 2 200]        ← ожидали 100!
resultB:  [1 2 200]

original[:cap]: [1 2 200 0]  ← данные УЖЕ в памяти!
```

### Почему 200 затирает 100?

`original` сохраняет `len=2` после каждого append.
Оба вызова видят len=2 → оба пишут в индекс [2] → второй затирает первого.

::: tip Доказательство: данные УЖЕ в массиве
```go
fmt.Println(original)                 // [1 2] — len=2, видит только 2 элемента
fmt.Println(original[:cap(original)]) // [1 2 200 0] — расширяем до cap, видим всё
```
Значение 200 физически записано в [2], но `original.len=2` скрывает его.
:::

## Best Practices: как защититься

### 1️⃣ Идиоматичный Go: всегда `s = append(s, x)`

90% случаев. Если работаешь с одной переменной — проблемы нет.

```go
s := []int{1, 2}
s = append(s, 3)  // ✅ всегда присваиваем результат той же переменной
```

Баги появляются когда делают `s2 := append(s1, x)` и работают с обоими.

### 2️⃣ slices.Clone() — Go 1.21+ (рекомендуется)

Когда функция принимает слайс и должна вернуть модифицированную копию.

```go
import "slices"

func addElement(items []int, elem int) []int {
    return append(slices.Clone(items), elem)  // ✅ всегда новый массив
}
```

::: info
`slices.Clone()` = `append([]T(nil), items...)` — создаёт копию с cap=len.
:::

### 3️⃣ make + copy — до Go 1.21

```go
func addElement(items []int, elem int) []int {
    result := make([]int, len(items), len(items)+1)
    copy(result, items)
    return append(result, elem)
}
```

### 4️⃣ Three-index slice — редко

Когда не хочешь копировать данные, но нужно гарантировать изоляцию.

```go
func addElement(items []int, elem int) []int {
    return append(items[:len(items):len(items)], elem)
}
```

**Синтаксис:** `slice[low:high:max]`
- `low` — начальный индекс
- `high` — конечный индекс (определяет len)
- `max` — граница capacity (определяет cap = max - low)

### Когда какой подход?

| Ситуация | Решение |
|----------|---------|
| Локальная работа со слайсом | `s = append(s, x)` |
| Функция возвращает "новый" слайс | `slices.Clone()` + append |
| Передача в горутину | `slices.Clone()` |
| Критичная производительность | three-index slice |

## Итог: что именно делает append

| Что | Мутирует? | Пояснение |
|-----|-----------|-----------|
| Переменная-аргумент | ❌ Нет | slice header передаётся по значению |
| Backing array (cap хватило) | ⚠️ Да | Записывает по индексу `[len]` |
| Backing array (cap не хватило) | ❌ Нет | Создаёт новый массив |
| Возвращаемое значение | — | Всегда новый header |
