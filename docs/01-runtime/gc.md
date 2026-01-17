# Garbage Collector

Go использует concurrent, tri-color, mark-sweep garbage collector с sub-millisecond STW (Stop-The-World) паузами — короткими моментами, когда все горутины приостанавливаются для безопасной работы GC. В этой статье — внутренности из `runtime/mgc.go`, реальные формулы pacing (механизм определения когда запускать GC и сколько CPU выделять), и практические оптимизации.

## TL;DR

| Характеристика | Значение |
|----------------|----------|
| Алгоритм | Tri-color concurrent mark-sweep |
| STW паузы | ~10-100μs (Go 1.25) |
| GOGC default | 100 (heap doubles между GC) |
| GOMEMLIMIT | Soft memory limit (Go 1.19+) |
| Mark workers | Dedicated (25%), Fractional, Idle |
| Write barrier | Hybrid (Yuasa + Dijkstra) |

---

## Архитектура Memory Allocator

GC работает поверх memory allocator. Понимание allocator критично для понимания GC.

```
mheap (global heap)
├── arenas[]           64MB chunks (виртуальная память)
│   └── spans[]        mspan — группа страниц одного size class
│
├── mcentral[0..66]    Центральные кеши по size class
│   ├── partial        mspan с свободными объектами
│   └── full           mspan без свободных объектов
│
└── Per-P: mcache      Локальный кеш для P (lock-free!)
    ├── tiny           Tiny allocator (<16B, no pointers)
    └── alloc[0..66]   mspan* для каждого size class
```

### 67 Size Classes

Go использует 67 size classes от 8 байт до 32KB:

```go
// runtime/sizeclasses.go
// class  bytes/obj  bytes/span  objects  tail waste  max waste
//     1          8        8192     1024           0     87.50%
//     2         16        8192      512           0     43.75%
//     3         24        8192      341           8     29.24%
//     ...
//    66      28672       57344        2           0      4.91%
//    67      32768       32768        1           0     12.50%
```

Объекты > 32KB аллоцируются напрямую из mheap (large objects).

### Tiny Allocator

Для объектов < 16 байт **без указателей** (noscan) Go использует tiny allocator:

```go
// runtime/malloc.go
func mallocgc(size uintptr, typ *_type, needzero bool) unsafe.Pointer {
    // Tiny allocator для объектов < 16B без указателей
    if size <= maxTinySize && noscan && !needzero {
        off := c.tinyoffset
        if off+size <= maxTinySize {
            // Упаковываем в существующий tiny block
            x = unsafe.Pointer(c.tiny + off)
            c.tinyoffset = off + size
            return x
        }
    }
    // ...
}
```

Несколько мелких объектов упаковываются в один 16-байтный блок → меньше allocations.

---

## Tri-color Marking

GC использует tri-color abstraction для concurrent marking.

<TricolorMarkingDemo />

### Цвета объектов

| Цвет | Значение | В runtime |
|------|----------|-----------|
| **White** | Не посещён (кандидат на удаление) | Bit не установлен в mark bitmap |
| **Gray** | Посещён, потомки не проверены | В worklist (gcWork) |
| **Black** | Посещён, потомки проверены (живой) | Bit установлен, не в worklist |

### Tri-color Invariant

**Чёрный объект никогда не указывает напрямую на белый объект.**

Это invariant позволяет concurrent marking работать корректно. Write barrier гарантирует его соблюдение.

### gcWork — рабочие буферы

```go
// runtime/mgcwork.go
type gcWork struct {
    wbuf1, wbuf2 *workbuf  // Два буфера для work stealing
    bytesMarked  uint64
    heapScanWork int64
}

// workbuf содержит указатели на серые объекты
type workbuf struct {
    workbufhdr
    obj [(_WorkbufSize - unsafe.Sizeof(workbufhdr{})) / goarch.PtrSize]uintptr
}
```

Каждый P имеет свой gcWork. Work stealing между P для балансировки.

---

## Фазы GC цикла

<GCPhaseSimulator />

