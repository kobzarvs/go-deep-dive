# Type Assertions

Type assertion — механизм проверки и извлечения конкретного типа из интерфейса. В этой статье разберём runtime механику, type switch internals и паттерны использования.

## TL;DR

| Операция | Синтаксис | При ошибке |
|----------|-----------|------------|
| Assertion с panic | `v.(T)` | panic |
| Comma-ok assertion | `v, ok := x.(T)` | ok = false, v = zero |
| Type switch | `switch v := x.(type)` | default case |

| Сценарий | Runtime функция | Сложность |
|----------|-----------------|-----------|
| Interface → Concrete | `assertE2T` / `assertI2T` | O(1) |
| Interface → Interface | `assertE2I` / `assertI2I` | O(1) в среднем при кеше, O(n) в худшем случае |
| Type switch | Linear (<=4) или hash+binary (много cases) | O(n) / O(log n) |

Важно: type assertion и type switch применимы только к значениям интерфейсного типа; к type parameters они не применяются.

## Синтаксис Type Assertion

### Panic форма

```go
var r io.Reader = os.Stdin

f := r.(*os.File)  // ok: r содержит *os.File
fmt.Println(f.Name())

b := r.(*bytes.Buffer)  // panic: interface conversion
```

Что проверяется:
- `T` — конкретный тип → dynamic type **идентичен** `T`
- `T` — интерфейс → dynamic type **реализует** `T`

```go
var r io.Reader = os.Stdin
_ = r.(io.Reader) // всегда ok
_ = r.(io.Writer) // ok только если dynamic type реализует Writer
```

**Когда использовать:**
- Вы уверены в типе (логическая гарантия)
- Ошибка типа — баг в программе, не ожидаемый сценарий

### Comma-ok форма

```go
var r io.Reader = os.Stdin

if f, ok := r.(*os.File); ok {
    fmt.Println("Reading from file:", f.Name())
} else {
    fmt.Println("Not a file")
}
```

Форма `v, ok := x.(T)` возвращает **zero value** для `T` при неудаче:

```go
var x any = 123
v, ok := x.(string)
fmt.Println(v, ok) // "" false
```

Если zero value допустим, всегда проверяйте `ok`.

**Когда использовать:**
- Тип может варьироваться в runtime
- Разные ветки логики для разных типов
- Обработка ошибок вместо panic

### Type Switch

```go
func describe(x any) {
    switch v := x.(type) {
    case nil:
        fmt.Println("x is nil")
    case int:
        fmt.Printf("int: %d\n", v)  // v имеет тип int
    case string:
        fmt.Printf("string: %q\n", v)  // v имеет тип string
    case io.Reader:
        fmt.Println("io.Reader")  // v имеет тип io.Reader
    default:
        fmt.Printf("unknown: %T\n", v)  // v имеет тип any
    }
}
```

Про `case nil`: срабатывает **только** для `nil` интерфейса; typed nil попадёт в `case *MyError`.

## Runtime механизм

### assertE2T — empty interface to concrete type

Проверка `x.(T)` где x — `any/interface{}`:

```go
// runtime/iface.go
func assertE2T(t *_type, e eface, r unsafe.Pointer) {
    if e._type != t {
        // Типы не совпадают
        panic(&TypeAssertionError{
            _interface:    nil,
            concrete:      e._type,
            asserted:      t,
        })
    }
    // Копируем значение
    typedmemmove(t, r, e.data)
}
```

`assertE2T` для `any`: сравнить `_type`, затем копировать значение.

