# Interfaces

<div class="hero-section">
  <img src="/images/interfaces.avif" alt="Interfaces" class="hero-image" />
</div>

Интерфейсы в Go — это **неявные контракты**, определяющие поведение через набор методов. В отличие от Java/C#, типу не нужно явно объявлять реализацию интерфейса — достаточно иметь нужные методы.

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
```

## Файлы runtime/

| Файл | Назначение |
|------|------------|
| `runtime/iface.go` | Операции с интерфейсами, type assertions |
| `runtime/type.go` | Type descriptors, itab |
| `runtime/runtime2.go` | Определения iface, eface |