### State Machine

```go
// runtime/mgc.go
const (
    _GCoff             = iota // GC not running
    _GCmark                   // GC marking roots and workbufs
    _GCmarktermination        // GC mark termination
)
```

### Фаза 1: Mark Setup (STW)

```go
// runtime/mgc.go
func gcStart(trigger gcTrigger) {
    // STW пауза ~10-50μs
    systemstack(stopTheWorldWithSema)

    // Включаем write barrier
    setGCPhase(_GCmark)

    // Сканируем roots: globals, stacks, finalizers
    gcMarkRootPrepare()

    // Запускаем mark workers
    gcBgMarkStartWorkers()

    // Возобновляем мир
    systemstack(startTheWorldWithSema)
}
```

### Фаза 2: Concurrent Marking

```go
// runtime/mgc.go
func gcBgMarkWorker() {
    for {
        // Получаем работу из gcWork
        gcDrain(&p.gcw, gcDrainUntilPreempt|gcDrainFlushBgCredit)

        // Work stealing если своя очередь пуста
        if p.gcw.empty() {
            // Пробуем украсть у других P
        }
    }
}
```

### Фаза 3: Mark Termination (STW)

```go
// runtime/mgc.go
func gcMarkTermination() {
    // STW пауза ~10-50μs
    systemstack(stopTheWorldWithSema)

    // Финальная проверка — все объекты помечены?
    setGCPhase(_GCmarktermination)

    // Подготовка к sweep
    gcSweep(work.mode)

    // Возобновляем мир
    setGCPhase(_GCoff)
    systemstack(startTheWorldWithSema)
}
```

### Фаза 4: Concurrent Sweep

Sweep происходит **лениво** — при следующей аллокации:

```go
// runtime/mgcsweep.go
func (c *mcache) refill(spc spanClass) {
    s := mheap_.central[spc].mcentral.cacheSpan()
    // cacheSpan() sweep'ит span если нужно
}
```

---

## Write Barrier Deep Dive

Write barrier — механизм уведомления GC об изменениях указателей во время concurrent marking.

### Проблема без barrier

```
Mutator: A.ptr = B     // A — чёрный, B — белый
GC:      scan(A)       // A уже сканирован!
Result:  B не помечен → ошибочно собран!
```

### Hybrid Write Barrier

Go 1.8+ использует hybrid barrier (Yuasa + Dijkstra):

```go
// runtime/mbarrier.go
//go:nosplit
func writebarrierptr(dst *uintptr, src uintptr) {
    // Yuasa deletion barrier: shade(old)
    // Dijkstra insertion barrier: shade(new)
    if writeBarrier.enabled {
        shade(src)           // shade new value
        shade(*dst)          // shade old value (Yuasa)
    }
    *dst = src
}
```

### Почему hybrid?

**Yuasa (deletion barrier):** Затеняет старое значение при удалении указателя.
```
*slot = newPtr
shade(oldPtr)  // Yuasa: не потеряем oldPtr
```

**Dijkstra (insertion barrier):** Затеняет новое значение при вставке.
```
*slot = newPtr
shade(newPtr)  // Dijkstra: увидим newPtr
```

**Hybrid = оба:** Позволяет **не сканировать стеки повторно** (стеки сканируются один раз в начале).

```
Before assignment:
  slot → oldValue (white)

Write barrier executes:
  shade(oldValue)   // Yuasa part
  shade(newValue)   // Dijkstra part

After assignment:
  slot → newValue
```

### Stack scanning exception

Стеки горутин **не используют write barrier** — это было бы слишком дорого. Вместо этого:

1. Стеки сканируются **в начале** marking phase
2. Hybrid barrier на heap гарантирует корректность
3. Стеки не нужно пересканировать благодаря Yuasa part

---

## GC Pacing — Ключевой механизм

GC pacer контролирует **когда** запускать GC и **сколько CPU** выделять.

<GCPacingCalculator />

### gcControllerState

