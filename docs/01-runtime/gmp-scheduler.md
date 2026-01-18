# GMP Scheduler

Планировщик Go — это сердце runtime, превращающее тысячи горутин в эффективную параллельную работу на ограниченном числе OS threads. В этой статье разберём внутренности GMP-модели, work stealing, preemption и диагностику планировщика.

## TL;DR

| Характеристика | Значение |
|----------------|----------|
| **G (Goroutine)** | Легковесный поток, начальный стек ~2KB |
| **M (Machine)** | OS thread, выполняет код горутин |
| **P (Processor)** | Логический процессор, GOMAXPROCS штук |
| **Local Run Queue** | До 256 G на P, lock-free circular buffer |
| **Global Run Queue** | Overflow + orphaned G, linked list с mutex |
| **Work Stealing** | P крадёт ровно 50% очереди у других |
| **Preemption** | Async с Go 1.14 (signal-based, SIGURG) |
| **sysmon** | Системный монитор, 20μs→10ms adaptive sleep |

## G-M-P модель

### Зачем трёхуровневая модель?

Наивный подход 1:1 (goroutine = OS thread) не работает:
- Создание thread ~1MB стека + syscall overhead
- Context switch через kernel — дорого
- Миллион горутин = миллион threads = OOM

Go использует M:N модель с дополнительным уровнем абстракции:

```
┌─────────────────────────────────────────────────────────────┐
│                         User Space                          │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐            │
│  │  G  │ │  G  │ │  G  │ │  G  │ │  G  │ │  G  │ ...        │
│  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘            │
│     │       │       │       │       │       │               │
│  ┌──┴───────┴───────┴──┐ ┌──┴───────┴───────┴──┐            │
│  │         P0          │ │         P1          │  ...       │
│  │  ┌───────────────┐  │ │  ┌───────────────┐  │            │
│  │  │  Local Queue  │  │ │  │  Local Queue  │  │            │
│  │  └───────────────┘  │ │  └───────────────┘  │            │
│  └──────────┬──────────┘ └──────────┬──────────┘            │
│             │                       │                       │
│  ┌──────────┴──────────┐ ┌──────────┴──────────┐            │
│  │         M0          │ │         M1          │  ...       │
│  └──────────┬──────────┘ └──────────┬──────────┘            │
├─────────────┼───────────────────────┼───────────────────────┤
│             │       Kernel Space    │                       │
│  ┌──────────┴──────────┐ ┌──────────┴──────────┐            │
│  │     OS Thread 0     │ │     OS Thread 1     │  ...       │
│  └─────────────────────┘ └─────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

**P (Processor)** — ключевое звено:
- Ограничивает параллелизм до GOMAXPROCS
- Содержит локальные ресурсы (mcache, LRQ)
- Позволяет M переключаться между P при syscalls

<GMPModelDiagram />

### Структуры runtime

#### runtime.g — горутина

```go
// runtime/runtime2.go
type g struct {
    stack       stack   // stack.lo и stack.hi — границы стека
    stackguard0 uintptr // для проверки stack overflow в прологе

    m            *m     // текущий M, выполняющий эту G (или nil)
    sched        gobuf  // контекст: SP, PC, BP для переключения
    atomicstatus atomic.Uint32 // _Grunnable, _Grunning, _Gwaiting...

    preempt     bool // запрос на preemption
    preemptStop bool // для STW (stop-the-world)

    lockedm *m      // LockOSThread() привязывает G к M
    waiting *sudog  // список ожидания для каналов

    goid uint64 // уникальный ID горутины
}
```

#### runtime.m — машина (OS thread)

```go
type m struct {
    g0      *g     // системная горутина для scheduler кода
    curg    *g     // текущая пользовательская горутина

    p       *p     // привязанный P (nil при syscall/idle)
    nextp   *p     // P для следующего запуска
    oldp    *p     // P перед syscall (для быстрого возврата)

    spinning bool  // M в режиме work stealing
    blocked  bool  // заблокирован на syscall

    park    note   // семафор для parking/unparking
    schedlink *m   // linked list для idle M pool
}
```

#### runtime.p — процессор

```go
type p struct {
    status uint32 // _Pidle, _Prunning, _Psyscall, _Pgcstop
    m      *m     // привязанный M (nil если idle)

    // Local Run Queue — lock-free circular buffer
    runqhead uint32
    runqtail uint32
    runq     [256]guintptr // фиксированный размер!

    runnext guintptr // следующая G для запуска (fast path)

    // Локальные ресурсы
    mcache *mcache  // кэш аллокатора для этого P
    gFree  gList    // кэш свободных G структур

    // GC
    gcBgMarkWorker *g // background mark worker
}
```

## Очереди планировщика

### Local Run Queue (LRQ)

Каждый P имеет локальную очередь на 256 горутин:

```
P0.runq (circular buffer):
┌─────────────────────────────────────────────────┐
│  [0]  [1]  [2]  [3]  [4]  ...  [255]            │
│   G    G    G    G    G                         │
│   ↑                   ↑                         │
│  head                tail                       │
└─────────────────────────────────────────────────┘