```
assertE2T Flow
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  var x any = "hello"                                        │
│  s := x.(string)                                            │
│                                                             │
│  ┌─────────────┐        ┌─────────────┐                     │
│  │    eface    │        │ target type │                     │
│  │ _type ──────┼────?───│   string    │                     │
│  │ data  ────┐ │        └─────────────┘                     │
│  └───────────┼─┘                                            │
│              │                                              │
│              │          ┌────────────────────────┐          │
│              │   match  │  1. Сравнить _type     │          │
│              │   ┌───── │  2. Если равны → ok    │          │
│              ▼   ▼      │  3. Копировать data    │          │
│          ┌─────────┐    └────────────────────────┘          │
│          │ "hello" │                                        │
│          └─────────┘                                        │
│                 │                                           │
│                 ▼                                           │
│              s = "hello"                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### assertI2T — non-empty interface to concrete type

```go
// runtime/iface.go
func assertI2T(t *_type, i iface, r unsafe.Pointer) {
    tab := i.tab
    if tab == nil || tab.Type != t {
        panic(&TypeAssertionError{...})
    }
    typedmemmove(t, r, i.data)
}
```

`assertI2T` для непустого интерфейса: проверить `itab`, затем копировать `data`.

### assertE2I / assertI2I — interface to interface

Проверка, реализует ли значение другой интерфейс:

```go
var r io.Reader = os.Stdin
w := r.(io.Writer)  // проверяем, реализует ли *os.File io.Writer
```

```go
// runtime/iface.go
func assertI2I(inter *interfacetype, tab *itab) *itab {
    if tab == nil {
        // nil interface → nil assertion результат
        return nil
    }

    // Проверяем кеш: может уже есть itab для (inter, tab.Type)?
    if tab.Inter == inter {
        // Уже тот же интерфейс
        return tab
    }

    // Ищем/создаём itab для новой пары
    return getitab(inter, tab.Type, false)
}
```

Ключевая развилка: reuse itab для того же интерфейса, иначе поиск/создание itab; если методов нет — провал.

**Ключевой момент:** assertion к интерфейсу использует кеширование itab. Первый assertion может быть медленным (создание itab), повторные — O(1).

## Type Switch Internals

Компилятор оптимизирует type switch в зависимости от количества cases.

### Маленький switch (≤4 cases)

```go
switch v := x.(type) {
case int:
    // ...
case string:
    // ...
}
```

Компилируется в последовательность сравнений:

```go
// Псевдокод после компиляции
t := efaceOf(x)._type
if t == intType {
    v := *(*int)(efaceOf(x).data)
    // case int
} else if t == stringType {
    v := *(*string)(efaceOf(x).data)
    // case string
} else {
    // default
}
```

Для малого числа cases это быстрее: серия сравнений указателей типов.

### Большой switch (>4 cases)

Используется hash-based binary search:

```go
switch v := x.(type) {
case int:      // hash: 0x12
case string:   // hash: 0x34
case []byte:   // hash: 0x56
case float64:  // hash: 0x78
case bool:     // hash: 0x9A
case error:    // hash: 0xBC
// ... много cases
}
```

```
Binary Search по hash
┌─────────────────────────────────────────────────────────────┐
│ Sorted by hash:                                             │
│                                                             │
│ [int:0x12] [string:0x34] [[]byte:0x56] [float64:0x78] ...   │
│                                                             │
│ Input: x с hash = 0x56                                      │
│                                                             │
│ Step 1: mid = [[]byte:0x56]                                 │
│         0x56 == 0x56 → match!                               │
│                                                             │
│ Step 2: Verify type pointer (hash collision возможен)       │
│         if t == sliceByteType → case []byte                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Хеш ускоряет поиск, но нужна проверка указателя типа — хеши могут совпадать.

```
Type switch dispatch (упрощённо)

cases <= 4            cases > 4
───────────────       ─────────────────
linear if/else        hash + binary
type ptr compare      type hash compare
```

### Interface cases в type switch

```go
switch v := x.(type) {
case io.Reader:
    // ...
case io.Writer:
    // ...
}
```

Interface cases проверяются через `getitab`:

```go
// Псевдокод
t := efaceOf(x)._type
if getitab(readerInterface, t, true) != nil {
    // case io.Reader
} else if getitab(writerInterface, t, true) != nil {
    // case io.Writer
}
```

`case io.Reader` — это проверка **реализует ли тип интерфейс**, а не сравнение типа.

## Comma-ok Pattern в stdlib

Стандартная библиотека широко использует comma-ok для optional interfaces:

### http.Pusher

