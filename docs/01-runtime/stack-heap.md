# Stack vs Heap

Понимание различий между stack и heap allocation — фундамент для написания производительного кода на Go. В отличие от языков с ручным управлением памятью, Go автоматически решает, где разместить данные, но это решение напрямую влияет на производительность вашего приложения.

## TL;DR

| Характеристика | Stack | Heap |
|----------------|-------|------|
| Управление | Автоматическое (LIFO) | GC-managed |
| Скорость аллокации | ~1-2 ns | ~25-50 ns |
| Время жизни | Scope функции | До сборки GC |
| Фрагментация | Нет | Да |
| Cache locality | Отличная | Плохая |

## Память Go-процесса

```
┌─────────────────────────────────────────┐ Высокие адреса
│                                         │
│              Heap                       │  ← runtime.mheap
│         (растёт вверх ↑)                │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│           Свободно                      │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│    Goroutine Stacks                     │  ← каждая goroutine
│   (независимые, растут вниз ↓)          │     имеет свой стек
│                                         │
├─────────────────────────────────────────┤
│         Global Data                     │
├─────────────────────────────────────────┤
│         Text (code)                     │
└─────────────────────────────────────────┘ Низкие адреса
```

::: info Ключевое отличие от C/C++
В Go **каждая горутина** имеет собственный стек, а не один общий на процесс. Это позволяет создавать миллионы горутин без переполнения стека.
:::

## Goroutine Stack Internals

### Структура runtime.g

Каждая горутина представлена структурой `runtime.g`, которая содержит информацию о стеке:

```go
// runtime/runtime2.go (упрощённо)
type g struct {
    stack       stack   // описание стека
    stackguard0 uintptr // для проверки переполнения
    stackguard1 uintptr // для C stack (cgo)
    // ... другие поля
}

type stack struct {
    lo uintptr // нижняя граница стека
    hi uintptr // верхняя граница стека
}
```

### Размеры стека

| Параметр | Go 1.4+ | Go 1.25 |
|----------|---------|---------|
| Начальный размер | 2KB | 2KB |
| Минимальный | 2KB | 2KB |
| Максимальный (64-bit) | 1GB | 1GB |
| Шаг роста | x2 | x2 |

<StackLayoutDiagram />

## Stack Growth Mechanism

Go использует **contiguous stacks** (непрерывные стеки) начиная с версии 1.3. Когда стек переполняется, runtime выделяет новый стек большего размера и копирует все данные.

### Пролог функции

Каждая функция (кроме `//go:nosplit`) содержит проверку стека в прологе:

```asm
TEXT ·myFunc(SB), $0
    MOVQ  (TLS), CX          // получить g
    CMPQ  SP, 16(CX)         // сравнить SP с stackguard0
    JLS   runtime·morestack  // если SP < stackguard0 → рост
    // ... тело функции
```

### Алгоритм роста

1. **Проверка**: SP < stackguard0?
2. **Вызов** `runtime.morestack` → `runtime.newstack`
3. **Аллокация** нового стека (обычно x2)
4. **Копирование** всех данных
5. **Корректировка** всех указателей на стек
6. **Возврат** и продолжение выполнения

::: warning Pointer Adjustment
При копировании стека Go корректирует **все указатели**, которые указывают внутрь старого стека. Это возможно благодаря точной информации о типах, которую компилятор генерирует для GC.
:::

<StackGrowthSimulator />

## Escape Analysis

Escape analysis — статический анализ компилятора, определяющий, может ли переменная "убежать" из scope функции. Если да — аллокация на heap, если нет — на stack.

### Запуск анализа

```bash
# Базовый вывод
go build -gcflags='-m' main.go

# Детальный вывод (рекомендуется)
go build -gcflags='-m -m' main.go

# Максимально детальный
go build -gcflags='-m -m -m' main.go
```

### Правила Escape

<EscapeAnalysisPlayground />

### Когда происходит escape