runqhead = 0  (consumer берёт отсюда)
runqtail = 5  (producer добавляет сюда)
```

**Особенности:**
- Lock-free операции через atomic
- Фиксированный размер 256 — overflow идёт в GRQ
- `runnext` — fast path для только что созданных горутин

### Global Run Queue (GRQ)

```go
type schedt struct {
    lock mutex

    runq     gQueue // linked list горутин
    runqsize int32  // размер очереди

    // Idle ресурсы
    midle    *m     // idle M list
    pidle    *p     // idle P list
    nmidlelocked int32
}
```

**Когда G попадает в GRQ:**
- Overflow из LRQ (> 256 горутин)
- Горутина разблокировалась, а её P занят
- `runtime.Gosched()` с переполненным LRQ

### Network Poller

```
epoll/kqueue/IOCP
       │
       ▼
 ┌──────────────┐
 │ netpoller    │ ── готовые G возвращаются
 │              │    в scheduler
 │ [waiting G]  │
 │ [waiting G]  │
 └──────────────┘
```

Network poller интегрирован в scheduler:
- Горутины на IO блокируются без занятия M
- `netpoll()` вызывается в `findrunnable()` для получения ready G

## Цикл планировщика

### schedule() — главный цикл

```go
// runtime/proc.go
func schedule() {
    mp := getg().m

top:
    pp := mp.p.ptr()

    // Проверка preemption для GC STW
    if sched.gcwaiting.Load() {
        gcstopm()
        goto top
    }

    // Найти горутину для выполнения
    gp, inheritTime, tryWakeP := findRunnable()

    // Выполнить горутину
    execute(gp, inheritTime)
}
```

### findrunnable() — поиск работы

```go
func findrunnable() (gp *g, inheritTime, tryWakeP bool) {
    mp := getg().m
    pp := mp.p.ptr()

    // 1. Локальная очередь
    if gp, inheritTime := runqget(pp); gp != nil {
        return gp, inheritTime, false
    }

    // 2. Глобальная очередь (каждые 61 тиков!)
    if pp.schedtick%61 == 0 && sched.runqsize > 0 {
        lock(&sched.lock)
        gp := globrunqget(pp, 0)
        unlock(&sched.lock)
        if gp != nil {
            return gp, false, false
        }
    }

    // 3. Network poller
    if netpollinited() && netpollAnyWaiters() {
        if list, delta := netpoll(0); !list.empty() {
            gp := list.pop()
            injectglist(&list) // остальные в GRQ
            return gp, false, false
        }
    }

    // 4. Work stealing
    gp, inheritTime, _, _ = stealWork(now, &newWork)
    if gp != nil {
        return gp, inheritTime, false
    }

    // 5. Ничего нет — parking
    stopm()
    goto top
}
```

**Магическое число 61**: проверка GRQ каждые 61 тиков предотвращает starvation глобальных горутин при активном work stealing. Почему именно 61?

- **Простое число** — не делится ни на какие типичные значения (количество CPU, размеры кэш-линий, степени двойки)
- **Избежание lock contention** — если бы использовалось, например, 64, все P могли бы синхронизироваться и одновременно обращаться к `sched.lock`
- **Равномерное распределение** — простое число гарантирует, что разные P будут проверять GRQ в разные моменты времени, даже если стартовали синхронно

## Work Stealing

Когда P исчерпал свою LRQ, он крадёт работу у других P:

```go
func stealWork(now int64) (gp *g, ...) {
    pp := getg().m.p.ptr()

    // Рандомный порядок обхода P
    for i := 0; i < 4; i++ {
        // Выбираем случайную жертву
        victim := allp[fastrandn(uint32(gomaxprocs))]

        if victim == pp {
            continue
        }

        // Крадём РОВНО половину очереди
        if gp := runqsteal(pp, victim, stealRunNextG); gp != nil {
            return gp, false
        }
    }
    return nil, false
}