```go
// runtime/mgcpacer.go
type gcControllerState struct {
    gcPercent atomic.Int32  // GOGC value

    // Trigger calculation
    heapMarked  uint64      // Живые данные после последнего GC
    heapGoal    atomic.Uint64
    trigger     uint64      // Когда запускать следующий GC

    // Pacing
    assistWorkPerByte atomic.Float64
    dedicatedMarkWorkersNeeded atomic.Int64
}
```

### Формула Trigger

```go
// runtime/mgcpacer.go
func (c *gcControllerState) trigger() uint64 {
    goal := c.heapGoal.Load()
    // trigger = goal * (1 - triggerRatio)
    // где triggerRatio ≈ 0.05-0.45 в зависимости от pacing
    return uint64(float64(goal) * (1 - c.triggerRatio))
}
```

Упрощённо:
```
trigger = heapLive * (1 + GOGC/100 - buffer)
```

### GOGC

```bash
GOGC=100  # default: heap doubles между GC
GOGC=50   # чаще GC, меньше память
GOGC=200  # реже GC, больше память
GOGC=off  # GC отключен!
```

**Формула:**
```
heapGoal = heapLive * (1 + GOGC/100)
```

При `GOGC=100` и `heapLive=100MB` → `heapGoal=200MB`.

### GOMEMLIMIT (Go 1.19+)

Soft memory limit для всего процесса:

```bash
GOMEMLIMIT=1GiB  # Лимит 1GB
```

```go
// runtime/mgcpacer.go
func (c *gcControllerState) commit() {
    if c.memoryLimit != math.MaxInt64 {
        // Уменьшаем effective GOGC если приближаемся к лимиту
        effectiveGOGC = min(GOGC, (limit - nonHeap - live) / live * 100)
    }
}
```

**Когда GOMEMLIMIT активен:**
- GC становится агрессивнее при приближении к лимиту
- `(forced)` в gctrace означает принудительный GC из-за лимита

### GC Assist

Когда allocations опережают marking, горутины **помогают GC**:

```go
// runtime/malloc.go
func mallocgc(size uintptr, typ *_type, needzero bool) unsafe.Pointer {
    if gcBlackenEnabled != 0 {
        // Проверяем debt
        assistG := getg().m.curg
        if assistG.gcAssistBytes < 0 {
            // Помогаем GC перед аллокацией
            gcAssistAlloc(assistG)
        }
    }
}
```

```go
// runtime/mgcmark.go
func gcAssistAlloc(gp *g) {
    // Считаем сколько работы нужно сделать
    assistWorkPerByte := gcController.assistWorkPerByte.Load()
    scanWork := int64(googc.bytesMarked) * assistWorkPerByte

    // Делаем работу
    systemstack(func() {
        gcDrainN(&p.gcw, scanWork)
    })
}
```

**Debt/Credit система:**
- Аллокация создаёт "долг" (debt)
- Marking создаёт "кредит" (credit)
- Если debt > 0, горутина должна помочь GC

---

## GOGC vs GOMEMLIMIT

### Когда использовать GOGC

| Сценарий | GOGC |
|----------|------|
| Throughput-oriented | 200-400 |
| Memory-constrained | 50-100 |
| Low latency | 50-100 |
| Batch processing | off (с GOMEMLIMIT!) |

### Когда использовать GOMEMLIMIT

| Сценарий | GOMEMLIMIT |
|----------|------------|
| Container с memory limit | container_limit * 0.9 |
| Shared host | предсказуемый budget |
| Large heap (>1GB) | обязательно |
| Batch с GOGC=off | обязательно! |

### Memory Ballast — устаревший паттерн

**До Go 1.19:**
```go
// Искусственный ballast чтобы GC запускался реже
var ballast = make([]byte, 1<<30) // 1GB ballast
```

**Go 1.19+:**
```bash
GOMEMLIMIT=2GiB  # Просто используйте GOMEMLIMIT
```

### Миграция с ballast

```diff
- var ballast = make([]byte, 1<<30)
+ // Установите GOMEMLIMIT=2GiB в environment
```

