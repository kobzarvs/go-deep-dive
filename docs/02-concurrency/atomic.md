# Atomic Operations

Пакет `sync/atomic` предоставляет низкоуровневые атомарные операции для реализации алгоритмов синхронизации. Это самый быстрый способ синхронизации, но и самый опасный.

## Typed Wrappers (Go 1.19+)

До Go 1.19 atomic функции принимали указатели на примитивные типы. Новые typed wrappers безопаснее и удобнее:

```go
// Старый API (всё ещё работает, но не рекомендуется)
var counter int64
atomic.AddInt64(&counter, 1)
value := atomic.LoadInt64(&counter)

// Новый API (Go 1.19+)
var counter atomic.Int64
counter.Add(1)
value := counter.Load()
```

### Доступные типы

```go
// sync/atomic (Go 1.19+)
type Bool struct{ ... }
type Int32 struct{ ... }
type Int64 struct{ ... }
type Uint32 struct{ ... }
type Uint64 struct{ ... }
type Uintptr struct{ ... }
type Pointer[T any] struct{ ... }  // Generic pointer

// Общие методы для всех типов:
// Load() T
// Store(val T)
// Swap(new T) (old T)
// CompareAndSwap(old, new T) (swapped bool)

// Дополнительно для числовых:
// Add(delta T) (new T)

// atomic.Value — для любых типов (но медленнее)
type Value struct{ ... }
```

### atomic.Pointer[T]

```go
type Config struct {
    MaxConns int
    Timeout  time.Duration
}

var currentConfig atomic.Pointer[Config]

// Инициализация
currentConfig.Store(&Config{MaxConns: 100, Timeout: time.Second})

// Чтение (lock-free)
cfg := currentConfig.Load()
fmt.Println(cfg.MaxConns)

// Обновление
newCfg := &Config{MaxConns: 200, Timeout: 2 * time.Second}
currentConfig.Store(newCfg)

// Compare-and-swap
oldCfg := currentConfig.Load()
newCfg := &Config{MaxConns: oldCfg.MaxConns + 10}
if currentConfig.CompareAndSwap(oldCfg, newCfg) {
    // Успешно обновили
}
```

### atomic.Value

```go
type Value struct {
    v any
}

// Может хранить любой тип, но:
// 1. Все Store должны использовать одинаковый тип
// 2. Store(nil) паникует
// 3. Первый Store определяет тип навсегда

var config atomic.Value

config.Store(Config{})  // OK
config.Store(Config{})  // OK
config.Store("string")  // PANIC: тип изменился

// Внутри использует interface{} boxing
// Медленнее чем typed wrappers
```

## Memory Ordering

### Acquire-Release семантика

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Memory Ordering in Go                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Go atomic операции обеспечивают SEQUENTIALLY CONSISTENT ordering           │
│  (самый строгий порядок)                                                    │
│                                                                             │
│  Goroutine 1             Goroutine 2                                        │
│  ───────────             ───────────                                        │
│  data = 42               ───────────────                                    │
│  flag.Store(1)     →     if flag.Load() == 1:                               │
│       │                       // data ГАРАНТИРОВАННО = 42                   │
│       │                                                                     │
│       └─────── happens-before ───────┘                                      │
│                                                                             │
│  Store создаёт release barrier                                              │
│  Load создаёт acquire barrier                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Store-Load порядок

```go
// Классический паттерн: flag защищает данные
var (
    data atomic.Int64
    flag atomic.Int64
)

// Writer
data.Store(42)  // 1. Записать данные
flag.Store(1)   // 2. Поднять флаг (release barrier)

// Reader
if flag.Load() == 1 {  // acquire barrier
    // Гарантия: data.Load() вернёт 42
    v := data.Load()
}
```

### Ordering гарантии Go

| Операция | Гарантии |
|----------|----------|
| `Load` | Acquire: все записи ДО соответствующего Store видны |
| `Store` | Release: все записи ДО Store видны после соответствующего Load |
| `Add`, `Swap`, `CompareAndSwap` | Full barrier (acquire + release) |

## CPU реализация

### x86/x64: LOCK prefix

```asm
// atomic.AddInt64 на x86-64
LOCK XADDQ  AX, (BX)   // XADD с LOCK prefix
RET

// atomic.CompareAndSwapInt64
LOCK CMPXCHGQ  CX, (BX)  // CMPXCHG с LOCK prefix
SETEQ  AL
RET

// LOCK prefix:
// 1. Блокирует cache line
// 2. Гарантирует атомарность
// 3. Создаёт full memory barrier
```

### ARM: LL/SC (Load-Link/Store-Conditional)