func runqsteal(pp, victim *p, stealRunNextG bool) *g {
    t := victim.runqtail
    h := victim.runqhead
    n := t - h       // количество в очереди жертвы
    n = n - n/2      // крадём половину

    // Копируем G из victim.runq в pp.runq
    for i := uint32(0); i < n; i++ {
        gp := victim.runq[(h+i) % 256]
        pp.runq[(pp.runqtail+i) % 256] = gp
    }

    // Атомарно обновляем указатели
    atomic.StoreUint32(&pp.runqtail, pp.runqtail+n)
    atomic.StoreUint32(&victim.runqhead, h+n)

    return pp.runq[pp.runqhead].ptr()
}
```

<WorkStealingSimulator />

## Preemption

### Cooperative Preemption (до Go 1.14)

Проверка в прологе каждой функции:

```asm
TEXT ·myFunc(SB), $0
    MOVQ  (TLS), CX        // g в CX
    CMPQ  SP, 16(CX)       // SP vs g.stackguard0
    JLS   morestack        // если меньше — прерывание
    // тело функции...
```

**Проблема:** tight loop без вызовов функций никогда не прерывается:

```go
// Этот код блокирует P навсегда до Go 1.14!
func tightLoop() {
    for {
        sum += i
    }
}
```

### Async Preemption (Go 1.14+)

Signal-based preemption через SIGURG:

```go
// runtime/signal_unix.go
func preemptM(mp *m) {
    signalM(mp, sigPreempt) // посылаем SIGURG
}

// Обработчик сигнала
func sighandler(sig uint32, ...) {
    if sig == sigPreempt {
        doSigPreempt(gp, ctxt)
    }
}

func doSigPreempt(gp *g, ctxt *sigctxt) {
    // Проверяем safe point
    if wantAsyncPreempt(gp) {
        // Модифицируем контекст для возврата в asyncPreempt
        ctxt.pushCall(abi.FuncPCABI0(asyncPreempt), newpc)
    }
}
```

**sysmon** периодически проверяет и прерывает долгоработающие горутины:

```go
func sysmon() {
    for {
        usleep(delay)

        // Проверяем каждый P
        for _, pp := range allp {
            s := pp.status
            if s == _Prunning {
                t := pp.schedtick
                if t == pp.sysmontick.schedtick {
                    // P не переключался — preempt!
                    preemptone(pp)
                }
            }
        }
    }
}
```

### Правильное использование runtime.Gosched()

```go
// Явная точка переключения
func processItems(items []Item) {
    for i, item := range items {
        process(item)

        // Уступаем процессор каждые 1000 итераций
        if i%1000 == 0 {
            runtime.Gosched()
        }
    }
}
```

::: warning Когда НЕ нужен Gosched()
С Go 1.14+ async preemption работает автоматически. `Gosched()` нужен только для:
- Явного контроля fairness
- Совместимости со старыми версиями Go
- Специфичных сценариев с `GOMAXPROCS=1`
:::

## System Calls и Handoff

При blocking syscall M освобождает P для других горутин:

```
Before syscall:
┌────────────────────────────────┐
│  M0 ←──────→ P0                │
│  │           │                 │
│  └── curg: G1 (running)        │
└────────────────────────────────┘

