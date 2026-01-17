# Data Structures Deep Dive

Как устроены основные структуры данных Go под капотом.

## В этом разделе

| Тема | Описание |
|------|----------|
| [Slice Internals](./slice-internals) | SliceHeader, backing array, growth strategy |
| [Slice Append](./slice-append) | Shared vs Separate arrays, защита от багов |
| [Map Internals](./map-internals) | Buckets, overflow, evacuation |
| [String & Rune](./string-rune) | UTF-8, StringHeader, конвертации |

## Ключевые структуры

```go
// reflect.SliceHeader — как Go видит slice
type SliceHeader struct {
    Data uintptr  // указатель на backing array
    Len  int      // текущая длина
    Cap  int      // capacity (до реаллокации)
}

// reflect.StringHeader — как Go видит string
type StringHeader struct {
    Data uintptr  // указатель на []byte
    Len  int      // длина в байтах (не в рунах!)
}
```

## Почему это важно?

Понимание внутренностей помогает:
- Избегать неожиданных аллокаций
- Писать zero-copy код
- Отлаживать data races
- Проходить System Design интервью
