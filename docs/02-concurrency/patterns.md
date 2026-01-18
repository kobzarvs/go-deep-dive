# Concurrency Patterns

Production-ready паттерны конкурентного программирования в Go. Каждый паттерн проверен в реальных системах и решает конкретную проблему.

## Pipelines

Pipeline — цепочка стадий обработки, где каждая стадия получает данные из входного канала и отправляет в выходной.

<InteractiveModal title="Pipeline Visualizer" icon="🔄" description="Визуализация Pipeline и Fan-Out паттернов">
  <PipelineVisualizer />
</InteractiveModal>

### Базовый Pipeline

```go
// Generator — источник данных
func generator(nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for _, n := range nums {
            out <- n
        }
    }()
    return out
}

// Square — стадия обработки
func square(in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            out <- n * n
        }
    }()
    return out
}

// Использование
func main() {
    // Построение pipeline
    c := generator(2, 3, 4)
    out := square(square(c))

    for n := range out {
        fmt.Println(n)  // 16, 81, 256
    }
}
```

### Pipeline с Context

```go
func generator(ctx context.Context, nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for _, n := range nums {
            select {
            case out <- n:
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}

func square(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for {
            select {
            case n, ok := <-in:
                if !ok {
                    return
                }
                select {
                case out <- n * n:
                case <-ctx.Done():
                    return
                }
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}
```

## Fan-Out / Fan-In

### Fan-Out: распределение работы

```go
// Запустить несколько workers на одном input channel
func fanOut(ctx context.Context, in <-chan Job, workers int) []<-chan Result {
    outs := make([]<-chan Result, workers)
    for i := 0; i < workers; i++ {
        outs[i] = worker(ctx, in)
    }
    return outs
}

func worker(ctx context.Context, in <-chan Job) <-chan Result {
    out := make(chan Result)
    go func() {
        defer close(out)
        for job := range in {
            select {
            case out <- process(job):
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}
```

### Fan-In: объединение результатов

```go
func fanIn(ctx context.Context, channels ...<-chan Result) <-chan Result {
    var wg sync.WaitGroup
    out := make(chan Result)

    // Для каждого входного канала запустить горутину
    output := func(c <-chan Result) {
        defer wg.Done()
        for result := range c {
            select {
            case out <- result:
            case <-ctx.Done():
                return
            }
        }
    }

    wg.Add(len(channels))
    for _, c := range channels {
        go output(c)
    }

    // Закрыть out когда все горутины завершены
    go func() {
        wg.Wait()
        close(out)
    }()

    return out
}
```

### Полный пример Fan-Out/Fan-In

```go
func processJobs(ctx context.Context, jobs []Job, workers int) []Result {
    // Input channel
    in := make(chan Job)
    go func() {
        defer close(in)
        for _, job := range jobs {
            select {
            case in <- job:
            case <-ctx.Done():
                return
            }
        }
    }()

    // Fan-out
    outs := fanOut(ctx, in, workers)

    // Fan-in
    results := fanIn(ctx, outs...)

    // Собрать результаты
    var out []Result
    for result := range results {
        out = append(out, result)
    }
    return out
}
```

## Deadlock Prevention

Deadlock — ситуация когда горутины взаимно блокируют друг друга. Понимание классических deadlock сценариев критично для их предотвращения.

<InteractiveModal title="Deadlock Scenarios" icon="💀" description="Демонстрация различных сценариев deadlock">
  <DeadlockDemo />
</InteractiveModal>

### Правила предотвращения

1. **Lock ordering** — всегда захватывать мьютексы в одинаковом глобальном порядке
2. **Avoid nested locks** — минимизировать количество одновременно удерживаемых locks
3. **Use channels** — предпочитать channels вместо shared state где возможно
4. **Timeouts** — использовать select с timeout для операций с каналами
5. **Context cancellation** — всегда проверять ctx.Done() в долгих операциях

## Error Handling

### errgroup

```go
import "golang.org/x/sync/errgroup"

func fetchAll(ctx context.Context, urls []string) ([]string, error) {
    g, ctx := errgroup.WithContext(ctx)
    results := make([]string, len(urls))

    for i, url := range urls {
        i, url := i, url  // Capture
        g.Go(func() error {
            body, err := fetch(ctx, url)
            if err != nil {
                return err
            }
            results[i] = body
            return nil
        })
    }

    if err := g.Wait(); err != nil {
        return nil, err  // Первая ошибка, остальные отменены через ctx
    }

    return results, nil
}
```

### errgroup с лимитом параллелизма

```go
func fetchAllLimited(ctx context.Context, urls []string, limit int) ([]string, error) {
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(limit)  // Максимум limit горутин одновременно

    results := make([]string, len(urls))

    for i, url := range urls {
        i, url := i, url
        g.Go(func() error {
            body, err := fetch(ctx, url)
            if err != nil {
                return err
            }
            results[i] = body
            return nil
        })
    }

    if err := g.Wait(); err != nil {
        return nil, err
    }
    return results, nil
}
```