During syscall:
┌────────────────────────────────┐
│  M0 (blocked in syscall)       │
│  │                             │
│  └── G1 (waiting)              │
│                                │
│  M1 ←──────→ P0  (handoff!)    │
│  │           │                 │
│  └── curg: G2 (running)        │
└────────────────────────────────┘

After syscall:
┌────────────────────────────────┐
│  M0 пытается:                  │
│  1. Забрать P0 обратно (oldp)  │
│  2. Взять любой idle P         │
│  3. Положить G1 в GRQ и park   │
└────────────────────────────────┘
```

```go
// runtime/proc.go
func entersyscall() {
    // Сохраняем P в oldp для быстрого возврата
    pp := mp.p.ptr()
    mp.oldp.set(pp)

    // Отвязываем P от M
    pp.m = 0
    mp.p = 0
    pp.status = _Psyscall
}

func exitsyscall() {
    // Пробуем вернуть свой P
    if oldp := mp.oldp.ptr(); oldp != nil && oldp.status == _Psyscall {
        if atomic.Cas(&oldp.status, _Psyscall, _Prunning) {
            mp.p.set(oldp)
            return
        }
    }

    // Берём любой idle P
    if pp := pidleget(); pp != nil {
        mp.p.set(pp)
        return
    }

    // Нет свободных P — паркуем M, G в GRQ
    globrunqput(gp)
    stopm()
}
```

**handoffp()** вызывается sysmon когда обнаружен P в состоянии `_Psyscall`:

```go
func handoffp(pp *p) {
    // Ищем или создаём M для этого P
    if sched.runqsize > 0 || sched.npidle == 0 {
        startm(pp, true) // запускаем M для P
        return
    }

    // Все спокойно — P в idle
    pidleput(pp)
}
```

## GOMAXPROCS

### CPU-bound vs IO-bound

| Нагрузка | Рекомендация | Причина |
|----------|--------------|---------|
| CPU-bound | `GOMAXPROCS = NumCPU()` | Больше P = context switch overhead |
| IO-bound | `GOMAXPROCS = NumCPU()` или больше | M блокируются на IO, P простаивают |
| Mixed | Тестировать под нагрузкой | Зависит от соотношения |

### Container-aware (Go 1.25)

```go
import _ "go.uber.org/automaxprocs"

// Или вручную
func init() {
    if quota := getContainerCPUQuota(); quota > 0 {
        runtime.GOMAXPROCS(int(quota))
    }
}
```

::: tip Go 1.25
В Go 1.25 добавлена автоматическая детекция container CPU limits через cgroups v2.
:::

### Динамическое изменение

```go
// Можно менять в runtime
old := runtime.GOMAXPROCS(8)
defer runtime.GOMAXPROCS(old)

// Для временной нагрузки
runtime.GOMAXPROCS(runtime.NumCPU() * 2)
```

## Состояния горутин

```
                    ┌─────────────┐
              ┌────▶│  _Grunnable │◀────┐
              │     └──────┬──────┘     │
              │            │            │
        goready()     schedule()    preempt
              │            │            │
              │            ▼            │
         ┌────┴────┐  ┌─────────┐  ┌────┴──────┐
         │_Gwaiting│◀─│_Grunning│─▶│_Gpreempted│
         └─────────┘  └────┬────┘  └───────────┘
                           │
                      exit/panic
                           │
                           ▼
                     ┌──────────┐
                     │  _Gdead  │
                     └──────────┘
```

**Основные состояния:**

| Состояние | Описание |
|-----------|----------|
| `_Gidle` | G только создана, не инициализирована |
| `_Grunnable` | В очереди, готова к выполнению |
| `_Grunning` | Выполняется на M |
| `_Gsyscall` | В blocking syscall |
| `_Gwaiting` | Заблокирована (channel, mutex, etc) |
| `_Gpreempted` | Прервана async preemption |
| `_Gdead` | Завершена, готова к переиспользованию |

### gopark / goready

```go
// Блокировка горутины
func gopark(unlockf func(*g, unsafe.Pointer) bool, ...) {
    mp := acquirem()
    gp := mp.curg

    gp.waitreason = reason
    gp.atomicstatus.Store(_Gwaiting)

    // Переключаемся на g0 и вызываем schedule()
    mcall(park_m)
}