1. **Возврат указателя** на локальную переменную
2. **Присвоение в interface{}** — требует boxing
3. **Closure capturing** — closure может пережить функцию
4. **Слишком большие объекты** (>64KB) — не помещаются на стек
5. **Рекурсивные/динамические типы** — размер неизвестен на этапе компиляции
6. **Отправка указателя в channel** — данные должны пережить горутину

## Директивы компилятора

### //go:noescape

Указывает компилятору, что аргументы функции не "убегают". Используется для оптимизации при работе с unsafe или assembly:

```go
//go:noescape
func fastHash(data []byte) uint64
```

::: danger Use-After-Free
Неправильное использование `//go:noescape` приводит к **use-after-free** — одному из самых опасных классов багов:

```go
//go:noescape
func storePointer(p *int) // ложь: на самом деле сохраняет p в глобальную переменную

func broken() {
    x := 42              // компилятор думает: x не убегает → stack
    storePointer(&x)     // но указатель сохранён!
}                        // x уничтожен, stack frame освобождён

func later() {
    useStoredPointer()   // читаем мусор или данные другой функции
}
```

**Последствия:**
- **Чтение мусора** — переменная перезаписана другим вызовом
- **Silent data corruption** — запись по невалидному адресу портит чужие данные
- **Security vulnerability** — атакующий может контролировать содержимое стека
- **Невоспроизводимые баги** — зависят от тайминга, размера стека, оптимизаций

Go гарантирует memory safety — `//go:noescape` эту гарантию снимает.
:::

### //go:nosplit

Запрещает проверку стека в прологе функции:

```go
//go:nosplit
func tinyFunc() int {
    return 42
}
```

**Ограничения:**
- Функция не должна использовать больше 128 bytes стека
- Не может вызывать функции без `nosplit`
- Используется в runtime для низкоуровневых операций

### //go:noinline

Запрещает инлайнинг функции:

```go
//go:noinline
func mustNotInline() {
    // ...
}
```

Полезно для бенчмарков и отладки escape analysis.

## Практические паттерны

### sync.Pool для переиспользования

`sync.Pool` — кэш временных объектов, который снижает нагрузку на GC за счёт переиспользования аллокаций.

```go
var bufferPool = sync.Pool{
    New: func() any {
        return make([]byte, 4096)
    },
}

func process(data []byte) {
    buf := bufferPool.Get().([]byte)
    defer bufferPool.Put(buf)

    // используем buf
    copy(buf, data)
}
```

**Как работает внутри:**

```
┌─────────────────────────────────────────────────────────┐
│                      sync.Pool                          │
├─────────────────────────────────────────────────────────┤
│  P0: [local pool] ←── Get()/Put() без блокировок        │
│  P1: [local pool]     (per-P storage)                   │
│  P2: [local pool]                                       │
│  ...                                                    │
├─────────────────────────────────────────────────────────┤
│  victim cache ←── объекты предыдущего GC цикла          │
└─────────────────────────────────────────────────────────┘
```

- Каждый P имеет **локальный пул** — `Get()`/`Put()` без блокировок
- При пустом локальном пуле — steal из других P или вызов `New()`
- **GC очищает пул** каждые 2 цикла (victim cache даёт второй шанс)

**Когда использовать:**

```go
// Хорошо: частые аллокации одинаковых объектов
var jsonPool = sync.Pool{
    New: func() any { return new(bytes.Buffer) },
}

// Хорошо: дорогие объекты (regexp, gzip writers)
var gzipPool = sync.Pool{
    New: func() any {
        w, _ := gzip.NewWriterLevel(nil, gzip.BestSpeed)
        return w
    },
}
```

**Критические ошибки:**