```go
// net/http/server.go
func (w *response) Push(target string, opts *PushOptions) error {
    // Проверяем, поддерживает ли ResponseWriter HTTP/2 push
    pusher, ok := w.conn.rwc.(Pusher)
    if !ok {
        return ErrNotSupported
    }
    return pusher.Push(target, opts)
}
```

`ResponseWriter` — базовый интерфейс; comma-ok проверяет расширение **без ломки API**.

### io.StringWriter

```go
// io/io.go
func WriteString(w Writer, s string) (n int, err error) {
    // Оптимизация: если Writer умеет WriteString напрямую
    if sw, ok := w.(StringWriter); ok {
        return sw.WriteString(s)
    }
    // Fallback: конвертируем в []byte
    return w.Write([]byte(s))
}
```

`WriteString` — быстрый путь: если реализация умеет писать строку напрямую, избегаем аллокации `[]byte`.

### io.ReaderFrom

```go
// io/io.go
func Copy(dst Writer, src Reader) (written int64, err error) {
    // Оптимизация: ReadFrom может быть эффективнее
    if rf, ok := dst.(ReaderFrom); ok {
        return rf.ReadFrom(src)
    }
    // Оптимизация: WriteTo может быть эффективнее
    if wt, ok := src.(WriterTo); ok {
        return wt.WriteTo(dst)
    }
    // Fallback: буферизованное копирование
    // ...
}
```

`ReaderFrom`/`WriterTo` позволяют использовать оптимизированные пути (например, `sendfile`).

### fmt.Stringer и fmt.GoStringer

```go
// fmt/print.go
func (p *pp) handleMethods(verb rune) (handled bool) {
    // Проверяем интерфейсы в порядке приоритета
    if p.arg == nil {
        return false
    }

    if stringer, ok := p.arg.(Stringer); ok {
        p.fmtString(stringer.String(), verb)
        return true
    }

    if goStringer, ok := p.arg.(GoStringer); ok {
        p.fmtString(goStringer.GoString(), verb)
        return true
    }

    return false
}
```

Порядок важен: `Stringer` для «человеческого» вывода, `GoStringer` — для `#v`.

<TypeAssertionDebugger />

## Benchmark: assertion vs direct

```go
type Impl struct{ value int }

func (i *Impl) Read(p []byte) (int, error) {
    return 0, nil
}

func BenchmarkDirectCall(b *testing.B) {
    impl := &Impl{value: 42}
    var sink int
    for i := 0; i < b.N; i++ {
        sink = impl.value
    }
}

func BenchmarkAssertionCached(b *testing.B) {
    var r io.Reader = &Impl{value: 42}
    var sink int
    for i := 0; i < b.N; i++ {
        if impl, ok := r.(*Impl); ok {
            sink = impl.value
        }
    }
}

func BenchmarkTypeSwitch(b *testing.B) {
    var x any = &Impl{value: 42}
    var sink int
    for i := 0; i < b.N; i++ {
        switch v := x.(type) {
        case *Impl:
            sink = v.value
        }
    }
}

// Результаты (примерные):
// BenchmarkDirectCall-8         1000000000    0.25 ns/op
// BenchmarkAssertionCached-8     500000000    2.15 ns/op
// BenchmarkTypeSwitch-8          500000000    2.20 ns/op
// Цифры зависят от CPU, версии Go и оптимизаций компилятора
```

**Выводы:**
- Type assertion часто в несколько раз медленнее прямого доступа
- Но в абсолютных числах это обычно единицы ns — пренебрежимо для большинства случаев
- Кешированные assertions (повторные проверки того же типа) очень быстрые

Интерпретация: разница заметна в tight loop, в IO‑коде обычно теряется.

## Assertion к конкретному типу vs интерфейсу

```go
var x any = &bytes.Buffer{}

// К конкретному типу — просто сравнение _type
buf := x.(*bytes.Buffer)  // O(1): сравнить *_type

// К интерфейсу — нужен itab lookup
r := x.(io.Reader)  // O(1) если itab в кеше, иначе создание
```

Вторая форма дороже: нужно найти/создать `itab` для пары (io.Reader, *bytes.Buffer).

### Производительность

