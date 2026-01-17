# Context

::: warning WIP
Эта страница в разработке
:::

## context.Context interface

```go
type Context interface {
    Deadline() (deadline time.Time, ok bool)
    Done() <-chan struct{}
    Err() error
    Value(key any) any
}
```

## Темы для раскрытия

- context.Background() vs context.TODO()
- WithCancel, WithTimeout, WithDeadline
- WithValue и его anti-patterns
- Context propagation best practices
- AfterFunc в Go 1.21+
