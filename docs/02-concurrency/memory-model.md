# Go Memory Model

Go Memory Model определяет условия, при которых чтение переменной в одной горутине гарантированно увидит значение, записанное другой горутиной. Понимание этой модели критично для написания корректных конкурентных программ.

## Happens-Before

### Определение

**Happens-before** — это частичный порядок на событиях в программе. Если событие A happens-before событие B (записывается A < B), то A гарантированно завершится и будет видимо до начала B.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Happens-Before Relation                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Внутри одной горутины: порядок определён текстом программы                 │
│                                                                             │
│  Goroutine G1:        Goroutine G2:                                         │
│  ────────────         ────────────                                          │
│  a = 1        ─┐                                                            │
│  b = 2         │      ─────────────                                         │
│  c = 3        ─┘      x = a  ← Какое значение?                              │
│                                                                             │
│  Без синхронизации:                                                         │
│  • x может быть 0 (не видит a = 1)                                          │
│  • x может быть 1 (видит a = 1)                                             │
│  • Нет гарантий!                                                            │
│                                                                             │
│  С синхронизацией (happens-before):                                         │
│  G1:              G2:                                                       │
│  a = 1            ────────────                                              │
│  ch <- done  ───▶ <-ch                                                      │
│                   x = a  ← Гарантированно 1                                 │
│                                                                             │
│  ch <- done happens-before <-ch                                             │
│  a = 1 happens-before ch <- done                                            │
│  <-ch happens-before x = a                                                  │
│  Транзитивность: a = 1 happens-before x = a                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

<InteractiveModal title="Happens-Before Visualizer" icon="🔗" description="Интерактивная визуализация happens-before отношений">
  <HappensBeforeViz />
</InteractiveModal>

### Правила happens-before

| Операция A | Операция B | A happens-before B |
|------------|------------|-------------------|
| Инициализация пакета | main.main() | ✅ |
| `go f()` | Начало выполнения f() | ✅ |
| `ch <- v` (send) | Завершение `<-ch` (receive) | ✅ |
| `close(ch)` | Receive возвращает zero value | ✅ |
| `<-ch` (unbuffered) | Send завершён | ✅ |
| n-й receive из ch (cap=C) | (n+C)-й send завершён | ✅ |
| `l.Unlock()` | `l.Lock()` (следующий) | ✅ |
| `once.Do(f)` возврат | Любой `once.Do()` возврат | ✅ |
| atomic store | atomic load того же значения | ✅ |

## Синхронизация

### Goroutine Creation

```go
var a int

go func() {
    // a = 1 guaranteed visible here
}()

a = 1  // happens-before goroutine start
```

::: warning Завершение горутины
Завершение горутины НЕ создаёт happens-before ни с чем. Нужна явная синхронизация:
```go
var a int
go func() { a = 1 }()
// НЕТ гарантии что a = 1 здесь!
// Нужен channel или WaitGroup
```
:::

### Channel Operations

```go
// Правило 1: send happens-before receive completes
ch := make(chan int)
go func() {
    a = 1      // (1)
    ch <- 0    // (2) send
}()
<-ch           // (3) receive completes after (2)
print(a)       // (4) guaranteed to print 1
// (1) < (2), (2) < (3), (3) < (4) → (1) < (4)

// Правило 2: close happens-before receive returns zero
ch := make(chan int)
go func() {
    a = 1
    close(ch)
}()
<-ch           // returns 0, false
print(a)       // guaranteed to print 1

// Правило 3: unbuffered receive happens-before send completes
ch := make(chan int)
go func() {
    <-ch       // (1) receive
    print(a)   // (3) guaranteed to print 1
}()
a = 1          // (2) happens-before send completes
ch <- 0        // (4) send completes after (1)
// (1) < (4), (2) < (4), поэтому (2) < (1) ???
// Нет! (2) < (4) и (1) < (4), но (1) и (2) не связаны напрямую
// Unbuffered: (1) receives < (4) send completes,
//             и (2) a=1 happens before (4)
// Но receive начинается и блокируется ДО send,
// поэтому a=1 гарантированно до print(a)
```

### Locks

```go
var l sync.Mutex
var a int

l.Lock()
a = 1
l.Unlock()  // (1) unlock

l.Lock()    // (2) lock — happens-after (1)
print(a)    // guaranteed to print 1
l.Unlock()
```

### Once

```go
var once sync.Once
var a int

once.Do(func() { a = 1 })  // (1)
once.Do(func() { a = 2 })  // (2) — happens-after (1) returns
print(a)                    // guaranteed to print 1
```

## Data Races

### Определение

**Data race** происходит когда:
1. Две горутины обращаются к одной переменной
2. Хотя бы одно обращение — запись
3. Нет happens-before между обращениями

```go
// DATA RACE!
var counter int

go func() { counter++ }()  // read-modify-write
go func() { counter++ }()  // read-modify-write
// Нет синхронизации между ними
```

