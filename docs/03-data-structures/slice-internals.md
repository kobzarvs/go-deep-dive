# Slice Internals

Slice в Go — это **не массив**, а структура из трёх полей (24 байта на 64-bit), которая хранится отдельно от самих данных.

## Структура slice header

```
Stack                          Heap
┌─────────────────┐
│ slice header    │            ┌─────────────────────┐
│ ┌─────────────┐ │            │ backing array       │
│ │ ptr ────────┼─┼───────────▶│ [0] [1] [2] [3] ... │
│ │ len = 3     │ │            └─────────────────────┘
│ │ cap = 8     │ │            @ 0xc000100000
│ └─────────────┘ │
└─────────────────┘
@ 0xc000050020
```

```go
// runtime/slice.go (упрощённо)
type slice struct {
    array unsafe.Pointer // указатель на backing array
    len   int            // текущая длина
    cap   int            // ёмкость (размер backing array)
}
```

## Где живут header и backing array

Slice header и backing array могут находиться **далеко друг от друга** в памяти — это разные аллокации:

| Slice header | Backing array | Когда |
|--------------|---------------|-------|
| Stack | Heap | Локальная переменная `s := make([]int, 10)` |
| Heap | Heap (другой адрес) | Slice внутри структуры на heap |
| Stack | Stack | Редко: маленький массив, escape analysis |

### Как проверить

```go
package main

import (
    "fmt"
    "unsafe"
)

func main() {
    s := make([]int, 2, 4)
    s[0], s[1] = 10, 20

    // Адрес slice header (переменной s)
    headerAddr := uintptr(unsafe.Pointer(&s))

    // Адрес backing array
    arrayAddr := uintptr(unsafe.Pointer(unsafe.SliceData(s)))

    fmt.Printf("Header @ %#x\n", headerAddr)
    fmt.Printf("Array  @ %#x\n", arrayAddr)
    fmt.Printf("Расстояние: %d байт\n", arrayAddr-headerAddr)
}
```

**Вывод:**
```
Header @ 0xc000050020
Array  @ 0xc000100000
Расстояние: 720864 байт
```

Почти 700KB между header и данными — они в разных областях памяти.

## Передача по значению

**Slice header передаётся по значению** — когда функция получает `[]T`, она получает копию этих 24 байт:

```go
func modify(s []int) {
    // s — копия header, но указывает на тот же backing array
    s[0] = 999  // ✅ изменит оригинал
    s = append(s, 1)  // ❌ не изменит оригинальную переменную
}

func main() {
    original := []int{1, 2, 3}
    modify(original)
    fmt.Println(original) // [999 2 3] — len не изменился
}
```

::: tip Ключевое понимание
- **Backing array не копируется** — несколько slice headers могут указывать на один массив
- **Изменение элементов** (`s[i] = x`) — видны всем
- **Изменение header** (`s = append(...)`) — локально для функции
:::

## Growth strategy

Когда `append` не хватает capacity, создаётся новый массив. Формула роста менялась:

### До Go 1.18
```
if cap < 1024:
    newCap = cap * 2
else:
    newCap = cap * 1.25
```

### Go 1.18+
Более плавная формула для уменьшения waste памяти на больших слайсах:

```go
// runtime/slice.go
func growslice(oldPtr unsafe.Pointer, newLen, oldCap, num int, et *_type) slice {
    newcap := oldCap
    doublecap := newcap + newcap
    if newLen > doublecap {
        newcap = newLen
    } else {
        const threshold = 256
        if oldCap < threshold {
            newcap = doublecap
        } else {
            for 0 < newcap && newcap < newLen {
                newcap += (newcap + 3*threshold) / 4
            }
        }
    }
    // ... округление до классов размеров аллокатора
}
```

## Pre-allocation

Если известен итоговый размер — **pre-allocate** capacity:

```go
// ❌ Avoid: до 20+ аллокаций при росте
var result []Item
for _, x := range data {
    result = append(result, process(x))
}

// ✅ Better: одна аллокация
result := make([]Item, 0, len(data))
for _, x := range data {
    result = append(result, process(x))  // 0 аллокаций
}
```

### Сколько аллокаций без pre-allocation?

При росте от 0 до N элементов происходит ~log₂(N) аллокаций:

| Итоговый размер | Аллокации | Capacity checkpoints |
|-----------------|-----------|---------------------|
| 100 | ~7 | 1→2→4→8→16→32→64→128 |
| 1000 | ~10 | ...→256→512→1024 |
| 10000 | ~14 | ...→8192→10752 |

### slices.Grow — добавить capacity

```go
import "slices"

// Гарантировать место для ещё N элементов
s = slices.Grow(s, n)

// Эквивалент:
if cap(s)-len(s) < n {
    s = append(make([]T, 0, len(s)+n), s...)
}
```

### Ключевые константы

| Параметр | Значение | Описание |
|----------|----------|----------|
| Slice header size | 24 bytes | `ptr` + `len` + `cap` (64-bit) |
| Growth threshold | 256 | Порог смены стратегии роста |
| Growth < 256 | ×2 | Удвоение capacity |
| Growth ≥ 256 | ~×1.25 | Плавный рост |

## Escape analysis

Компилятор решает где разместить backing array:

```go
func stack() []int {
    s := make([]int, 3)  // может остаться на stack
    return s[:1]         // ❌ escape! → heap
}

func noEscape() {
    s := make([]int, 3)  // stack
    _ = s[0]             // только локальное использование
}
```