// Разблокировка горутины
func goready(gp *g, traceskip int) {
    // Добавляем в runnext текущего P (fast path)
    runqput(pp, gp, true)

    // Будим idle P если есть
    wakep()
}
```

## Диагностика

### GODEBUG=schedtrace

```bash
GODEBUG=schedtrace=1000 ./app
```

<SchedulerTraceExplorer />

### runtime/trace

```go
import "runtime/trace"

func main() {
    f, _ := os.Create("trace.out")
    trace.Start(f)
    defer trace.Stop()

    // код приложения
}
```

```bash
go tool trace trace.out
```

### pprof goroutine profile

```go
import _ "net/http/pprof"

func main() {
    go http.ListenAndServe(":6060", nil)
    // ...
}
```

```bash
go tool pprof http://localhost:6060/debug/pprof/goroutine
```

### Goroutine leak detection

```go
import "go.uber.org/goleak"

func TestMain(m *testing.M) {
    goleak.VerifyTestMain(m)
}
```

## Практические паттерны

### Worker Pool для CPU-bound

```go
func WorkerPool(jobs <-chan Job, workers int) <-chan Result {
    results := make(chan Result, workers)

    var wg sync.WaitGroup
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for job := range jobs {
                results <- process(job)
            }
        }()
    }

    go func() {
        wg.Wait()
        close(results)
    }()

    return results
}

// Использование
workers := runtime.GOMAXPROCS(0) // число P
results := WorkerPool(jobs, workers)
```

### Ограничение параллелизма

```go
// Semaphore через buffered channel
type Semaphore chan struct{}

func NewSemaphore(n int) Semaphore {
    return make(chan struct{}, n)
}

func (s Semaphore) Acquire() { s <- struct{}{} }
func (s Semaphore) Release() { <-s }

// Использование
sem := NewSemaphore(10) // max 10 concurrent

for _, item := range items {
    sem.Acquire()
    go func(item Item) {
        defer sem.Release()
        process(item)
    }(item)
}
```

### Anti-patterns

::: danger Слишком много горутин
```go
// Плохо: миллион горутин
for i := 0; i < 1_000_000; i++ {
    go process(i)
}

// Хорошо: worker pool
jobs := make(chan int, 100)
for i := 0; i < runtime.GOMAXPROCS(0); i++ {
    go worker(jobs)
}
for i := 0; i < 1_000_000; i++ {
    jobs <- i
}
```
:::

::: danger Tight loop без preemption points (Go < 1.14)
```go
// Проблема в Go < 1.14
for {
    // бесконечный цикл без вызовов функций
    counter++
}

// Решение для совместимости
for {
    counter++
    if counter%10000 == 0 {
        runtime.Gosched()
    }
}
```
:::

## Выводы

1. **G-M-P модель** — три уровня абстракции позволяют эффективно мультиплексировать горутины на ограниченное число OS threads

2. **Work Stealing** обеспечивает автоматическую балансировку нагрузки между P

3. **Async Preemption** (Go 1.14+) решает проблему tight loops, но понимание cooperative preemption важно для legacy кода

4. **GOMAXPROCS** — не серебряная пуля:
   - **CPU-bound задачи** (вычисления, сжатие, криптография): `GOMAXPROCS = NumCPU()` оптимален, больше P не ускорит — CPU уже загружены на 100%, а лишние P только добавят overhead на context switch
   - **IO-bound задачи** (HTTP-запросы, БД, файловый ввод-вывод): `GOMAXPROCS > NumCPU()` может помочь — пока одни горутины ждут IO, другие P могут выполнять полезную работу. Но M всё равно паркуются при блокировке, поэтому выигрыш ограничен
   - **Смешанная нагрузка**: начните с `NumCPU()`, профилируйте, увеличивайте если видите низкую утилизацию CPU при высоком latency

5. **schedtrace** — первый инструмент диагностики проблем с планировщиком

6. **Worker pools** — правильный паттерн для CPU-bound задач вместо spawn миллиона горутин
