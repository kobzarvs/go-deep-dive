# Channels Internals

Каналы — центральный механизм коммуникации в Go. Под капотом это сложная структура данных с lock-free оптимизациями и глубокой интеграцией с scheduler.

## runtime.hchan структура

```go
// runtime/chan.go
type hchan struct {
    qcount   uint           // количество элементов в буфере
    dataqsiz uint           // размер буфера (capacity)
    buf      unsafe.Pointer // указатель на ring buffer
    elemsize uint16         // размер элемента
    closed   uint32         // 1 если канал закрыт
    elemtype *_type         // тип элемента (для GC)
    sendx    uint           // индекс следующего send
    recvx    uint           // индекс следующего receive
    recvq    waitq          // очередь ожидающих получателей
    sendq    waitq          // очередь ожидающих отправителей
    lock     mutex          // защищает все поля
}

// waitq — двусвязный список ожидающих горутин
type waitq struct {
    first *sudog
    last  *sudog
}
```

### Размер hchan

```go
// sizeof(hchan) = 96 bytes на 64-bit системе
// Breakdown:
// - qcount:    8 bytes (uint)
// - dataqsiz:  8 bytes (uint)
// - buf:       8 bytes (pointer)
// - elemsize:  2 bytes (uint16)
// - closed:    4 bytes (uint32)
// - elemtype:  8 bytes (pointer)
// - sendx:     8 bytes (uint)
// - recvx:     8 bytes (uint)
// - recvq:    16 bytes (2 pointers)
// - sendq:    16 bytes (2 pointers)
// - lock:      8 bytes (mutex)
// + padding
```

### sudog: Waiting Goroutine

```go
// runtime/runtime2.go
type sudog struct {
    g *g                 // горутина

    next     *sudog      // linked list в waitq
    prev     *sudog
    elem     unsafe.Pointer // данные для send/receive

    acquiretime int64    // для блокирующего профилирования
    releasetime int64
    ticket      uint32   // для semaRoot
    isSelect    bool     // участвует в select
    success     bool     // операция успешна

    parent   *sudog      // для semaRoot tree
    waitlink *sudog      // для semaRoot или select
    waittail *sudog
    c        *hchan      // канал
}
```

## Ring Buffer для Buffered Channels

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Buffered Channel (cap=5)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  hchan                                                                      │
│  ┌────────────────┐                                                         │
│  │ qcount:   3    │  ← 3 элемента в буфере                                  │
│  │ dataqsiz: 5    │  ← capacity = 5                                         │
│  │ sendx:    3    │  ← следующий send сюда                                  │
│  │ recvx:    0    │  ← следующий recv отсюда                                │
│  │ buf: ──────────┼──────┐                                                  │
│  │ ...            │      │                                                  │
│  └────────────────┘      ▼                                                  │
│                     Ring Buffer                                             │
│                   ┌───┬───┬───┬───┬───┐                                     │
│        index:     │ 0 │ 1 │ 2 │ 3 │ 4 │                                     │
│                   ├───┼───┼───┼───┼───┤                                     │
│        data:      │ A │ B │ C │   │   │                                     │
│                   └───┴───┴───┴───┴───┘                                     │
│                     ▲           ▲                                           │
│                  recvx=0     sendx=3                                        │
│                                                                             │
│  После receive:                                                             │
│                   ┌───┬───┬───┬───┬───┐                                     │
│        data:      │   │ B │ C │   │   │  qcount=2, recvx=1                  │
│                   └───┴───┴───┴───┴───┘                                     │
│                       ▲       ▲                                             │
│                    recvx=1  sendx=3                                         │
│                                                                             │
│  После send("D"):                                                           │
│                   ┌───┬───┬───┬───┬───┐                                     │
│        data:      │   │ B │ C │ D │   │  qcount=3, sendx=4                  │
│                   └───┴───┴───┴───┴───┘                                     │
│                       ▲           ▲                                         │
│                    recvx=1     sendx=4                                      │
│                                                                             │
│  Wrap around (sendx после slot 4 → slot 0):                                 │
│                   ┌───┬───┬───┬───┬───┐                                     │
│        data:      │ F │ B │ C │ D │ E │  qcount=5 (full)                    │
│                   └───┴───┴───┴───┴───┘                                     │
│                   ▲   ▲                                                     │
│               sendx=1 recvx=1  (sendx догнал recvx → full)                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

