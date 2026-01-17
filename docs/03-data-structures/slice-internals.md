# Slice Internals

::: warning WIP
Эта страница в разработке
:::

## SliceHeader

```go
// reflect.SliceHeader
type SliceHeader struct {
    Data uintptr  // указатель на backing array
    Len  int      // текущая длина
    Cap  int      // capacity
}
```

## Темы для раскрытия

- Backing array и его жизненный цикл
- Growth strategy (до Go 1.18 vs после)
- Memory layout
- Escape analysis для слайсов