```go
func BenchmarkAssertToConcrete(b *testing.B) {
    var x any = &bytes.Buffer{}
    for i := 0; i < b.N; i++ {
        _ = x.(*bytes.Buffer)
    }
}

func BenchmarkAssertToInterface(b *testing.B) {
    var x any = &bytes.Buffer{}
    for i := 0; i < b.N; i++ {
        _ = x.(io.Reader)
    }
}

// BenchmarkAssertToConcrete-8    1000000000    1.05 ns/op
// BenchmarkAssertToInterface-8    500000000    2.80 ns/op
// Цифры зависят от CPU, версии Go и оптимизаций компилятора
```

Assertion к интерфейсу обычно медленнее из-за itab lookup; конкретные цифры зависят от кеша и окружения.

## Error Handling Patterns

### Type assertion для error types

```go
// Проверка конкретного типа ошибки
if pathErr, ok := err.(*os.PathError); ok {
    fmt.Printf("Path error: %s on %s\n", pathErr.Op, pathErr.Path)
}

// Лучше использовать errors.As (Go 1.13+)
var pathErr *os.PathError
if errors.As(err, &pathErr) {
    fmt.Printf("Path error: %s on %s\n", pathErr.Op, pathErr.Path)
}
```

`errors.As` проходит по цепочке `Unwrap()`, поэтому не пропустит обёрнутые ошибки:

```go
err := fmt.Errorf("open failed: %w", &os.PathError{Op: "open", Path: "x"})
var pe *os.PathError
_ = errors.As(err, &pe) // true
```

### errors.As vs type assertion

```go
// Type assertion — только прямое совпадение типа
if e, ok := err.(*MyError); ok { ... }

// errors.As — проходит через Unwrap() chain
var target *MyError
if errors.As(err, &target) { ... }  // найдёт MyError в wrapped errors
```

Практика: для ошибок почти всегда используйте `errors.As`.

## Anti-patterns

### Избыточные assertions

```go
// ❌ Плохо: проверяем тип, потом снова assertion
func process(x any) {
    if _, ok := x.(*Buffer); ok {
        buf := x.(*Buffer)  // повторный assertion!
        buf.Write(data)
    }
}

// ✅ Хорошо: один assertion
func process(x any) {
    if buf, ok := x.(*Buffer); ok {
        buf.Write(data)
    }
}
```

Одна проверка = один lookup; повторная assertion делает работу снова.

### Type switch без использования значения

```go
// ❌ Плохо: switch без присваивания типизированного значения
func handle(x any) {
    switch x.(type) {
    case string:
        s := x.(string)  // повторный assertion!
        fmt.Println(s)
    }
}

// ✅ Хорошо: используем присваивание в switch
func handle(x any) {
    switch v := x.(type) {
    case string:
        fmt.Println(v)  // v уже string
    }
}
```

Так вы получаете типизированное значение **без повторной** runtime‑проверки.

### Assertion вместо полиморфизма

```go
// ❌ Плохо: manual dispatch через type switch
func process(x any) {
    switch v := x.(type) {
    case *TypeA:
        v.Process()
    case *TypeB:
        v.Process()
    case *TypeC:
        v.Process()
    }
}

// ✅ Хорошо: использовать интерфейс
type Processor interface {
    Process()
}

func process(p Processor) {
    p.Process()
}
```

Если все варианты имеют общий метод — используйте интерфейс, а не type switch.

## Выводы

1. **Comma-ok** — предпочтительная форма для runtime проверок типов

2. **Type switch** оптимизирован компилятором: binary search для больших switch

3. **Assertion к интерфейсу** использует кеширование itab — первый раз медленнее

4. **stdlib паттерн**: optional interfaces через comma-ok для оптимизаций

5. **errors.As** предпочтительнее type assertion для ошибок (поддерживает wrapping)

6. **Overhead** обычно единицы ns — пренебрежимо для большинства случаев, но избегайте в hot loops

## Sources

- [Go spec: Type assertions](https://go.dev/ref/spec#Type_assertions)
- [Go spec: Interface types](https://go.dev/ref/spec#Interface_types)
- [Go spec: Method sets](https://go.dev/ref/spec#Method_sets)
