# Context Internals

`context.Context` — механизм для передачи deadline, cancellation signals и request-scoped values через call chain. Это не просто интерфейс — это целая система типов с продуманной внутренней архитектурой.

## context.Context Interface

```go
// context/context.go
type Context interface {
    // Deadline возвращает время, когда контекст будет отменён
    // ok=false если deadline не установлен
    Deadline() (deadline time.Time, ok bool)

    // Done возвращает канал, который закрывается при отмене
    // Может вернуть nil если контекст никогда не отменяется
    Done() <-chan struct{}

    // Err возвращает причину отмены
    // nil если ещё не отменён
    // Canceled или DeadlineExceeded после отмены
    Err() error

    // Value возвращает значение по ключу
    // nil если ключ не найден
    Value(key any) any
}
```

## Типы контекстов

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Context Type Hierarchy                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                           Context interface                                 │
│                                  │                                          │
│              ┌───────────────────┼───────────────────┐                      │
│              │                   │                   │                      │
│              ▼                   ▼                   ▼                      │
│        ┌──────────┐       ┌────────────┐      ┌────────────┐                │
│        │ emptyCtx │       │ cancelCtx  │      │  valueCtx  │                │
│        │          │       │            │      │            │                │
│        │Background│       │ +cancel()  │      │ +key,val   │                │
│        │ TODO()   │       │ +children  │      │ +parent    │                │
│        └──────────┘       │ +done chan │      └────────────┘                │
│                           │ +err       │                                    │
│                           │ +cause     │                                    │
│                           └─────┬──────┘                                    │
│                                 │                                           │
│                        ┌────────┴────────┐                                  │
│                        ▼                 ▼                                  │
│                 ┌────────────┐    ┌──────────────┐                          │
│                 │  timerCtx  │    │afterFuncCtx  │                          │
│                 │            │    │  (Go 1.21+)  │                          │
│                 │ +timer     │    │  +f func()   │                          │
│                 │ +deadline  │    └──────────────┘                          │
│                 └────────────┘                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

<InteractiveModal title="Context Tree Visualizer" icon="🌳" description="Интерактивная визуализация дерева контекстов и propagation">
  <ContextTreeViz />
</InteractiveModal>

## emptyCtx: Background и TODO

```go
// context/context.go
type emptyCtx struct{}

func (emptyCtx) Deadline() (deadline time.Time, ok bool) {
    return  // zero time, false
}

func (emptyCtx) Done() <-chan struct{} {
    return nil  // Никогда не закрывается
}

func (emptyCtx) Err() error {
    return nil  // Никогда не отменяется
}

func (emptyCtx) Value(key any) any {
    return nil  // Нет значений
}

// Два singleton'а
var (
    background = new(emptyCtx)
    todo       = new(emptyCtx)
)

func Background() Context { return background }
func TODO() Context       { return todo }
```

### Background vs TODO

| Функция | Когда использовать |
|---------|-------------------|
| `Background()` | Корневой контекст: main, init, tests |
| `TODO()` | Placeholder: "здесь должен быть контекст, но пока не решили какой" |

```go
// Background — явное намерение: это корень
func main() {
    ctx := context.Background()
    server.Start(ctx)
}

// TODO — напоминание: вернуться и добавить правильный контекст
func oldLegacyFunction() {
    ctx := context.TODO()  // TODO: пробросить context из caller'а
    doSomething(ctx)
}
```

## cancelCtx: Отмена и Propagation

```go
// context/context.go
type cancelCtx struct {
    Context  // Embedded parent

    mu       sync.Mutex
    done     atomic.Value  // chan struct{}, created lazily
    children map[canceler]struct{}
    err      error
    cause    error  // Go 1.20+
}

type canceler interface {
    cancel(removeFromParent bool, err, cause error)
    Done() <-chan struct{}
}
```

### Создание cancelCtx

```go
func WithCancel(parent Context) (ctx Context, cancel CancelFunc) {
    c := withCancel(parent)
    return c, func() { c.cancel(true, Canceled, nil) }
}

func withCancel(parent Context) *cancelCtx {
    if parent == nil {
        panic("cannot create context from nil parent")
    }
    c := &cancelCtx{}
    c.propagateCancel(parent, c)  // Связать с родителем
    return c
}
```

### propagateCancel: Связывание с родителем