```
Heap Growth без GOMEMLIMIT:

     GOGC=100 only
          ╱
    ┌────╱ goal = 2x live
    │   ╱
────┴──╱────────────────→ memory


Heap Growth с GOMEMLIMIT:

     Earlier trigger из-за limit
         ╱
    ┌───╱ limit
    │  ╱
────┴─╱─────────────────→ memory
```

---

## Mark Workers

### Три типа workers

```go
// runtime/mgc.go
const (
    gcMarkWorkerDedicatedMode = iota // 25% CPU
    gcMarkWorkerFractionalMode       // Частичная занятость
    gcMarkWorkerIdleMode             // Только когда P idle
)
```

**Dedicated workers (25%):**
- Запускаются на каждом 4-м P
- Работают непрерывно во время marking

**Fractional workers:**
- Добирают до нужного CPU budget
- Могут прерываться

**Idle workers:**
- Работают только когда P не занят
- Бесплатная работа!

### Work Stealing в GC

```go
// runtime/mgcwork.go
func (w *gcWork) balance() {
    if w.wbuf1 == nil || w.wbuf1.nobj <= 4 {
        return
    }
    // Отдаём половину работы в global worklist
    w.wbuf1.nobj /= 2
    putfull(w.wbuf1)
    // ...
}
```

---

## gctrace Deep Dive

<GCTraceExplorer />

### Формат вывода

```bash
GODEBUG=gctrace=1 ./app
```

```
gc 1 @0.004s 2%: 0.019+0.35+0.003 ms clock, 0.076+0.10/0.32/0.065+0.012 ms cpu, 4->4->0 MB, 4 MB goal, 0 MB stacks, 0 MB globals, 4 P
```

Разбор:
- `gc 1` — номер цикла
- `@0.004s` — время с запуска
- `2%` — CPU на GC
- `0.019+0.35+0.003 ms clock` — STW1 + concurrent + STW2
- `0.076+0.10/0.32/0.065+0.012 ms cpu` — assist + mark workers
- `4->4->0 MB` — heap before → after → live
- `4 MB goal` — heap goal
- `4 P` — GOMAXPROCS

### Red Flags

| Pattern | Проблема |
|---------|----------|
| STW > 1ms | Много горутин или большой heap |
| CPU > 10% | High allocation rate |
| `(forced)` | GOMEMLIMIT достигнут |
| live ≈ goal | Нет garbage, рассмотрите увеличение GOMEMLIMIT |
| > 10 GC/sec | Слишком много allocations |

### gcpacertrace

```bash
GODEBUG=gctrace=1,gcpacertrace=1 ./app
```

Показывает внутренности pacer: trigger, assist ratio, utilization.

---

## Large Heaps (100GB+)

### Проблемы

1. **Long mark phase** — больше объектов сканировать
2. **Fragmentation** — holes в heap
3. **STW scaling** — больше stacks сканировать

### Arena Allocator (Go 1.20+)

```go
import "arena"

func processLargeData() {
    a := arena.NewArena()
    defer a.Free() // Освобождаем всё сразу

    // Аллокации в arena — не учитываются GC!
    data := arena.MakeSlice[byte](a, 1<<30, 1<<30)
    // ...
}
```

**Преимущества:**
- Объекты в arena не сканируются GC
- Освобождение O(1) — free entire arena
- Идеально для request-scoped данных

**Ограничения:**
- Нельзя хранить указатели на heap
- Нужно управлять lifetime вручную

### Off-heap через mmap

```go
import "syscall"

func allocateOffHeap(size int) ([]byte, error) {
    data, err := syscall.Mmap(
        -1, 0, size,
        syscall.PROT_READ|syscall.PROT_WRITE,
        syscall.MAP_ANON|syscall.MAP_PRIVATE,
    )
    return data, err
}

func freeOffHeap(data []byte) error {
    return syscall.Munmap(data)
}
```

**Когда использовать:**
- Большие read-only данные (ML models, dictionaries)
- Memory-mapped files
- Данные с известным lifetime