Проверка:
```bash
go build -gcflags="-m" main.go
# ./main.go:4:11: make([]int, 3) escapes to heap
```

## Пакет slices (Go 1.21+)

Стандартный пакет `slices` — первый выбор для операций над slice. Zero dependencies, оптимизирован, generic.

```go
import "slices"

// ═══════════════════════════════════════════════════════════════════════════
// ПОИСК
// ═══════════════════════════════════════════════════════════════════════════

users := []string{"alice", "bob", "charlie"}

slices.Contains(users, "bob")           // true — O(n)
slices.Index(users, "charlie")          // 2, или -1 если не найден

// Бинарный поиск — O(log n), требует отсортированный slice
ids := []int{1, 5, 10, 25, 50, 100}
idx, found := slices.BinarySearch(ids, 25)  // idx=3, found=true

// Поиск с условием
slices.IndexFunc(users, func(u string) bool {
    return strings.HasPrefix(u, "ch")
})  // 2

// ═══════════════════════════════════════════════════════════════════════════
// СОРТИРОВКА
// ═══════════════════════════════════════════════════════════════════════════

numbers := []int{3, 1, 4, 1, 5, 9, 2, 6}
slices.Sort(numbers)        // in-place: [1, 1, 2, 3, 4, 5, 6, 9]
slices.IsSorted(numbers)    // true

// Кастомная сортировка
type User struct { Name string; Age int }
users := []User{{"Bob", 30}, {"Alice", 25}}
slices.SortFunc(users, func(a, b User) int {
    return cmp.Compare(a.Age, b.Age)
})

// ═══════════════════════════════════════════════════════════════════════════
// МОДИФИКАЦИЯ
// ═══════════════════════════════════════════════════════════════════════════

// Clone — безопасная копия без shared backing array
clone := slices.Clone(original)

// Reverse in-place
slices.Reverse(numbers)

// Compact — удаляет ПОСЛЕДОВАТЕЛЬНЫЕ дубликаты
data := []int{1, 1, 2, 2, 2, 3, 1}
data = slices.Compact(data)  // [1, 2, 3, 1] — НЕ все дубликаты!

// Для всех дубликатов: Sort + Compact
slices.Sort(data)
data = slices.Compact(data)  // [1, 2, 3]

// Insert, Delete, Replace
s := []int{1, 2, 5, 6}
s = slices.Insert(s, 2, 3, 4)    // [1, 2, 3, 4, 5, 6]
s = slices.Delete(s, 1, 3)       // [1, 4, 5, 6]
s = slices.Replace(s, 1, 3, 10)  // [1, 10, 6]

// ═══════════════════════════════════════════════════════════════════════════
// ПАМЯТЬ
// ═══════════════════════════════════════════════════════════════════════════

s = slices.Grow(s, 1000)  // гарантировать cap для ещё 1000 элементов
s = slices.Clip(s)        // уменьшить cap до len

// ═══════════════════════════════════════════════════════════════════════════
// СРАВНЕНИЕ
// ═══════════════════════════════════════════════════════════════════════════

slices.Equal(a, b)       // true если равны
slices.Compare(a, b)     // -1, 0, 1 (лексикографически)
```

## samber/lo для slice

[github.com/samber/lo](https://github.com/samber/lo) — когда stdlib недостаточно.

```go
import "github.com/samber/lo"

// Filter, Map, Reduce — чего нет в stdlib
active := lo.Filter(users, func(u User, _ int) bool {
    return u.Active
})

names := lo.Map(users, func(u User, _ int) string {
    return u.Name
})

// FilterMap — filter + map в одном проходе
activeNames := lo.FilterMap(users, func(u User, _ int) (string, bool) {
    if u.Active { return u.Name, true }
    return "", false
})

// GroupBy — группировка по ключу
byCountry := lo.GroupBy(users, func(u User) string {
    return u.Country
})

// Chunk — разбиение на батчи
for _, batch := range lo.Chunk(records, 100) {
    db.InsertMany(batch)
}

// Uniq — уникальные без сортировки (в отличие от slices.Compact)
unique := lo.Uniq([]int{1, 2, 2, 3, 1})  // [1, 2, 3]

// Set operations
lo.Union(a, b)        // объединение
lo.Intersection(a, b) // пересечение
lo.Difference(a, b)   // разность
```

::: tip Когда что использовать
| Задача | stdlib `slices` | `samber/lo` |
|--------|-----------------|-------------|
| Sort, Search, Contains | ✅ | — |
| Clone, Reverse, Compact | ✅ | — |
| Grow, Clip, Insert/Delete | ✅ | — |
| **Filter, Map, Reduce** | ❌ | ✅ |
| **GroupBy, Chunk, Partition** | ❌ | ✅ |
| **Uniq** (без сортировки) | ❌ | ✅ |
| **Set operations** | ❌ | ✅ |
:::

::: warning Производительность lo
`samber/lo` использует функциональный стиль. Для hot paths с миллионами элементов обычный `for` может быть быстрее из-за инлайнинга.
:::

## Дальнейшее чтение

- [Slice Append: Shared vs Separate Arrays](./slice-append.md) — когда append мутирует чужие данные
- [Go Slices: usage and internals](https://go.dev/blog/slices-intro) — официальный блог
- [slices package](https://pkg.go.dev/slices) — документация
- Исходники: `$GOROOT/src/runtime/slice.go`
