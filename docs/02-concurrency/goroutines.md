# Goroutines

::: warning WIP
Эта страница в разработке
:::

## runtime.g структура

```go
type g struct {
    stack       stack   // стек горутины
    stackguard0 uintptr // для проверки переполнения
    m           *m      // текущий M
    sched       gobuf   // контекст для переключения
    // ...
}
```

## Темы для раскрытия

- Жизненный цикл горутины (Gidle → Grunnable → Grunning → ...)
- Stack growth и shrinking
- Goroutine leak detection
- `runtime.Gosched()` и `runtime.Goexit()`