```go
func (c *cancelCtx) propagateCancel(parent Context, child canceler) {
    c.Context = parent

    done := parent.Done()
    if done == nil {
        // Parent никогда не отменяется (emptyCtx)
        return
    }

    select {
    case <-done:
        // Parent уже отменён — отменить child сразу
        child.cancel(false, parent.Err(), Cause(parent))
        return
    default:
    }

    // Найти ближайший cancelCtx в цепочке родителей
    if p, ok := parentCancelCtx(parent); ok {
        p.mu.Lock()
        if p.err != nil {
            // Parent отменён между проверками
            child.cancel(false, p.err, p.cause)
        } else {
            // Добавить child в children родителя
            if p.children == nil {
                p.children = make(map[canceler]struct{})
            }
            p.children[child] = struct{}{}
        }
        p.mu.Unlock()
        return
    }

    // Parent не cancelCtx — слушать Done() в горутине
    go func() {
        select {
        case <-parent.Done():
            child.cancel(false, parent.Err(), Cause(parent))
        case <-child.Done():
        }
    }()
}
```

### cancel: Отмена контекста

```go
func (c *cancelCtx) cancel(removeFromParent bool, err, cause error) {
    if err == nil {
        panic("context: internal error: missing cancel error")
    }

    c.mu.Lock()
    if c.err != nil {
        c.mu.Unlock()
        return  // Уже отменён
    }

    c.err = err
    c.cause = cause

    // Закрыть done channel
    d, _ := c.done.Load().(chan struct{})
    if d == nil {
        c.done.Store(closedchan)  // Предаллоцированный закрытый канал
    } else {
        close(d)
    }

    // Отменить всех детей
    for child := range c.children {
        child.cancel(false, err, cause)
    }
    c.children = nil
    c.mu.Unlock()

    // Убрать себя из родителя
    if removeFromParent {
        removeChild(c.Context, c)
    }
}
```

### Lazy Done Channel

```go
func (c *cancelCtx) Done() <-chan struct{} {
    d := c.done.Load()
    if d != nil {
        return d.(chan struct{})
    }

    c.mu.Lock()
    defer c.mu.Unlock()

    d = c.done.Load()
    if d == nil {
        d = make(chan struct{})
        c.done.Store(d)
    }
    return d.(chan struct{})
}
```

::: info Оптимизация Lazy Done
Done channel создаётся только при первом вызове `Done()`. Если контекст отменяется до вызова `Done()`, используется pre-allocated `closedchan` — это экономит аллокацию.
:::

## timerCtx: Deadline и Timeout

```go
// context/context.go
type timerCtx struct {
    *cancelCtx
    timer    *time.Timer
    deadline time.Time
}

func WithDeadline(parent Context, d time.Time) (Context, CancelFunc) {
    // Если родитель имеет более ранний deadline — использовать его
    if cur, ok := parent.Deadline(); ok && cur.Before(d) {
        return WithCancel(parent)
    }

    c := &timerCtx{
        cancelCtx: withCancel(parent),
        deadline:  d,
    }

    propagateCancel(parent, c)

    dur := time.Until(d)
    if dur <= 0 {
        c.cancel(true, DeadlineExceeded, nil)
        return c, func() { c.cancel(false, Canceled, nil) }
    }

    c.mu.Lock()
    defer c.mu.Unlock()
    if c.err == nil {
        c.timer = time.AfterFunc(dur, func() {
            c.cancel(true, DeadlineExceeded, nil)
        })
    }

    return c, func() { c.cancel(true, Canceled, nil) }
}

func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc) {
    return WithDeadline(parent, time.Now().Add(timeout))
}
```

### Deadline propagation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Deadline Propagation                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ctx1 := WithTimeout(Background(), 10s)  // deadline = now + 10s            │
│      │                                                                      │
│      ▼                                                                      │
│  ctx2 := WithTimeout(ctx1, 5s)           // deadline = now + 5s (effective) │
│      │                                                                      │
│      ▼                                                                      │
│  ctx3 := WithTimeout(ctx2, 20s)          // deadline = now + 5s (от ctx2!)  │
│                                                                             │
│  Результат: ctx3.Deadline() = ctx2.Deadline()                               │
│  (WithDeadline использует более ранний deadline родителя)                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## valueCtx: Хранение значений

```go
// context/context.go
type valueCtx struct {
    Context  // Parent
    key, val any
}

func WithValue(parent Context, key, val any) Context {
    if parent == nil {
        panic("cannot create context from nil parent")
    }
    if key == nil {
        panic("nil key")
    }
    if !reflectlite.TypeOf(key).Comparable() {
        panic("key is not comparable")
    }
    return &valueCtx{parent, key, val}
}

func (c *valueCtx) Value(key any) any {
    if c.key == key {
        return c.val
    }
    return value(c.Context, key)  // Рекурсивный поиск вверх
}
```