### Retry with backoff

```go
func retry(ctx context.Context, maxAttempts int, fn func() error) error {
    var err error
    for attempt := 0; attempt < maxAttempts; attempt++ {
        err = fn()
        if err == nil {
            return nil
        }

        // Exponential backoff
        backoff := time.Duration(1<<attempt) * 100 * time.Millisecond
        if backoff > 10*time.Second {
            backoff = 10 * time.Second
        }

        select {
        case <-time.After(backoff):
            continue
        case <-ctx.Done():
            return ctx.Err()
        }
    }
    return fmt.Errorf("after %d attempts: %w", maxAttempts, err)
}

// Использование
err := retry(ctx, 5, func() error {
    return sendRequest()
})
```

### Circuit Breaker

```go
type CircuitBreaker struct {
    mu          sync.Mutex
    failures    int
    threshold   int
    state       string  // "closed", "open", "half-open"
    openUntil   time.Time
    cooldown    time.Duration
}

func (cb *CircuitBreaker) Execute(fn func() error) error {
    cb.mu.Lock()
    if cb.state == "open" {
        if time.Now().Before(cb.openUntil) {
            cb.mu.Unlock()
            return errors.New("circuit breaker is open")
        }
        cb.state = "half-open"
    }
    cb.mu.Unlock()

    err := fn()

    cb.mu.Lock()
    defer cb.mu.Unlock()

    if err != nil {
        cb.failures++
        if cb.failures >= cb.threshold {
            cb.state = "open"
            cb.openUntil = time.Now().Add(cb.cooldown)
        }
        return err
    }

    cb.failures = 0
    cb.state = "closed"
    return nil
}
```

## Rate Limiting

### Token Bucket

```go
import "golang.org/x/time/rate"

// Limiter: 10 requests/sec, burst 5
limiter := rate.NewLimiter(10, 5)

func handleRequest(ctx context.Context) error {
    // Блокирующее ожидание токена
    if err := limiter.Wait(ctx); err != nil {
        return err
    }
    // Обработка запроса
    return nil
}

// Non-blocking вариант
func tryHandle() bool {
    if !limiter.Allow() {
        return false  // Rate limited
    }
    // Обработка
    return true
}

// Зарезервировать на будущее
func reserveHandle() {
    r := limiter.Reserve()
    if !r.OK() {
        // Не хватает burst capacity
        return
    }
    time.Sleep(r.Delay())  // Подождать до своего времени
    // Обработка
}
```

### Per-client rate limiting

```go
type ClientLimiter struct {
    mu       sync.Mutex
    limiters map[string]*rate.Limiter
    limit    rate.Limit
    burst    int
}

func (cl *ClientLimiter) GetLimiter(clientID string) *rate.Limiter {
    cl.mu.Lock()
    defer cl.mu.Unlock()

    limiter, exists := cl.limiters[clientID]
    if !exists {
        limiter = rate.NewLimiter(cl.limit, cl.burst)
        cl.limiters[clientID] = limiter
    }
    return limiter
}

func (cl *ClientLimiter) Allow(clientID string) bool {
    return cl.GetLimiter(clientID).Allow()
}
```

## Cancellation Patterns

### Or-Channel: первый сигнал отменяет всех

```go
func or(channels ...<-chan struct{}) <-chan struct{} {
    switch len(channels) {
    case 0:
        return nil
    case 1:
        return channels[0]
    }

    orDone := make(chan struct{})
    go func() {
        defer close(orDone)

        switch len(channels) {
        case 2:
            select {
            case <-channels[0]:
            case <-channels[1]:
            }
        default:
            select {
            case <-channels[0]:
            case <-channels[1]:
            case <-channels[2]:
            case <-or(append(channels[3:], orDone)...):
            }
        }
    }()
    return orDone
}

// Использование
done := or(
    signalAfter(1*time.Second),
    signalAfter(2*time.Second),
    ctx.Done(),
)
<-done  // Закроется через 1 секунду
```

### Graceful Shutdown

```go
func main() {
    ctx, cancel := context.WithCancel(context.Background())

    // Ловим сигналы
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

    // Запускаем сервер
    server := &http.Server{Addr: ":8080"}
    go func() {
        if err := server.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()

    // Запускаем workers
    var wg sync.WaitGroup
    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            worker(ctx)
        }()
    }

    // Ждём сигнал
    <-sigCh
    log.Println("Shutting down...")

    // Фаза 1: остановить приём новых запросов
    shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer shutdownCancel()
    server.Shutdown(shutdownCtx)

    // Фаза 2: отменить workers
    cancel()

    // Фаза 3: дождаться завершения workers
    done := make(chan struct{})
    go func() {
        wg.Wait()
        close(done)
    }()

    select {
    case <-done:
        log.Println("Graceful shutdown complete")
    case <-time.After(10 * time.Second):
        log.Println("Forced shutdown")
    }
}
```