<InteractiveModal title="Channel Internals" icon="📨" description="Визуализация внутренней структуры hchan и ring buffer">
  <ChannelInternalsViz />
</InteractiveModal>

## makechan: Создание канала

```go
// runtime/chan.go (упрощённо)
func makechan(t *chantype, size int) *hchan {
    elem := t.elem

    // Проверка размера элемента
    if elem.size >= 1<<16 {
        throw("makechan: invalid channel element type")
    }

    // Вычислить размер буфера
    mem, overflow := math.MulUintptr(elem.size, uintptr(size))
    if overflow || mem > maxAlloc-hchanSize {
        panic("makechan: size out of range")
    }

    var c *hchan
    switch {
    case mem == 0:
        // Unbuffered или элемент размера 0
        c = (*hchan)(mallocgc(hchanSize, nil, true))
        c.buf = c.raceaddr()

    case elem.ptrdata == 0:
        // Элемент не содержит указателей
        // Аллоцируем hchan и buffer одним куском
        c = (*hchan)(mallocgc(hchanSize+mem, nil, true))
        c.buf = add(unsafe.Pointer(c), hchanSize)

    default:
        // Элемент содержит указатели
        // Отдельная аллокация для buffer (для GC)
        c = new(hchan)
        c.buf = mallocgc(mem, elem, true)
    }

    c.elemsize = uint16(elem.size)
    c.elemtype = elem
    c.dataqsiz = uint(size)

    return c
}
```

### Три стратегии аллокации

| Случай | Аллокация | Причина |
|--------|-----------|---------|
| Unbuffered / zero-size | hchan only | Нет буфера |
| No pointers | hchan + buf вместе | Один malloc, GC проще |
| Has pointers | hchan отдельно от buf | GC должен сканировать buf |

## chansend: Отправка в канал

```go
// Упрощённый псевдокод runtime/chan.go
func chansend(c *hchan, ep unsafe.Pointer, block bool) bool {
    // 1. nil channel
    if c == nil {
        if !block {
            return false
        }
        gopark(nil, nil, waitReasonChanSendNilChan) // Навсегда
        throw("unreachable")
    }

    // 2. Fast path: non-blocking send на закрытый или full канал
    if !block && c.closed == 0 && full(c) {
        return false
    }

    lock(&c.lock)

    // 3. Закрытый канал
    if c.closed != 0 {
        unlock(&c.lock)
        panic("send on closed channel")
    }

    // 4. Direct send: есть ожидающий receiver
    if sg := c.recvq.dequeue(); sg != nil {
        send(c, sg, ep, func() { unlock(&c.lock) })
        return true
    }

    // 5. Buffered: есть место в буфере
    if c.qcount < c.dataqsiz {
        qp := chanbuf(c, c.sendx)
        typedmemmove(c.elemtype, qp, ep)
        c.sendx++
        if c.sendx == c.dataqsiz {
            c.sendx = 0  // Wrap around
        }
        c.qcount++
        unlock(&c.lock)
        return true
    }

    // 6. Block: нет места, блокируемся
    if !block {
        unlock(&c.lock)
        return false
    }

    // Создаём sudog и ставим в sendq
    gp := getg()
    mysg := acquireSudog()
    mysg.elem = ep
    mysg.g = gp
    mysg.c = c
    c.sendq.enqueue(mysg)

    gopark(chanparkcommit, unsafe.Pointer(&c.lock),
           waitReasonChanSend)

    // Проснулись
    releaseSudog(mysg)
    return mysg.success
}
```

### Direct Send оптимизация

