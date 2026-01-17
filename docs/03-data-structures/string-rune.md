# String & Rune

::: warning WIP
Эта страница в разработке
:::

## StringHeader

```go
// reflect.StringHeader
type StringHeader struct {
    Data uintptr  // указатель на []byte
    Len  int      // длина в байтах (не в рунах!)
}
```

## Темы для раскрытия

- UTF-8 encoding в Go
- String immutability и interning
- Rune vs byte iteration
- Zero-copy string <-> []byte конвертации
- strings.Builder internals