## Resource Management

### Semaphore

```go
import "golang.org/x/sync/semaphore"

// Ограничить до 100 concurrent операций
sem := semaphore.NewWeighted(100)

func doWork(ctx context.Context) error {
    if err := sem.Acquire(ctx, 1); err != nil {
        return err
    }
    defer sem.Release(1)

    // Работа
    return nil
}

// Для тяжёлых операций можно захватывать больше
func heavyWork(ctx context.Context) error {
    if err := sem.Acquire(ctx, 10); err != nil {
        return err
    }
    defer sem.Release(10)
    // ...
}
```

### Bounded Parallelism

```go
func processItems(ctx context.Context, items []Item, maxParallel int) error {
    sem := make(chan struct{}, maxParallel)
    errCh := make(chan error, 1)
    var wg sync.WaitGroup

    for _, item := range items {
        select {
        case sem <- struct{}{}:
        case <-ctx.Done():
            return ctx.Err()
        case err := <-errCh:
            return err
        }

        wg.Add(1)
        go func(item Item) {
            defer wg.Done()
            defer func() { <-sem }()

            if err := process(item); err != nil {
                select {
                case errCh <- err:
                default:
                }
            }
        }(item)
    }

    wg.Wait()

    select {
    case err := <-errCh:
        return err
    default:
        return nil
    }
}
```

### Worker Pool

```go
type Pool struct {
    jobs    chan Job
    results chan Result
    workers int
    wg      sync.WaitGroup
}

func NewPool(workers int) *Pool {
    p := &Pool{
        jobs:    make(chan Job, workers*2),
        results: make(chan Result, workers*2),
        workers: workers,
    }

    p.wg.Add(workers)
    for i := 0; i < workers; i++ {
        go p.worker()
    }

    return p
}

func (p *Pool) worker() {
    defer p.wg.Done()
    for job := range p.jobs {
        p.results <- process(job)
    }
}

func (p *Pool) Submit(job Job) {
    p.jobs <- job
}

func (p *Pool) Results() <-chan Result {
    return p.results
}

func (p *Pool) Shutdown() {
    close(p.jobs)
    p.wg.Wait()
    close(p.results)
}
```

## Pub/Sub

### Simple Broker

```go
type Broker struct {
    mu          sync.RWMutex
    subscribers map[string][]chan Event
}

func NewBroker() *Broker {
    return &Broker{
        subscribers: make(map[string][]chan Event),
    }
}

func (b *Broker) Subscribe(topic string) <-chan Event {
    b.mu.Lock()
    defer b.mu.Unlock()

    ch := make(chan Event, 10)
    b.subscribers[topic] = append(b.subscribers[topic], ch)
    return ch
}

func (b *Broker) Publish(topic string, event Event) {
    b.mu.RLock()
    defer b.mu.RUnlock()

    for _, ch := range b.subscribers[topic] {
        select {
        case ch <- event:
        default:
            // Drop если subscriber медленный
        }
    }
}

func (b *Broker) Unsubscribe(topic string, ch <-chan Event) {
    b.mu.Lock()
    defer b.mu.Unlock()

    subs := b.subscribers[topic]
    for i, sub := range subs {
        if sub == ch {
            b.subscribers[topic] = append(subs[:i], subs[i+1:]...)
            close(sub)
            break
        }
    }
}
```

## Best Practices Summary

### Do

```go
// ✅ Всегда используйте context для cancellation
func doWork(ctx context.Context) error

// ✅ Закрывайте channels только на стороне producer
func producer() <-chan T {
    ch := make(chan T)
    go func() {
        defer close(ch)
        // ...
    }()
    return ch
}

// ✅ Используйте select с default для non-blocking
select {
case msg := <-ch:
    handle(msg)
default:
    // Не блокируемся
}

// ✅ Используйте buffered channels для известного количества
results := make(chan Result, len(items))
```

### Don't

```go
// ❌ Не закрывайте channel на стороне receiver
func consumer(ch chan T) {
    close(ch)  // Плохо! Producer может паниковать
}

// ❌ Не используйте goroutine leak patterns
func leak() {
    ch := make(chan int)
    go func() {
        ch <- 1  // Заблокирован навсегда!
    }()
    // Нет receiver
}

// ❌ Не игнорируйте errors из goroutines
go func() {
    err := doSomething()
    // err потерян!
}()

// ❌ Не используйте shared state без синхронизации
var counter int
go func() { counter++ }()  // DATA RACE
go func() { counter++ }()
```