### Sharding Strategies

```go
type ShardedCache struct {
    shards [256]*Shard
}

type Shard struct {
    mu   sync.RWMutex
    data map[uint64][]byte
}

func (c *ShardedCache) Get(key uint64) ([]byte, bool) {
    shard := c.shards[key%256]
    shard.mu.RLock()
    defer shard.mu.RUnlock()
    v, ok := shard.data[key]
    return v, ok
}
```

Шардирование уменьшает contention и распределяет GC pressure.

---

## Оптимизации

### 1. Pointer-free structs → noscan

```go
// BAD: GC сканирует этот slice
type Entry struct {
    Key   string  // string содержит указатель!
    Value []byte  // slice содержит указатель!
}
var cache = make([]Entry, 1000000) // 1M entries to scan

// GOOD: Используем offsets в backing array
type CompactCache struct {
    keys   []byte  // noscan — нет указателей внутри
    values []byte  // noscan
    index  []struct {
        keyOff, keyLen     uint32
        valueOff, valueLen uint32
    } // noscan — нет указателей!
}
```

### 2. Pre-allocation

```go
// BAD: Аллокации в hot path
func handleRequest(items []Item) {
    results := make([]Result, 0) // Аллокация!
    for _, item := range items {
        results = append(results, process(item))
    }
}

// GOOD: Pre-allocate
func handleRequest(items []Item) {
    results := make([]Result, 0, len(items)) // Known capacity
    for _, item := range items {
        results = append(results, process(item))
    }
}
```

### 3. sync.Pool правильно

```go
var bufferPool = sync.Pool{
    New: func() interface{} {
        return make([]byte, 4096)
    },
}

func process(data []byte) []byte {
    buf := bufferPool.Get().([]byte)
    defer bufferPool.Put(buf[:0]) // Reset length, keep capacity!

    // Используем buf...
    return append(buf, data...)
}
```

**Правила:**
- Pool очищается при каждом GC
- Не храните указатели в pooled объектах
- Reset объект перед Put

### 4. Map с pointer keys — проблема

```go
// BAD: Каждый ключ и значение — pointer, GC сканирует всё
cache := make(map[*User]*Session, 100000)

// GOOD: Используем IDs
cache := make(map[uint64]uint64, 100000) // noscan!
users := make([]User, 100000)
sessions := make([]Session, 100000)
```

### 5. Struct layout

```go
// BAD: Указатели разбросаны
type Bad struct {
    a int64
    p *int      // pointer
    b int64
    q *string   // pointer
    c int64
}

// GOOD: Указатели сгруппированы
type Good struct {
    // Pointers first
    p *int
    q *string
    // Then non-pointers
    a int64
    b int64
    c int64
}
```

GC сканирует только prefix до последнего указателя.

---

## Финалайзеры — Антипаттерн

### Проблемы

1. **Timing undefined** — может не вызваться вообще
2. **Delays GC** — объект живёт ещё один цикл
3. **Single finalizer** — перезаписывается
4. **Goroutine required** — финалайзеры запускаются в отдельной горутине

### Единственный валидный use case

```go
type Resource struct {
    handle uintptr
    closed bool
}

func NewResource() *Resource {
    r := &Resource{
        handle: openHandle(),
    }
    // Safety net — не основной механизм!
    runtime.SetFinalizer(r, func(r *Resource) {
        if !r.closed {
            // Логируем stack trace для debugging
            log.Printf("LEAK: Resource not closed! Allocated at:\n%s",
                debug.Stack())
            closeHandle(r.handle)
        }
    })
    return r
}

func (r *Resource) Close() error {
    if r.closed {
        return nil
    }
    r.closed = true
    runtime.SetFinalizer(r, nil) // Убираем finalizer
    return closeHandle(r.handle)
}
```

**Используйте finalizer только как safety net с логированием, не как основной механизм cleanup!**

---

## Edge Cases и Gotchas

### 1. High Allocation Rate