### Value Lookup: O(n) по глубине

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Value Lookup Chain                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ctx := WithValue(WithValue(WithValue(Background(), k1, v1), k2, v2), k3, v3)│
│                                                                              │
│  ctx.Value(k1):                                                              │
│                                                                              │
│  valueCtx{k3, v3}  ← k3 != k1                                                │
│       │                                                                      │
│       ▼                                                                      │
│  valueCtx{k2, v2}  ← k2 != k1                                                │
│       │                                                                      │
│       ▼                                                                      │
│  valueCtx{k1, v1}  ← k1 == k1 ✓  return v1                                   │
│       │                                                                      │
│       ▼                                                                      │
│  emptyCtx (не дойдём)                                                        │
│                                                                              │
│  Complexity: O(depth of value chain)                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Design Patterns

```go
// ❌ Плохо: string или примитивный тип как ключ
ctx = context.WithValue(ctx, "userID", 123)  // Коллизии!

// ✅ Хорошо: unexported type
type ctxKey struct{}
var userIDKey = ctxKey{}
ctx = context.WithValue(ctx, userIDKey, 123)

// ✅ Ещё лучше: typed accessor functions
type userIDKeyType struct{}
var userIDKey = userIDKeyType{}

func WithUserID(ctx context.Context, id int) context.Context {
    return context.WithValue(ctx, userIDKey, id)
}

func UserID(ctx context.Context) (int, bool) {
    id, ok := ctx.Value(userIDKey).(int)
    return id, ok
}
```

## Go 1.20+: Cause

```go
// context/context.go (Go 1.20+)

// WithCancelCause возвращает cancel функцию, принимающую cause
func WithCancelCause(parent Context) (ctx Context, cancel CancelCauseFunc) {
    c := withCancel(parent)
    return c, func(cause error) {
        c.cancel(true, Canceled, cause)
    }
}

// Cause возвращает причину отмены
func Cause(c Context) error {
    if cc, ok := c.Value(&cancelCtxKey).(*cancelCtx); ok {
        cc.mu.Lock()
        defer cc.mu.Unlock()
        return cc.cause
    }
    return nil
}
```

### Использование Cause

```go
ctx, cancel := context.WithCancelCause(context.Background())

// В worker
go func() {
    err := doWork(ctx)
    if err != nil {
        cancel(err)  // Передаём причину
    }
}()

// В caller
<-ctx.Done()
fmt.Println("Cancelled because:", context.Cause(ctx))
// Output: Cancelled because: connection timeout
```

## Go 1.21+: WithoutCancel и AfterFunc

### WithoutCancel

```go
// Создаёт контекст, который НЕ отменяется вместе с parent
func WithoutCancel(parent Context) Context {
    if parent == nil {
        panic("cannot create context from nil parent")
    }
    return withoutCancelCtx{parent}
}

type withoutCancelCtx struct {
    Context
}

func (c withoutCancelCtx) Done() <-chan struct{} {
    return nil  // Никогда не отменяется
}

func (c withoutCancelCtx) Err() error {
    return nil
}

// Deadline и Value наследуются от parent
```

```go
// Use case: фоновая операция после отмены request'а
func handleRequest(ctx context.Context) {
    // Request context может быть отменён
    result := process(ctx)

    // Но логирование должно завершиться
    logCtx := context.WithoutCancel(ctx)
    go logResult(logCtx, result)  // Не отменится
}
```

### AfterFunc

```go
// AfterFunc регистрирует callback, вызываемый после отмены
func AfterFunc(ctx Context, f func()) (stop func() bool) {
    a := &afterFuncCtx{
        cancelCtx: withCancel(context.Background()),
        f:         f,
    }
    a.propagateCancel(ctx, a)
    return func() bool {
        stopped := false
        a.once.Do(func() {
            stopped = true
        })
        if stopped {
            a.cancel(true, Canceled, nil)
        }
        return stopped
    }
}
```

```go
// Use case: cleanup при отмене
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

conn := openConnection()
stop := context.AfterFunc(ctx, func() {
    conn.Close()  // Вызовется при отмене или timeout
})

// Если завершились нормально — отменить cleanup
if done := doWork(ctx, conn); done {
    stop()  // Не вызывать AfterFunc
    conn.Close()  // Закрыть вручную
}
```