### Последствия data race

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Data Race Consequences                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Go memory model: программа с data race имеет UNDEFINED BEHAVIOR            │
│                                                                             │
│  Что может случиться:                                                       │
│  • Torn reads/writes (частичное чтение/запись)                              │
│  • Stale values (устаревшие значения)                                       │
│  • Out-of-thin-air values (значения из ниоткуда)                            │
│  • Reordering (переупорядочивание операций)                                 │
│  • Crashes                                                                  │
│  • Security vulnerabilities                                                 │
│                                                                             │
│  Пример torn write (на некоторых архитектурах):                             │
│  var x uint64 = 0xFFFFFFFFFFFFFFFF                                          │
│  go func() { x = 0 }()        // Пишет 8 байт                               │
│  go func() { print(x) }()     // Может увидеть 0x00000000FFFFFFFF!          │
│                                                                             │
│  ВАЖНО: "Работает на моей машине" не значит корректно!                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Примеры data races

```go
// 1. Инкремент
var x int
go func() { x++ }()  // DATA RACE
go func() { x++ }()

// 2. Map (особенно опасно!)
m := make(map[string]int)
go func() { m["a"] = 1 }()  // DATA RACE
go func() { _ = m["a"] }()   // Может паниковать!

// 3. Slice append
s := make([]int, 0, 10)
go func() { s = append(s, 1) }()  // DATA RACE
go func() { s = append(s, 2) }()

// 4. Interface assignment
var i interface{}
go func() { i = "hello" }()  // DATA RACE
go func() { i = 42 }()       // i = (type, value) — не атомарно!
```

## Data Race: интерактивный пример

<InteractiveModal title="Data Race Demo" icon="💥" description="Демонстрация data race и синхронизации с mutex">
  <RaceConditionDemo />
</InteractiveModal>

Рассмотрим классический data race с инкрементом счётчика:

```go
var counter int

// ❌ DATA RACE: два потока модифицируют counter без синхронизации
go func() { counter++ }()  // Goroutine 1
go func() { counter++ }()  // Goroutine 2
```

### Что может произойти?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Возможные исходы без синхронизации                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  counter++ — это 3 операции: READ, INCREMENT, WRITE                         │
│                                                                             │
│  Исход 1: counter = 2 (ожидаемый)                                           │
│  ──────────────────────────────────                                         │
│  G1: READ(0) → INC → WRITE(1)                                               │
│  G2:                              READ(1) → INC → WRITE(2)                  │
│                                                                             │
│  Исход 2: counter = 1 (LOST UPDATE!)                                        │
│  ────────────────────────────────────                                       │
│  G1: READ(0) ──────────────────────────────────────── INC → WRITE(1)        │
│  G2:           READ(0) → INC → WRITE(1)                                     │
│       Оба прочитали 0, оба записали 1                                       │
│                                                                             │
│  Исход 3: counter = 1 (другой порядок)                                      │
│  ─────────────────────────────────────                                      │
│  G1: READ(0) → INC → WRITE(1)                                               │
│  G2:    READ(0) ───────────────────────── INC → WRITE(1)                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Vector Clocks для детекции

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Vector Clocks Example                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Vector Clock = массив логических часов, по одному на горутину              │
│  VC[i] = "сколько событий видела эта горутина от горутины i"                │
│                                                                             │
│  G1                              G2                                         │
│  ──                              ──                                         │
│  VC1 = [1,0]  ← write(x)                                                    │
│                                  VC2 = [0,1]  ← write(x)                    │
│                                                                             │
│  Сравнение: [1,0] vs [0,1]                                                  │
│  • [1,0] ≮ [0,1] (1 > 0)                                                    │
│  • [0,1] ≮ [1,0] (1 > 0)                                                    │
│  • Ни один не happens-before другого!                                       │
│  → CONCURRENT → DATA RACE!                                                  │
│                                                                             │
│  После синхронизации (channel send/receive):                                │
│  G1: send(ch)  VC1 = [2,0]                                                  │
│  G2: recv(ch)  VC2 = [2,1]  ← включает VC1                                  │
│                                                                             │
│  Теперь [2,0] ≤ [2,1] → G1's write happens-before G2                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Race Detector

### Принцип работы

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Race Detector (ThreadSanitizer)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Компоненты:                                                                │
│  1. Shadow Memory — хранит метаданные о каждом слове памяти                 │
│  2. Vector Clocks — отслеживает happens-before                              │
│  3. Instrumentation — компилятор добавляет проверки                         │
│                                                                             │
│  Shadow Memory Layout:                                                      │
│  ┌──────────────────┐    ┌──────────────────────────────────┐               │
│  │   App Memory     │    │        Shadow Memory             │               │
│  │   (8 bytes)      │    │  (8 shadow words × 8 bytes)      │               │
│  ├──────────────────┤    ├──────────────────────────────────┤               │
│  │   0x1000         │ →  │ [tid, epoch, read/write, size]   │               │
│  │                  │    │ [tid, epoch, read/write, size]   │               │
│  │                  │    │ [tid, epoch, read/write, size]   │               │
│  │                  │    │ [tid, epoch, read/write, size]   │               │
│  └──────────────────┘    └──────────────────────────────────┘               │
│                                                                             │
│  При каждом доступе:                                                        │
│  1. Проверить shadow — был ли конфликтующий доступ?                         │
│  2. Обновить shadow текущим доступом                                        │
│  3. Если конфликт и нет happens-before → DATA RACE!                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Использование