```go
// Проблема: 1000 allocations per request
func handleRequest(w http.ResponseWriter, r *http.Request) {
    for i := 0; i < 1000; i++ {
        data := make([]byte, 1024) // Allocation!
        process(data)
    }
}

// Решение: Reuse через sync.Pool
var dataPool = sync.Pool{New: func() interface{} { return make([]byte, 1024) }}

func handleRequest(w http.ResponseWriter, r *http.Request) {
    for i := 0; i < 1000; i++ {
        data := dataPool.Get().([]byte)
        process(data)
        dataPool.Put(data)
    }
}
```

### 2. Closure capturing

```go
// BAD: Closure захватывает весь largeData
func process(largeData []byte) func() {
    return func() {
        // Используем только первый байт, но весь slice живёт!
        fmt.Println(largeData[0])
    }
}

// GOOD: Копируем только нужное
func process(largeData []byte) func() {
    firstByte := largeData[0] // Копируем значение
    return func() {
        fmt.Println(firstByte)
    }
}
```

### 3. Slice keeping backing array

```go
// BAD: Маленький slice держит большой backing array
func getPrefix(data []byte) []byte {
    return data[:10] // data (1GB) не освобождается!
}

// GOOD: Копируем
func getPrefix(data []byte) []byte {
    result := make([]byte, 10)
    copy(result, data[:10])
    return result
}
```

### 4. String interning

```go
// Проблема: Много одинаковых строк
var strings []string
for _, line := range millionLines {
    strings = append(strings, line) // Дубликаты!
}

// Решение: String interning
var intern = make(map[string]string)
var internMu sync.RWMutex

func internString(s string) string {
    internMu.RLock()
    if interned, ok := intern[s]; ok {
        internMu.RUnlock()
        return interned
    }
    internMu.RUnlock()

    internMu.Lock()
    defer internMu.Unlock()
    if interned, ok := intern[s]; ok {
        return interned
    }
    intern[s] = s
    return s
}
```

---

## Профилирование

### pprof: heap vs allocs

```bash
# Текущее использование памяти
go tool pprof http://localhost:6060/debug/pprof/heap

# Cumulative allocations (найти allocation hotspots)
go tool pprof http://localhost:6060/debug/pprof/allocs
```

**heap profile:** Что сейчас в памяти (live objects)
**allocs profile:** Где происходят allocations (total)

### runtime.MemStats

```go
var m runtime.MemStats
runtime.ReadMemStats(&m)

fmt.Printf("HeapAlloc: %d MB\n", m.HeapAlloc/1024/1024)
fmt.Printf("HeapSys: %d MB\n", m.HeapSys/1024/1024)
fmt.Printf("HeapObjects: %d\n", m.HeapObjects)
fmt.Printf("NumGC: %d\n", m.NumGC)
fmt.Printf("PauseTotalNs: %d ms\n", m.PauseTotalNs/1000000)
fmt.Printf("LastGC: %v\n", time.Unix(0, int64(m.LastGC)))
```

Ключевые поля:
- `HeapAlloc` — текущий heap usage
- `HeapInuse` — heap in use by application
- `HeapObjects` — количество объектов
- `NumGC` — количество GC циклов
- `PauseTotalNs` — суммарное время STW

### runtime/trace

```go
import "runtime/trace"

f, _ := os.Create("trace.out")
trace.Start(f)
defer trace.Stop()
```

```bash
go tool trace trace.out
```

Показывает:
- GC events на timeline
- Goroutine scheduling
- Heap growth
- STW паузы

---

## Резюме

1. **Понимайте tri-color marking** — основа concurrent GC
2. **Используйте gctrace** — диагностика проблем
3. **GOMEMLIMIT > GOGC** для memory management в Go 1.19+
4. **Minimize allocations** — sync.Pool, pre-allocate, pointer-free structs
5. **Profile regularly** — pprof heap/allocs, runtime/trace
6. **Avoid finalizers** — кроме safety net с логированием
7. **Watch for STW** — цель < 1ms, ideally < 100μs