```asm
// atomic.AddInt64 на ARM64
retry:
    LDAXR   X0, [X1]      // Load-Acquire Exclusive
    ADD     X0, X0, X2    // Добавить
    STLXR   W3, X0, [X1]  // Store-Release Exclusive
    CBNZ    W3, retry     // Retry если exclusive failed
    RET

// ARM использует другой подход:
// 1. LDAXR — захватить exclusive доступ к cache line
// 2. Модифицировать локально
// 3. STLXR — попытаться записать (может fail если кто-то другой тронул)
// 4. Retry если failed
```

### Сравнение архитектур

| Аспект | x86/x64 | ARM |
|--------|---------|-----|
| Механизм | LOCK prefix | LL/SC loop |
| При contention | Блокирует bus | Retry loop |
| Fairness | Не гарантирована | Не гарантирована |
| Performance | Предсказуемая | Может деградировать |

## Lock-free структуры данных

### Lock-free Counter

```go
type Counter struct {
    value atomic.Int64
}

func (c *Counter) Inc() int64 {
    return c.value.Add(1)
}

func (c *Counter) Get() int64 {
    return c.value.Load()
}
```

### Lock-free Stack (Treiber Stack)

```go
type node[T any] struct {
    value T
    next  *node[T]
}

type Stack[T any] struct {
    head atomic.Pointer[node[T]]
}

func (s *Stack[T]) Push(v T) {
    n := &node[T]{value: v}
    for {
        old := s.head.Load()
        n.next = old
        if s.head.CompareAndSwap(old, n) {
            return
        }
        // Retry: кто-то изменил head
    }
}

func (s *Stack[T]) Pop() (T, bool) {
    for {
        old := s.head.Load()
        if old == nil {
            var zero T
            return zero, false
        }
        if s.head.CompareAndSwap(old, old.next) {
            return old.value, true
        }
        // Retry
    }
}
```

::: warning ABA Problem
Lock-free структуры подвержены ABA проблеме:
1. Thread 1 читает A
2. Thread 2 меняет A → B → A
3. Thread 1 делает CAS(A, new) — успех, но состояние изменилось!

Решения: tagged pointers, hazard pointers, epoch-based reclamation.
:::

### Lock-free Queue (Michael-Scott Queue)

```go
type msNode[T any] struct {
    value T
    next  atomic.Pointer[msNode[T]]
}

type Queue[T any] struct {
    head atomic.Pointer[msNode[T]]
    tail atomic.Pointer[msNode[T]]
}

func NewQueue[T any]() *Queue[T] {
    dummy := &msNode[T]{}
    q := &Queue[T]{}
    q.head.Store(dummy)
    q.tail.Store(dummy)
    return q
}

func (q *Queue[T]) Enqueue(v T) {
    n := &msNode[T]{value: v}
    for {
        tail := q.tail.Load()
        next := tail.next.Load()
        if tail == q.tail.Load() {  // Ещё актуально?
            if next == nil {
                // Tail действительно последний
                if tail.next.CompareAndSwap(nil, n) {
                    // Попробовать сдвинуть tail (не критично если fail)
                    q.tail.CompareAndSwap(tail, n)
                    return
                }
            } else {
                // Tail отстал, помочь сдвинуть
                q.tail.CompareAndSwap(tail, next)
            }
        }
    }
}

func (q *Queue[T]) Dequeue() (T, bool) {
    for {
        head := q.head.Load()
        tail := q.tail.Load()
        next := head.next.Load()

        if head == q.head.Load() {
            if head == tail {
                if next == nil {
                    var zero T
                    return zero, false  // Пустая очередь
                }
                // Tail отстал
                q.tail.CompareAndSwap(tail, next)
            } else {
                // Читаем value ДО CAS
                v := next.value
                if q.head.CompareAndSwap(head, next) {
                    return v, true
                }
            }
        }
    }
}
```

## False Sharing

### Проблема

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          False Sharing                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Cache Line (64 bytes на x86)                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  counter1 (8 bytes)  │  counter2 (8 bytes)  │  ... padding ...       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│         ▲                        ▲                                          │
│         │                        │                                          │
│      CPU Core 1               CPU Core 2                                    │
│                                                                             │
│  Проблема: counter1 и counter2 в одной cache line                           │
│  • Core 1 пишет counter1 → инвалидирует cache line на Core 2                │
│  • Core 2 пишет counter2 → инвалидирует cache line на Core 1                │
│  • Постоянный cache ping-pong!                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Решение: Padding