```go
// ОШИБКА 1: забыли очистить состояние
func bad() {
    buf := bufferPool.Get().(*bytes.Buffer)
    defer bufferPool.Put(buf)
    buf.WriteString("secret")  // данные остаются!
}

// ПРАВИЛЬНО: всегда Reset()
func good() {
    buf := bufferPool.Get().(*bytes.Buffer)
    defer bufferPool.Put(buf)
    buf.Reset()  // очищаем перед использованием
    buf.WriteString("data")
}

// ОШИБКА 2: хранение указателей на pooled объекты
func broken() *bytes.Buffer {
    buf := bufferPool.Get().(*bytes.Buffer)
    return buf  // утечка! объект не вернётся в пул
}

// ОШИБКА 3: Pool для мелких объектов
var intPool = sync.Pool{New: func() any { return new(int) }}
// Бессмысленно: overhead пула > стоимость аллокации
```

::: warning Когда НЕ использовать
- **Мелкие объекты** (<1KB) — overhead пула превышает выгоду
- **Редкие аллокации** — пул будет пустым после GC
- **Объекты с состоянием** — если сложно гарантировать Reset()
- **Долгоживущие объекты** — пул для временных данных
:::

**Бенчмарк эффекта:**

```go
// Без пула: ~50 ns/op, 4096 B/op, 1 allocs/op
func BenchmarkNoPool(b *testing.B) {
    for i := 0; i < b.N; i++ {
        buf := make([]byte, 4096)
        _ = buf
    }
}

// С пулом: ~15 ns/op, 0 B/op, 0 allocs/op
func BenchmarkWithPool(b *testing.B) {
    for i := 0; i < b.N; i++ {
        buf := bufferPool.Get().([]byte)
        bufferPool.Put(buf)
    }
}
```

### Избегание escape через API design

```go
// Плохо: result escapes
func BadAPI() *Result {
    r := Result{} // escapes to heap
    return &r
}

// Хорошо: caller контролирует аллокацию
func GoodAPI(r *Result) {
    r.Value = 42
}

// Использование
var r Result  // stack allocated
GoodAPI(&r)
```

### Preallocated slices

```go
// Плохо: множественные аллокации при росте
func bad() []int {
    var s []int
    for i := 0; i < 1000; i++ {
        s = append(s, i)
    }
    return s
}

// Хорошо: одна аллокация
func good() []int {
    s := make([]int, 0, 1000)
    for i := 0; i < 1000; i++ {
        s = append(s, i)
    }
    return s
}
```

### Arrays vs Slices для small data

```go
// Slice header + backing array на heap
func withSlice() {
    data := make([]byte, 64) // может escape
    process(data)
}

// Array на stack (если не escapes)
func withArray() {
    var data [64]byte // stack allocated
    process(data[:])
}
```

## Debug и профилирование

### Escape analysis output

```bash
# Файл main.go
go build -gcflags='-m -m' main.go 2>&1 | grep -E "(escapes|does not escape)"
```

### Аллокации в pprof

```bash
# Собираем профиль
go test -bench=. -benchmem -memprofile=mem.out

# Анализируем
go tool pprof mem.out

# Команды в pprof:
# top10 -cum        # топ по cumulative allocations
# list funcName     # показать аллокации в функции
# web               # граф в браузере
```

### alloc_space vs alloc_objects

| Metric | Что показывает | Когда использовать |
|--------|----------------|-------------------|
| `alloc_space` | Объём выделенной памяти | Проблемы с memory pressure |
| `alloc_objects` | Количество аллокаций | Проблемы с latency (GC) |

### GODEBUG

```bash
# Трассировка всех аллокаций (очень медленно!)
GODEBUG=allocfreetrace=1 ./myapp

# Статистика GC
GODEBUG=gctrace=1 ./myapp

# Информация о стеках
GODEBUG=efence=1,invalidptr=1 ./myapp
```

## Выводы

1. **Stack — дешевле heap** примерно в 10-50 раз
2. **Escape analysis работает на этапе компиляции** — используйте `-gcflags='-m'` для анализа
3. **Возврат указателей** — главная причина escape
4. **sync.Pool** — переиспользуйте объекты для горячих путей
5. **Профилируйте реальную нагрузку** — premature optimization is the root of all evil

::: tip Правило большого пальца
Если вы не измеряли — вы не оптимизируете. Сначала `pprof`, потом изменения.
:::
