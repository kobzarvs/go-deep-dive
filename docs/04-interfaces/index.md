# Interfaces

<div class="hero-section">
  <img src="/images/interfaces.avif" alt="Interfaces" class="hero-image" />
</div>

Интерфейсы в Go — это **неявные контракты**, определяющие поведение через набор методов. В отличие от Java/C#, типу не нужно явно объявлять реализацию интерфейса — достаточно иметь нужные методы.

## TL;DR

| Структура | Размер | Назначение |
|-----------|--------|------------|
| **iface** | 16 байт (на 64-bit) | Интерфейс с методами (tab + data) |
| **eface** | 16 байт (на 64-bit) | Пустой интерфейс `any` (_type + data) |
| **itab** | 32+ байта | Таблица методов, кешируется глобально |

| Операция | Стоимость |
|----------|-----------|
| Method dispatch | Indirect call через itab.fun[], обычно единицы ns (зависит от CPU/Go) |
| Type assertion | O(1) в среднем при попадании в кеш, O(n) в худшем случае |
| Boxing value | Возможна heap allocation |
| `interface == nil` | Только если **оба** поля nil |

Ключевая идея: интерфейсное значение — это **два слова** (тип + данные). `nil` интерфейс = оба nil, typed nil = тип есть, данные nil.

Мини-схема:

```
var r io.Reader = (*os.File)(nil)

iface
┌────────────────────────────────────┐
│ tab  -> itab (io.Reader, *os.File) │
│ data = nil                         │
└────────────────────────────────────┘
```

## По спецификации (go1.25)

- Интерфейс задаёт type set: значение интерфейсного типа может хранить любой тип из него.
- У интерфейсного значения есть static type и dynamic type; у `nil` interface dynamic type отсутствует.
- Method set: у `T` только value receiver методы, у `*T` — value + pointer receiver.
- Type assertion работает только с значениями интерфейсного типа (не с type parameters).
- `any` — alias `interface{}`.

Пример method set:

```go
type Buffer struct{ data []byte }
func (b *Buffer) Write(p []byte) (int, error) { return len(p), nil }

var w io.Writer
// w = Buffer{}   // не компилируется: Write с pointer receiver
w = &Buffer{}     // ok
```

## Статьи раздела

- [**Interface Internals**](/04-interfaces/interface-internals) — iface, eface, itab, memory layout, method dispatch
- [**Type Assertions**](/04-interfaces/type-assertions) — assertion механизм, type switch, comma-ok idiom
- [**nil Interface Trap**](/04-interfaces/nil-interface-trap) — typed nil vs true nil, как избежать ловушки
- [**Best Practices**](/04-interfaces/best-practices) — ISP, accept interfaces return structs, patterns
- [**Generics vs Interfaces**](/04-interfaces/generics-vs-interfaces) — когда что использовать, GCShape stenciling

## Что внутри

В этом разделе разбираем внутреннее устройство интерфейсов и продвинутые паттерны:

### Interface Internals
- **iface vs eface** — структуры для интерфейсов с методами и пустых интерфейсов
- **itab** — таблица методов и её кеширование
- **Type descriptors** — как runtime хранит информацию о типах

### Type Assertions & Switches
- **Механизм type assertion** — как работает `v.(T)` и `v.(type)`
- **Оптимизации компилятора** — когда assertion бесплатен
- **Comma-ok idiom** — безопасные проверки типов

### Interface Composition
- **Embedding** — композиция интерфейсов
- **Implicit satisfaction** — duck typing в действии
- **Interface segregation** — принцип разделения интерфейсов

### Производительность
- **Стоимость вызова** — virtual dispatch vs direct call
- **Escape analysis** — когда интерфейс вызывает аллокацию
- **Devirtualization** — оптимизации компилятора

## Ключевые структуры

```go
// runtime/runtime2.go
type iface struct {
    tab  *itab          // таблица методов + информация о типах
    data unsafe.Pointer // указатель на конкретное значение
}

type eface struct {
    _type *_type        // тип значения
    data  unsafe.Pointer // указатель на значение
}

// Таблица методов
type itab struct {
    inter *interfacetype // тип интерфейса
    _type *_type         // конкретный тип
    hash  uint32         // для быстрого сравнения типов
    _     [4]byte
    fun   [1]uintptr     // массив указателей на методы (variable size)
}
```

## Быстрый старт

```go
// Интерфейс — набор сигнатур методов
type Writer interface {
    Write(p []byte) (n int, err error)
}

// Любой тип с методом Write реализует Writer
type Buffer struct {
    data []byte
}

func (b *Buffer) Write(p []byte) (int, error) {
    b.data = append(b.data, p...)
    return len(p), nil
}

// Использование
var w Writer = &Buffer{}  // неявная реализация
w.Write([]byte("hello"))

// Buffer{} не удовлетворяет Writer,
// потому что Write определён на *Buffer.
// var w2 Writer = Buffer{} // compile error
```

## Файлы runtime/

| Файл | Назначение |
|------|------------|
| `runtime/iface.go` | Операции с интерфейсами, type assertions, itab кеш |
| `runtime/runtime2.go` | Определения iface, eface |
| `internal/abi/iface.go` | ITab структура (экспортируемая) |
| `internal/abi/type.go` | _type и связанные структуры |
| `cmd/compile/internal/ir/func.go` | Генерация method dispatch кода |

## Sources

- [Go spec: Interface types](https://go.dev/ref/spec#Interface_types)
- [Go spec: Method sets](https://go.dev/ref/spec#Method_sets)
- [Go spec: Type assertions](https://go.dev/ref/spec#Type_assertions)
- [Go spec: Type parameter declarations](https://go.dev/ref/spec#Type_parameter_declarations)