```go
// ❌ Плохо: false sharing
type Counters struct {
    A atomic.Int64  // 8 bytes
    B atomic.Int64  // 8 bytes — в той же cache line!
}

// ✅ Хорошо: padding до cache line
type CountersNoPadding struct {
    A   atomic.Int64
    _   [56]byte  // Padding до 64 bytes
    B   atomic.Int64
    _   [56]byte
}

// Или использовать type с padding
type CacheLinePad struct{ _ [64]byte }

type CountersPadded struct {
    A atomic.Int64
    _ CacheLinePad
    B atomic.Int64
    _ CacheLinePad
}
```

### Benchmark

```go
func BenchmarkFalseSharing(b *testing.B) {
    var c Counters
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            c.A.Add(1)
        }
    })
}

func BenchmarkNoPadding(b *testing.B) {
    var c CountersNoPadding
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            c.A.Add(1)
        }
    })
}

// Results:
// BenchmarkFalseSharing-8    20000000    80 ns/op
// BenchmarkNoPadding-8       100000000   12 ns/op
// ~6.5x быстрее с padding!
```

## Sharded Counters

### Проблема high contention

```go
// Один counter = bottleneck при high concurrency
var globalCounter atomic.Int64  // Все горутины конкурируют

// При 100 горутинах большая часть времени — retry в CAS
```

### Решение: Per-CPU sharding

```go
type ShardedCounter struct {
    shards [256]struct {
        value atomic.Int64
        _     [56]byte  // Padding
    }
}

func (c *ShardedCounter) Add(delta int64) {
    // Использовать goroutine ID или random для выбора shard
    shard := runtime_procPin()  // Привязаться к P
    c.shards[shard%256].value.Add(delta)
    runtime_procUnpin()
}

func (c *ShardedCounter) Load() int64 {
    var total int64
    for i := range c.shards {
        total += c.shards[i].value.Load()
    }
    return total
}
```

### Benchmark

```go
// BenchmarkAtomicCounter-8      20000000     80 ns/op
// BenchmarkShardedCounter-8     200000000     8 ns/op
// 10x быстрее при high concurrency!
```

## Производительность

### Atomic vs Mutex

```go
// Benchmark comparison
// BenchmarkAtomicAdd-8          500000000     2.4 ns/op
// BenchmarkMutexIncrement-8     50000000     25 ns/op
// ~10x быстрее!

// Но:
// 1. Atomic только для простых операций
// 2. Mutex может защищать сложное состояние
// 3. При low contention разница меньше
```

### Операции по скорости

| Операция | Примерное время (ns) |
|----------|---------------------|
| Load | ~1 |
| Store | ~2 |
| Add | ~2-3 |
| CompareAndSwap (success) | ~5 |
| CompareAndSwap (fail + retry) | ~10+ |

## Best Practices

### Когда использовать atomic

```go
// ✅ Простые счётчики
var requestCount atomic.Int64

// ✅ Флаги состояния
var isShutdown atomic.Bool

// ✅ Lazy initialization с atomic.Pointer
var config atomic.Pointer[Config]

// ✅ Lock-free read-mostly структуры
type Cache struct {
    data atomic.Pointer[map[string]string]
}
```

### Когда НЕ использовать atomic

```go
// ❌ Сложные инварианты
type Account struct {
    balance atomic.Int64
    frozen  atomic.Bool
}
// balance и frozen должны быть согласованы — нужен mutex

// ❌ Множественные связанные поля
type Stats struct {
    count atomic.Int64
    sum   atomic.Int64
}
// Нельзя атомарно обновить оба — нужен mutex или atomic.Value для struct

// ❌ Если не понимаете memory model
// Лучше mutex чем subtle bugs
```

### Паттерн: Copy-on-Write

```go
type Config struct {
    Settings map[string]string
}

var currentConfig atomic.Pointer[Config]

// Writer: полная замена (редко)
func UpdateConfig(updates map[string]string) {
    old := currentConfig.Load()
    newSettings := make(map[string]string, len(old.Settings)+len(updates))
    for k, v := range old.Settings {
        newSettings[k] = v
    }
    for k, v := range updates {
        newSettings[k] = v
    }
    currentConfig.Store(&Config{Settings: newSettings})
}

// Reader: просто Load (часто)
func GetSetting(key string) string {
    cfg := currentConfig.Load()
    return cfg.Settings[key]
}
```

### Паттерн: Publish barrier

```go
var (
    data   []byte
    ready  atomic.Bool
)

// Publisher
func publish(d []byte) {
    data = d          // Сначала данные
    ready.Store(true) // Потом флаг (release barrier)
}

// Subscriber
func read() []byte {
    if ready.Load() {  // Acquire barrier
        return data    // Гарантированно видим data
    }
    return nil
}
```
