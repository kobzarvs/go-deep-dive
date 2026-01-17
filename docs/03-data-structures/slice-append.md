# Slice Append: Shared vs Separate Backing Arrays

Когда `s1` и `s2` указывают на одну память, а когда на разную?

::: tip Предварительные знания
Эта страница предполагает понимание [структуры slice](./slice-internals.md): header (ptr, len, cap) vs backing array.
:::

## Ключевая идея

1. **Slice header передаётся по значению** — функция получает копию 24 байт
2. **Backing array не копируется** — несколько headers могут указывать на один массив
3. **append возвращает новый header** — но может писать в существующий backing array

## Два сценария append

<SliceSharedDemo />

<SliceNewDemo />

## Реальный баг: неожиданная мутация

Функция получает слайс, добавляет элемент и возвращает новый слайс.
Проблема: если capacity хватило, оба результата указывают на один массив и затирают друг друга.

::: danger append возвращает новый слайс, но может изменить чужие данные
```
s2 := append(s1, x)
```
- **`s1` не изменится** — его len и cap остаются прежними
- **Но если `cap(s1) > len(s1)`** — элемент `x` запишется в общий backing array
- **Все слайсы, ссылающиеся на этот массив, увидят изменение**
:::

### Почему 200 затирает 100?

`original` сохраняет `len=2` после каждого append.
Оба вызова видят len=2 → оба пишут в индекс [2] → второй затирает первого.

<SliceAppendDebugger />

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

## Статический анализ: почему линтеры не спасут

### Что проверяют популярные линтеры?

| Инструмент | Ловит этот баг? | Почему |
|------------|-----------------|--------|
| `go vet` | ❌ Нет | Проверяет только очевидные ошибки |
| `staticcheck` | ❌ Нет | Нет правила для slice aliasing |
| `golangci-lint` | ❌ Нет | Ни один из 100+ линтеров не детектирует |
| `go test -race` | ⚠️ Частично | Только concurrent записи |

### Почему это сложно детектировать?

Slice aliasing требует **inter-procedural data-flow analysis**:

```go
func processItems(items []int) []int {
    return append(items, 42)  // Опасно? Зависит от вызывающего кода
}

// Безопасно:
result := processItems([]int{1, 2}) // len=cap, append создаст новый массив

// Баг:
base := make([]int, 2, 10)
a := processItems(base)
b := processItems(base) // Затрёт a!
```

Линтер должен отслеживать:
- Откуда пришёл слайс
- Какой у него cap vs len
- Кто ещё держит ссылку на backing array

Это NP-сложная задача для общего случая.

### Race detector помогает частично

```go
// go test -race ПОЙМАЕТ этот баг
go func() {
    resultA := addElement(original, 100)
    _ = resultA
}()
go func() {
    resultB := addElement(original, 200)
    _ = resultB
}()
```

Но **не поймает** последовательный вызов:

```go
// go test -race НЕ ПОЙМАЕТ
resultA := addElement(original, 100)
resultB := addElement(original, 200)  // Тихо затирает resultA
```

### Практический тест на aliasing

Добавьте в свои тесты проверку изоляции:

```go
func TestSliceIsolation(t *testing.T) {
    original := make([]int, 2, 4)
    original[0], original[1] = 1, 2

    a := addElement(original, 100)
    b := addElement(original, 200)

    // Если функция корректна, a и b независимы
    if a[2] != 100 {
        t.Errorf("a[2] = %d, want 100 (slice aliasing bug)", a[2])
    }
    if b[2] != 200 {
        t.Errorf("b[2] = %d, want 200", b[2])
    }
}
```

## Как это решают другие языки

### Rust: borrow checker делает баг невозможным

В Rust нельзя иметь несколько mutable ссылок одновременно:

```rust
fn main() {
    let mut v = vec![1, 2, 3];

    let a = &mut v;
    let b = &mut v;  // ❌ Ошибка компиляции!
    //  ^^^ cannot borrow `v` as mutable more than once

    a.push(4);
    b.push(5);
}
```

Компилятор **гарантирует** на этапе компиляции, что не будет aliasing проблем.

### Java: ArrayList.subList() — похожая проблема

```java
List<Integer> original = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
List<Integer> sub = original.subList(0, 3);

original.add(6);  // Модифицируем original
System.out.println(sub.get(0));  // ConcurrentModificationException!
```

Java хотя бы **бросает исключение** при concurrent modification. Go молча даёт неправильный результат.

### Сравнительная таблица

| Аспект | Go | Rust | Java | C++ |
|--------|----|----- |------|-----|
| Защита от aliasing | ❌ Нет | ✅ Borrow checker | ⚠️ Runtime exception | ❌ Нет |
| Когда узнаём о баге | Runtime (если повезёт) | Compile time | Runtime | Runtime/никогда |
| Накладные расходы | Нулевые | Нулевые | Runtime checks | Нулевые |
| Философия | Доверяем разработчику | Если компилируется — безопасно | Fail-fast | Доверяем разработчику |

### Философия Go

Go намеренно выбирает простоту над безопасностью:

> "Go is a language for software engineers, not academics." — Rob Pike

Это означает:
- **Меньше магии компилятора** — код делает то, что написано
- **Ответственность на разработчике** — знай свои инструменты
- **Производительность важнее** — нет runtime проверок на каждый append

::: warning Вывод
Go даёт мощные примитивы, но требует понимания их семантики.
Используйте `slices.Clone()` когда нужна изоляция — это явное выражение намерения.
:::

## Итог: что именно делает append

| Что | Мутирует? | Пояснение |
|-----|-----------|-----------|
| Переменная-аргумент | ❌ Нет | slice header передаётся по значению |
| Backing array (cap хватило) | ⚠️ Да | Записывает по индексу `[len]` |
| Backing array (cap не хватило) | ❌ Нет | Создаёт новый массив |
| Возвращаемое значение | — | Всегда новый header |

**Ключевое правило:** если функция принимает `[]T` и вызывает `append`, она должна либо:
1. Возвращать результат вызывающему (пусть он решает)
2. Клонировать слайс перед модификацией (`slices.Clone`)
3. Документировать, что мутирует входной слайс
