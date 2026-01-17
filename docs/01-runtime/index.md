# Runtime & Memory

Go занимает уникальную нишу между интерпретируемыми языками с VM и классическими compiled языками. Это не Java с JIT и не C с прямым маппингом на железо — Go компилируется в нативный код, но при этом включает **runtime**, который работает вместе с вашим кодом.

Понимание runtime критично для Senior разработчика по нескольким причинам:
- Диагностика проблем с latency требует понимания GC pauses
- Оптимизация throughput невозможна без знания escape analysis
- Debugging race conditions упирается в понимание scheduler

## Архитектура Go Runtime

```
┌───────────────────────────────────────────────────────────────┐
│                        Go Program                             │
│              (ваш код + стандартная библиотека)               │
├───────────────────────────────────────────────────────────────┤
│                        Go Runtime                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │    Scheduler    │  │     Memory      │  │    System     │  │
│  │     (GMP)       │  │   Management    │  │   Services    │  │
│  │                 │  │                 │  │               │  │
│  │  • G-M-P model  │  │  • Allocator    │  │  • netpoll    │  │
│  │  • Work stealing│  │  • GC           │  │  • timers     │  │
│  │  • Preemption   │  │  • Stack growth │  │  • signals    │  │
│  └─────────────────┘  └─────────────────┘  └───────────────┘  │
├───────────────────────────────────────────────────────────────┤
│                    OS Abstraction Layer                       │
│          (syscall wrappers, platform-specific code)           │
├───────────────────────────────────────────────────────────────┤
│                   OS (Linux/Darwin/Windows)                   │
└───────────────────────────────────────────────────────────────┘
```

Runtime линкуется статически в каждый Go бинарник. Это объясняет, почему даже "Hello, World" на Go весит ~2MB — туда включён весь runtime.

## Что находится в `runtime/`

Код runtime — это ~150k строк Go + ассемблер. Ключевые файлы:

| Файл | Назначение |
|------|------------|
| `proc.go` | Scheduler, G-M-P логика |
| `malloc.go` | Memory allocator |
| `mgc.go` | Garbage collector |
| `stack.go` | Stack growth/shrink |
| `netpoll_*.go` | Platform-specific network polling |
| `runtime2.go` | Основные структуры данных (g, m, p) |

## Ключевые константы Runtime

| Параметр | Значение (Go 1.25) | Описание |
|----------|-------------------|----------|
| Начальный размер стека | 2 KB | `_StackMin` в `stack.go` |
| Максимальный размер стека | 1 GB (64-bit) | `maxstacksize` |
| GOMAXPROCS default | `runtime.NumCPU()` | Количество P |
| GOGC default | 100 | GC срабатывает при росте heap на 100% |
| GOMEMLIMIT | unlimited | Soft memory limit (Go 1.19+) |
| Минимальный heap size | 4 MB | `heapMinimum` |

::: tip Практический совет
`GOMAXPROCS` автоматически определяет CPU limit в контейнерах начиная с Go 1.25. До этого использовали `go.uber.org/automaxprocs`.
:::

## Темы раздела

### [GMP Scheduler](./gmp-scheduler)

Как Go исполняет миллионы горутин на ограниченном числе OS threads.

- **G** (Goroutine) — легковесная единица исполнения
- **M** (Machine) — OS thread
- **P** (Processor) — контекст с local run queue

Понимание GMP объясняет, почему `GOMAXPROCS=1` не означает однопоточность, как работает work stealing, и почему горутина может выполняться на разных M.

### [Garbage Collector](./gc)

Tri-color concurrent mark & sweep с sub-millisecond STW pauses.

Go GC оптимизирован для latency, а не throughput. Это означает:
- Больше CPU на GC по сравнению с generational collectors
- Предсказуемые паузы (обычно <1ms)
- Нет поколений — все объекты сканируются

Ключевые механизмы: write barrier, GC pacing, concurrent marking.

### [Stack vs Heap](./stack-heap)

Escape analysis и оптимизация аллокаций.

Компилятор Go решает, где разместить переменную — на стеке или в heap. Это решение критично влияет на производительность:
- Stack allocation: ~1-2 ns, автоматическое освобождение
- Heap allocation: ~25-50 ns + нагрузка на GC

## Runtime в действии

```go
// Запуск goroutine проходит через runtime
go func() {
    // newproc() → создание g → помещение в run queue
}()

// Аллокация памяти — через runtime allocator
slice := make([]byte, 1024)
// mallocgc() → выбор size class → выделение из mcache/mcentral/mheap

// Системный вызов — runtime знает о нём
file, _ := os.Open("file.txt")
// entersyscall() → M освобождает P → P может взять другую G
```

## Инструменты диагностики

```bash
# Scheduler tracing
GODEBUG=schedtrace=1000 ./app

# GC tracing
GODEBUG=gctrace=1 ./app

# Memory stats
go tool pprof -alloc_space http://localhost:6060/debug/pprof/heap

# Escape analysis (при сборке)
go build -gcflags="-m -m" ./...
```

## Дальнейшее чтение

- [runtime package documentation](https://pkg.go.dev/runtime)
- [Go scheduler design doc](https://golang.org/s/go11sched)
- [GC design doc](https://go.dev/doc/gc-guide)
- Исходники: `$GOROOT/src/runtime/`