## Context Tree Visualization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Context Tree Example                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                        Background()                                         │
│                             │                                               │
│                    WithTimeout(10s)                                         │
│                     [timerCtx]                                              │
│                             │                                               │
│               ┌─────────────┼─────────────┐                                 │
│               │             │             │                                 │
│        WithValue         WithCancel    WithValue                            │
│        (reqID)           [cancelCtx]   (traceID)                            │
│               │             │             │                                 │
│               │      ┌──────┴──────┐      │                                 │
│               │      │             │      │                                 │
│               │  WithTimeout   WithTimeout│                                 │
│               │    (5s)          (3s)     │                                 │
│               │      │             │      │                                 │
│               ▼      ▼             ▼      ▼                                 │
│           [worker1] [worker2]  [worker3] [worker4]                          │
│                                                                             │
│  Отмена parent'а (10s timeout) → все дети отменяются                        │
│  Отмена worker2 (5s) → только worker2 отменяется                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Anti-patterns

### Context в структуре

```go
// ❌ Плохо: context хранится в struct
type Server struct {
    ctx context.Context  // НЕ ДЕЛАТЬ ТАК
}

// ✅ Хорошо: context передаётся в метод
type Server struct{}

func (s *Server) Handle(ctx context.Context, req Request) Response {
    // ctx из параметра
}
```

### nil Context

```go
// ❌ Плохо: nil context
func doSomething(ctx context.Context) {
    if ctx == nil {
        ctx = context.Background()  // Костыль
    }
}

// ✅ Хорошо: всегда передавать реальный context
func doSomething(ctx context.Context) {
    // Использовать ctx как есть
    // Caller отвечает за валидный context
}
```

### Value как замена параметрам

```go
// ❌ Плохо: важные параметры в Value
ctx = context.WithValue(ctx, "userID", userID)
ctx = context.WithValue(ctx, "permissions", perms)
processRequest(ctx)  // Неявные зависимости!

// ✅ Хорошо: явные параметры
func processRequest(ctx context.Context, userID int, perms Permissions) {
    // Явно видно, что нужно функции
}
```

### Неправильный порядок cancel

```go
// ❌ Плохо: defer cancel() после использования ctx
func handler(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)

    result := query(ctx)  // Может использовать ctx
    cancel()              // Отменяем после использования
    defer cancel()        // Это уже бессмысленно

    json.NewEncoder(w).Encode(result)
}

// ✅ Хорошо: defer cancel() сразу
func handler(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()  // Всегда первым после создания!

    result := query(ctx)
    json.NewEncoder(w).Encode(result)
}
```

## Performance Considerations

### Overhead типов контекста

| Тип | Размер (64-bit) | Аллокации |
|-----|-----------------|-----------|
| emptyCtx | 0 (singleton) | 0 |
| cancelCtx | ~64 bytes | 1 (+ done chan если нужен) |
| timerCtx | ~80 bytes | 1 + timer |
| valueCtx | ~32 bytes | 1 per value |

### Value Chain Performance

```go
// Глубокий Value chain = медленный lookup
// O(n) где n = количество WithValue в цепочке

// ❌ Много WithValue
ctx = WithValue(ctx, k1, v1)
ctx = WithValue(ctx, k2, v2)
ctx = WithValue(ctx, k3, v3)
// ... 20 уровней
ctx.Value(k1)  // 20 проверок!

// ✅ Группировать значения
type RequestData struct {
    UserID   int
    TraceID  string
    // ...
}
ctx = WithValue(ctx, requestDataKey, &RequestData{...})
// 1 lookup для всех данных
```

### Избегать создания контекстов в hot path

```go
// ❌ Плохо: новый контекст на каждую итерацию
for item := range items {
    ctx, cancel := context.WithTimeout(parentCtx, time.Second)
    process(ctx, item)
    cancel()
}

// ✅ Лучше: переиспользовать родительский где возможно
for item := range items {
    if err := process(parentCtx, item); err != nil {
        // Handle error
    }
}
```

## Best Practices Summary

1. **Всегда передавать context первым параметром**: `func DoSomething(ctx context.Context, ...)`

2. **Использовать Background() только в main/init/tests**: везде остальное — пробрасывать

3. **defer cancel() сразу после создания**: не забывать освобождать ресурсы

4. **Не хранить context в структурах**: передавать как параметр

5. **Использовать unexported ключи для Value**: избегать коллизий

6. **Проверять ctx.Err() или select на ctx.Done()**: в долгих операциях

7. **Не использовать nil context**: явно передавать Background() или TODO()

8. **Минимизировать глубину Value chain**: группировать данные