Когда есть ожидающий receiver, данные копируются **напрямую** в его стек:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Direct Send                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Sender G1                        Receiver G2                               │
│  ┌─────────────┐                  ┌─────────────┐                           │
│  │ send(value) │                  │ val := <-ch │ ← blocked                 │
│  │             │                  │ (sudog.elem │                           │
│  │ value: 42   │                  │  points to  │                           │
│  └──────┬──────┘                  │  val's addr)│                           │
│         │                         └──────▲──────┘                           │
│         │                                │                                  │
│         │  typedmemmove(42 → &val)       │                                  │
│         └────────────────────────────────┘                                  │
│                                                                             │
│  Без промежуточного копирования в буфер!                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

```go
// runtime/chan.go
func send(c *hchan, sg *sudog, ep unsafe.Pointer, unlockf func()) {
    if sg.elem != nil {
        // Копируем данные напрямую в sudog.elem receiver'а
        sendDirect(c.elemtype, sg, ep)
        sg.elem = nil
    }
    gp := sg.g
    unlockf()
    gp.param = unsafe.Pointer(sg)
    sg.success = true
    goready(gp, 4)  // Wake up receiver
}

func sendDirect(t *_type, sg *sudog, src unsafe.Pointer) {
    // src - данные отправителя
    // sg.elem - адрес переменной получателя
    dst := sg.elem
    typeBitsBulkBarrier(t, uintptr(dst), uintptr(src), t.size)
    memmove(dst, src, t.size)
}
```

## chanrecv: Получение из канала

```go
// Упрощённый псевдокод
func chanrecv(c *hchan, ep unsafe.Pointer, block bool) (selected, received bool) {
    // 1. nil channel
    if c == nil {
        if !block {
            return false, false
        }
        gopark(nil, nil, waitReasonChanReceiveNilChan)
        throw("unreachable")
    }

    // 2. Fast path: non-blocking на пустой открытый канал
    if !block && empty(c) {
        if atomic.Load(&c.closed) == 0 {
            return false, false
        }
        // Канал закрыт и пуст
        if ep != nil {
            typedmemclr(c.elemtype, ep)
        }
        return true, false
    }

    lock(&c.lock)

    // 3. Закрытый и пустой канал
    if c.closed != 0 && c.qcount == 0 {
        unlock(&c.lock)
        if ep != nil {
            typedmemclr(c.elemtype, ep)  // Zero value
        }
        return true, false  // received = false
    }

    // 4. Direct receive от ожидающего sender
    if sg := c.sendq.dequeue(); sg != nil {
        recv(c, sg, ep, func() { unlock(&c.lock) })
        return true, true
    }

    // 5. Есть данные в буфере
    if c.qcount > 0 {
        qp := chanbuf(c, c.recvx)
        if ep != nil {
            typedmemmove(c.elemtype, ep, qp)
        }
        typedmemclr(c.elemtype, qp)  // Очистить для GC
        c.recvx++
        if c.recvx == c.dataqsiz {
            c.recvx = 0
        }
        c.qcount--
        unlock(&c.lock)
        return true, true
    }

    // 6. Block
    if !block {
        unlock(&c.lock)
        return false, false
    }

    // Создаём sudog
    gp := getg()
    mysg := acquireSudog()
    mysg.elem = ep
    mysg.g = gp
    mysg.c = c
    c.recvq.enqueue(mysg)

    gopark(chanparkcommit, unsafe.Pointer(&c.lock),
           waitReasonChanReceive)

    releaseSudog(mysg)
    return true, mysg.success
}
```

### recv: Direct receive + Buffer shift

```go
func recv(c *hchan, sg *sudog, ep unsafe.Pointer, unlockf func()) {
    if c.dataqsiz == 0 {
        // Unbuffered: копируем напрямую от sender
        if ep != nil {
            recvDirect(c.elemtype, sg, ep)
        }
    } else {
        // Buffered: берём из буфера, sender пишет в освободившееся место
        qp := chanbuf(c, c.recvx)
        if ep != nil {
            typedmemmove(c.elemtype, ep, qp)
        }
        // Копируем данные sender'а в буфер
        typedmemmove(c.elemtype, qp, sg.elem)
        c.recvx++
        if c.recvx == c.dataqsiz {
            c.recvx = 0
        }
        c.sendx = c.recvx  // sendx = recvx для полного буфера
    }
    sg.elem = nil
    gp := sg.g
    unlockf()
    gp.param = unsafe.Pointer(sg)
    sg.success = true
    goready(gp, 4)
}
```

## closechan: Закрытие канала

```go
func closechan(c *hchan) {
    if c == nil {
        panic("close of nil channel")
    }

    lock(&c.lock)

    if c.closed != 0 {
        unlock(&c.lock)
        panic("close of closed channel")
    }

    c.closed = 1

    var glist gList

    // Освободить всех ожидающих receivers
    for {
        sg := c.recvq.dequeue()
        if sg == nil {
            break
        }
        if sg.elem != nil {
            typedmemclr(c.elemtype, sg.elem)  // Zero value
        }
        sg.success = false  // received = false
        glist.push(sg.g)
    }

    // Освободить всех ожидающих senders
    for {
        sg := c.sendq.dequeue()
        if sg == nil {
            break
        }
        sg.success = false
        glist.push(sg.g)
    }

    unlock(&c.lock)

    // Wake up все горутины
    for !glist.empty() {
        gp := glist.pop()
        gp.schedlink = 0
        goready(gp, 3)  // Senders получат panic
    }
}
```

### Семантика закрытия

| Операция | Открытый | Закрытый |
|----------|----------|----------|
| `ch <- v` | OK / block | **panic** |
| `<-ch` (есть данные) | OK | OK |
| `<-ch` (пустой) | block | zero value, `ok=false` |
| `close(ch)` | OK | **panic** |

## Select Internals

### scase структура

```go
// runtime/select.go
type scase struct {
    c    *hchan         // канал
    elem unsafe.Pointer // данные для send/receive
}

// Порядок случаев в select важен для runtime
// cases[0..nsends-1]   = send cases
// cases[nsends..n-1]   = receive cases
```

### selectgo алгоритм

```go
func selectgo(cas0 *scase, order0 *uint16, pc0 *uintptr,
              nsends, nrecvs int, block bool) (int, bool) {

    ncases := nsends + nrecvs
    scases := cas0          // Массив scase структур
    pollorder := order0     // Случайный порядок проверки (для fairness)
    lockorder := order1     // Порядок блокировки каналов (для deadlock prevention)

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Shuffle — создать случайный порядок опроса
    // ═══════════════════════════════════════════════════════════════════════
    // Почему случайный порядок?
    // - Без него первый case в select всегда проверялся бы первым
    // - Это приводило бы к starvation остальных cases
    // - Fisher-Yates shuffle даёт равномерное распределение
    for i := 1; i < ncases; i++ {
        j := fastrandn(uint32(i + 1))  // [0, i]
        pollorder[i] = pollorder[j]
        pollorder[j] = uint16(i)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Lock ordering — отсортировать каналы по адресу
    // ═══════════════════════════════════════════════════════════════════════
    // Почему сортировать по адресу?
    // - Избежать deadlock при блокировке нескольких каналов
    // - Все горутины блокируют каналы в одинаковом порядке
    // - Классическое решение: lock ordering
    for i := 0; i < ncases; i++ {
        j := i
        c := scases[i].c
        for j > 0 && uintptr(unsafe.Pointer(scases[lockorder[j-1]].c)) >
                     uintptr(unsafe.Pointer(c)) {
            lockorder[j] = lockorder[j-1]
            j--
        }
        lockorder[j] = uint16(i)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: Lock — заблокировать все каналы в правильном порядке
    // ═══════════════════════════════════════════════════════════════════════
    sellock(scases, lockorder)  // lock(&c.lock) для каждого канала

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: Poll — проверить готовность без блокировки
    // ═══════════════════════════════════════════════════════════════════════
    // Проверяем в случайном порядке (pollorder), НЕ в lockorder!
    for _, casei := range pollorder {
        cas := &scases[casei]
        c := cas.c

        if casei >= nsends {
            // ─────────────────────────────────────────────────────────────
            // Receive case: <-ch или v := <-ch или v, ok := <-ch
            // ─────────────────────────────────────────────────────────────
            if sg := c.sendq.first; sg != nil {
                // Есть заблокированный sender → direct receive
                goto recv
            }
            if c.qcount > 0 {
                // Есть данные в буфере → buffer receive
                goto bufrecv
            }
            if c.closed != 0 {
                // Канал закрыт → receive zero value
                goto rclose
            }
        } else {
            // ─────────────────────────────────────────────────────────────
            // Send case: ch <- v
            // ─────────────────────────────────────────────────────────────
            if c.closed != 0 {
                // Канал закрыт → PANIC!
                goto sclose
            }
            if sg := c.recvq.first; sg != nil {
                // Есть заблокированный receiver → direct send
                goto send
            }
            if c.qcount < c.dataqsiz {
                // Есть место в буфере → buffer send
                goto bufsend
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5: Non-blocking check
    // ═══════════════════════════════════════════════════════════════════════
    if !block {
        // select с default, но ничего не готово
        selunlock(scases, lockorder)
        return -1, false  // Вернуть -1, выполнить default
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 6: Enqueue — встать в очередь на ВСЕ каналы
    // ═══════════════════════════════════════════════════════════════════════
    // Критически важно: одна горутина в очередях ВСЕХ каналов!
    // Первый готовый канал разбудит горутину
    gp := getg()
    for _, casei := range lockorder {
        cas := &scases[casei]
        c := cas.c

        // Создать sudog для этого канала
        sg := acquireSudog()
        sg.g = gp
        sg.isSelect = true   // Помечаем как select — особая обработка!
        sg.c = c
        sg.elem = cas.elem

        // Встать в соответствующую очередь
        if casei < nsends {
            c.sendq.enqueue(sg)  // Для send cases → sendq
        } else {
            c.recvq.enqueue(sg)  // Для receive cases → recvq
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 7: Park — уснуть пока не разбудят
    // ═══════════════════════════════════════════════════════════════════════
    // selparkcommit: финализация перед засыпанием (unlock всех каналов)
    gopark(selparkcommit, nil, waitReasonSelect)

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 8: Wakeup — проснулись, найти сработавший case
    // ═══════════════════════════════════════════════════════════════════════
    // - Найти какой sudog сработал (sg.success == true)
    // - Удалить себя из очередей ВСЕХ остальных каналов
    // - Освободить sudog обратно в pool

    selunlock(scases, lockorder)
    return casi, recvOK

    // ═══════════════════════════════════════════════════════════════════════
    // LABELS: обработка разных случаев
    // ═══════════════════════════════════════════════════════════════════════
bufrecv:
    // Получить из буфера канала
    // typedmemmove(c.elemtype, cas.elem, qp)
    // c.recvx++; c.qcount--
    // ...

recv:
    // Direct receive от заблокированного sender
    // recv(c, sg, cas.elem, ...)
    // ...

rclose:
    // Канал закрыт — вернуть zero value
    // typedmemclr(c.elemtype, cas.elem)
    // ...

bufsend:
    // Записать в буфер канала
    // typedmemmove(c.elemtype, qp, cas.elem)
    // c.sendx++; c.qcount++
    // ...

send:
    // Direct send к заблокированному receiver
    // send(c, sg, cas.elem, ...)
    // ...

sclose:
    // Send на закрытый канал — PANIC
    selunlock(scases, lockorder)
    panic("send on closed channel")
}
```

<InteractiveModal title="Select Statement Simulator" icon="🎯" description="Симуляция работы select с несколькими каналами">
  <SelectSimulator />
</InteractiveModal>

### Lock ordering для предотвращения deadlock

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Select Lock Ordering                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Проблема: G1 делает select{ch1, ch2}, G2 делает select{ch2, ch1}           │
│                                                                             │
│  G1: lock(ch1) → lock(ch2)                                                  │
│  G2: lock(ch2) → lock(ch1)  ← Deadlock!                                     │
│                                                                             │
│  Решение: сортировать каналы по адресу перед блокировкой                    │
│                                                                             │
│  G1: lock(ch1) → lock(ch2)  (если &ch1 < &ch2)                              │
│  G2: lock(ch1) → lock(ch2)  (тот же порядок!)                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Compiler оптимизации для Select

### Single case → direct operation

```go
// Компилятор преобразует:
select {
case v := <-ch:
    use(v)
}

// В:
v := <-ch
use(v)
```

### Two cases с default → non-blocking

```go
// Компилятор преобразует:
select {
case v := <-ch:
    use(v)
default:
    doSomethingElse()
}

// В:
v, ok := chanrecv(ch, false)  // non-blocking
if ok {
    use(v)
} else {
    doSomethingElse()
}
```

### Select на nil channels

```go
// nil channel в select — как будто этого case нет
var ch chan int  // nil
select {
case <-ch:       // Этот case никогда не выберется
case <-time.After(time.Second):
    // Этот выберется через секунду
}
```

## Производительность

### Benchmark: Channel vs Mutex

```go
// BenchmarkChannelSend-8     20000000    89.5 ns/op
// BenchmarkMutexLock-8       50000000    25.4 ns/op

// Channel дороже из-за:
// 1. Аллокация sudog (если блокируется)
// 2. gopark/goready overhead
// 3. Lock contention на hchan.lock

// Когда channel оправдан:
// - Передача ownership
// - Pipeline pattern
// - Multiple producers/consumers
// - Timeout/cancellation
```

### Оптимизации

```go
// 1. Buffered channels снижают contention
ch := make(chan Job, 100)  // Меньше блокировок

// 2. Batch operations
func sendBatch(ch chan<- int, items []int) {
    for _, item := range items {
        ch <- item
    }
}

// 3. Избегать select с множеством cases
// Каждый case = отдельная проверка
select {
case <-ch1:
case <-ch2:
// ... 10 cases → 10 проверок в poll loop
}
```

### Альтернативы каналам

| Use Case | Channel | Альтернатива |
|----------|---------|--------------|
| Single value | `chan T` | `sync.WaitGroup` + shared var |
| Counter | — | `atomic.Int64` |
| Cache | — | `sync.Map` |
| Connection pool | — | Dedicated pool struct |
| RWLock pattern | — | `sync.RWMutex` |

## Edge Cases и Gotchas

### Send на closed channel = panic

```go
ch := make(chan int)
close(ch)
ch <- 1  // panic: send on closed channel
```

### Receive от closed channel = zero value

```go
ch := make(chan int)
close(ch)
v, ok := <-ch  // v=0, ok=false
v = <-ch       // v=0 (без ok — не узнаешь что закрыт)
```

### Range по closed channel

```go
ch := make(chan int, 3)
ch <- 1
ch <- 2
ch <- 3
close(ch)

for v := range ch {
    fmt.Println(v)  // 1, 2, 3 — потом выход
}
```

### Double close = panic

```go
ch := make(chan int)
close(ch)
close(ch)  // panic: close of closed channel
```

### Nil channel operations

```go
var ch chan int  // nil

// Send на nil — block forever
go func() { ch <- 1 }()  // Горутина заблокирована навсегда

// Receive от nil — block forever
go func() { <-ch }()  // Горутина заблокирована навсегда

// Close nil — panic
close(ch)  // panic: close of nil channel
```

## Debugging Channels

### pprof goroutine dump

```
goroutine 42 [chan receive]:
main.worker(0xc000018180)
    /app/main.go:25 +0x45
created by main.main
    /app/main.go:15 +0x9f
```

### runtime/trace

```bash
go test -trace trace.out
go tool trace trace.out
# → Synchronization blocking profile
# → Показывает время ожидания на каналах
```

### GODEBUG=schedtrace

```bash
GODEBUG=schedtrace=1000,scheddetail=1 ./app
# Показывает goroutines в состоянии waiting (chan receive/send)
```
