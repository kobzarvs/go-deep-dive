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

## Темы для изучения

- [Slice Append: Shared vs Separate Arrays](./slice-append.md) — когда append мутирует чужие данные