```bash
# Запуск с race detector
go run -race main.go
go test -race ./...
go build -race -o myapp

# Пример вывода при обнаружении race
==================
WARNING: DATA RACE
Write at 0x00c0000a4008 by goroutine 7:
  main.main.func1()
      /app/main.go:12 +0x64

Previous read at 0x00c0000a4008 by goroutine 6:
  main.main.func2()
      /app/main.go:16 +0x44

Goroutine 7 (running) created at:
  main.main()
      /app/main.go:11 +0x84

Goroutine 6 (running) created at:
  main.main()
      /app/main.go:15 +0x78
==================
```

### Overhead

```
┌──────────────────────────────────────────────────┐
│  Race Detector Overhead                          │
├──────────────────────────────────────────────────┤
│  • CPU:    5-10x slower                          │
│  • Memory: 5-10x more                            │
│  • Binary: Larger                                │
│                                                  │
│  Рекомендации:                                   │
│  • Всегда включать в CI/CD                       │
│  • Использовать в dev/test                       │
│  • НЕ использовать в production                  │
└──────────────────────────────────────────────────┘
```

### CI интеграция

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.22'

      - name: Test with race detector
        run: go test -race -v ./...

      - name: Build with race detector
        run: go build -race -o app ./...
```

## "Benign" Races

### Почему их не бывает

```go
// "Это же просто счётчик для статистики, не критично"
var requestCount int  // DATA RACE

func handler(w http.ResponseWriter, r *http.Request) {
    requestCount++  // "Benign" race?
    // ...
}

// ПРОБЛЕМЫ:
// 1. Компилятор может соптимизировать (не обновлять)
// 2. На некоторых архитектурах increment не атомарен
// 3. Race detector будет ругаться → CI failed
// 4. Маскирует другие, серьёзные races
```

### Цитата из Go Memory Model

> Programs that modify data being simultaneously accessed by multiple goroutines must serialize such access. To serialize access, protect the data with channel operations or other synchronization primitives such as those in the sync and sync/atomic packages.
>
> **If you must read the rest of this document to understand the behavior of your program, you are being too clever.**

### Правило

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   Если у вас data race, программа имеет UNDEFINED BEHAVIOR.                 │
│   Нет такого понятия как "безопасный" или "benign" data race.               │
│                                                                             │
│   Единственные варианты:                                                    │
│   1. Использовать синхронизацию (channels, mutex, atomic)                   │
│   2. Убрать shared state                                                    │
│   3. Сделать данные immutable                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Практические рекомендации

### Проверка на races

```go
// 1. Всегда тестировать с -race
func TestConcurrent(t *testing.T) {
    // Тест автоматически проверяет races
}

// 2. Использовать t.Parallel() для обнаружения races
func TestHandler(t *testing.T) {
    t.Parallel()  // Запустить параллельно с другими тестами
    // ...
}

// 3. Stress testing
func TestStress(t *testing.T) {
    const goroutines = 100
    const iterations = 1000

    var wg sync.WaitGroup
    for i := 0; i < goroutines; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for j := 0; j < iterations; j++ {
                // Тестируемый код
            }
        }()
    }
    wg.Wait()
}
```

### Общие паттерны без races

```go
// 1. Channels для передачи ownership
func processItems(items []Item) []Result {
    results := make(chan Result, len(items))
    for _, item := range items {
        item := item  // Capture variable!
        go func() {
            results <- process(item)
        }()
    }
    // Собрать результаты
    out := make([]Result, 0, len(items))
    for range items {
        out = append(out, <-results)
    }
    return out
}

// 2. Mutex для shared state
type Counter struct {
    mu    sync.Mutex
    value int
}

func (c *Counter) Inc() {
    c.mu.Lock()
    c.value++
    c.mu.Unlock()
}

// 3. Atomic для простых значений
var config atomic.Pointer[Config]

// 4. Copy-on-write для read-heavy
var cache atomic.Pointer[map[string]string]

func updateCache(key, value string) {
    for {
        old := cache.Load()
        newMap := make(map[string]string, len(*old)+1)
        for k, v := range *old {
            newMap[k] = v
        }
        newMap[key] = value
        if cache.CompareAndSwap(old, &newMap) {
            break
        }
    }
}
```

## Резюме

1. **Data race = undefined behavior** — нет исключений

2. **Используйте race detector** — `go test -race` в каждом CI

3. **Синхронизация обязательна** для shared mutable state

4. **Happens-before** — единственная гарантия видимости

5. **"Benign races" не существуют** — исправляйте все
