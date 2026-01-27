# Generics vs Interfaces

Go 1.18+ предлагает два механизма полиморфизма: интерфейсы (runtime) и generics (compile-time). Когда использовать какой? В этой статье разберём ключевые отличия, GCShape stenciling и критерии выбора.

## TL;DR

| Критерий | Interfaces | Generics |
|----------|------------|----------|
| Полиморфизм | Runtime (dynamic dispatch) | Compile-time (GCShape stenciling) |
| Проверка типов | Runtime (type assertion) | Compile-time |
| Overhead | Indirect call (обычно единицы ns) | Direct call, но возможно code bloat |
| Flexibility | Полная — любой тип runtime | Ограничена constraints |
| Use case | Behavior abstraction | Type-safe containers, algorithms |

## Когда использовать Interfaces

### 1. Behavior abstraction

Когда важно *что* объект умеет делать, а не *какого* он типа:

```go
// Идеально для интерфейса: поведение "умеет читать"
type Reader interface {
    Read(p []byte) (n int, err error)
}

func ProcessData(r Reader) error {
    // Работаем с любым источником данных
    buf := make([]byte, 1024)
    _, err := r.Read(buf)
    return err
}

// Использование с разными типами
ProcessData(os.Stdin)           // *os.File
ProcessData(resp.Body)          // *http.Response.Body
ProcessData(strings.NewReader(s)) // *strings.Reader
```

Интерфейс — контракт поведения: «умеет читать», а не «является файлом».

### 2. Heterogeneous collections

Когда нужна коллекция объектов разных типов:

```go
// Интерфейс для разных handlers
type Handler interface {
    Handle(ctx context.Context, req Request) Response
}

type Router struct {
    handlers map[string]Handler  // разные типы в одной map
}

func (r *Router) Register(path string, h Handler) {
    r.handlers[path] = h  // *AuthHandler, *UserHandler, *APIHandler...
}
```

Generics не решают heterogeneous коллекции: `[]T` содержит только один тип `T`.

### 3. Plugin architecture

```go
// Плагины реализуют интерфейс, загружаются в runtime
type Plugin interface {
    Name() string
    Execute(ctx context.Context) error
}

func LoadPlugins(paths []string) []Plugin {
    var plugins []Plugin
    for _, path := range paths {
        p := loadPlugin(path)  // dynamic loading
        plugins = append(plugins, p)
    }
    return plugins
}
```

Плагины загружаются в runtime, поэтому интерфейс — естественный контракт.

### 4. Dependency Injection

```go
type UserService struct {
    repo UserRepository  // интерфейс для DI
    cache Cache
}

// В production
service := &UserService{
    repo: &PostgresRepository{db},
    cache: &RedisCache{client},
}

// В тестах
service := &UserService{
    repo: &MockRepository{},
    cache: &MockCache{},
}
```

Интерфейс позволяет подменять зависимости без изменения кода.

## Когда использовать Generics

### 1. Type-safe containers

```go
// Generic stack — type-safe без casting
type Stack[T any] struct {
    items []T
}

func (s *Stack[T]) Push(item T) {
    s.items = append(s.items, item)
}

func (s *Stack[T]) Pop() (T, bool) {
    if len(s.items) == 0 {
        var zero T
        return zero, false
    }
    item := s.items[len(s.items)-1]
    s.items = s.items[:len(s.items)-1]
    return item, true
}

// Использование
intStack := &Stack[int]{}
intStack.Push(1)
intStack.Push(2)
val, _ := intStack.Pop()  // val имеет тип int, не any
```

Generics дают compile‑time type safety и отсутствие кастов.

### 2. Algorithms on types

```go
// Generic функции для работы с comparable типами
func Contains[T comparable](slice []T, target T) bool {
    for _, v := range slice {
        if v == target {
            return true
        }
    }
    return false
}

func Filter[T any](slice []T, predicate func(T) bool) []T {
    result := make([]T, 0)
    for _, v := range slice {
        if predicate(v) {
            result = append(result, v)
        }
    }
    return result
}

func Map[T, U any](slice []T, mapper func(T) U) []U {
    result := make([]U, len(slice))
    for i, v := range slice {
        result[i] = mapper(v)
    }
    return result
}

// Использование
nums := []int{1, 2, 3, 4, 5}
evens := Filter(nums, func(n int) bool { return n%2 == 0 })
doubled := Map(evens, func(n int) int { return n * 2 })
```

Раньше такие функции писали отдельно для `[]int`, `[]string` и т.д. Generics убирают дублирование.

### 3. Type constraints (compile-time contracts)

```go
// В Go 1.21+ есть stdlib: cmp.Ordered
// Constraint: тип должен поддерживать сравнение
type Ordered interface {
    ~int | ~int8 | ~int16 | ~int32 | ~int64 |
    ~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64 |
    ~float32 | ~float64 | ~string
}

func Max[T Ordered](a, b T) T {
    if a > b {
        return a
    }
    return b
}

// Compile-time ошибка если тип не Ordered
Max([]int{1}, []int{2})  // ERROR: []int does not satisfy Ordered
```

`~` означает «любой тип с таким underlying type», включая собственные.

### 4. Avoiding boxing/unboxing

```go
// С интерфейсом: boxing при каждом добавлении
func SumAny(values []any) int {
    sum := 0
    for _, v := range values {
        sum += v.(int)  // runtime assertion + unboxing
    }
    return sum
}

// С generics: нет boxing
func Sum[T ~int | ~int64 | ~float64](values []T) T {
    var sum T
    for _, v := range values {
        sum += v  // direct operation, no boxing
    }
    return sum
}
```

Это быстрее и безопаснее: без runtime assertions и рискованных `any`.

## GCShape Stenciling

Go не делает полную monomorphization как Rust. Вместо этого используется **GCShape stenciling** — компромисс между code bloat и производительностью.

### Что такое GCShape

GCShape (Garbage Collection Shape) — это группировка типов по их "форме" с точки зрения GC:
- Размер в байтах
- Наличие указателей (для GC tracing)

```
GCShape группировка:
┌────────────────────────────────────────────────────────┐
│                                                        │
│  GCShape "8 bytes, no pointers":                       │
│  ┌─────┐ ┌─────┐ ┌───────┐ ┌─────────┐ ┌─────────┐     │
│  │ int │ │int64│ │uint64 │ │ float64 │ │*MyStruct│     │
│  └─────┘ └─────┘ └───────┘ └─────────┘ └─────────┘     │
│     ↓                                                  │
│  Один скомпилированный код с runtime dictionary        │
│                                                        │
│  GCShape "24 bytes, has pointers":                     │
│  ┌────────┐ ┌──────────────┐                           │
│  │ string │ │ []int        │                           │
│  └────────┘ └──────────────┘                           │
│     ↓                                                  │
│  Другой скомпилированный код                           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Идея: типы с одинаковой «формой» используют один и тот же код.

### Как это работает

```go
func Print[T any](v T) {
    fmt.Println(v)
}

Print(42)        // int → GCShape A
Print(int64(42)) // int64 → GCShape A (тот же!)
Print("hello")   // string → GCShape B
Print([]int{})   // []int → GCShape C
```

Компилятор создаёт **один** экземпляр кода для каждого GCShape, плюс **runtime dictionary** с type-specific информацией.

Компромисс: меньше code bloat, но иногда больше indirect calls.

```
GCShape vs monomorphization (упрощённо)

Monomorphization        GCShape stenciling
──────────────────      ─────────────────────
Max[int]   -> code A    Max[int]   ┐
Max[int64] -> code B    Max[int64] ├─> code A (one GCShape)
Max[string]-> code C    Max[string]┘

Плюс GCShape: меньше кода
Минус: иногда нужен dictionary и indirect calls
```

### Dictionary passing

```go
// Что видит программист:
func Max[T Ordered](a, b T) T {
    if a > b {
        return a
    }
    return b
}

// Что генерирует компилятор (псевдокод):
func Max_gcshape_int(dict *runtimeDict, a, b int) int {
    // dict содержит информацию о конкретном типе T
    // Используется для reflection, type assertion, etc.
    if a > b {
        return a
    }
    return b
}
```

`dict` содержит методы, hash и сравнения — скрытый параметр шаблонной функции.

```
Dictionary passing (упрощённо)

Max[T](a, b)
   │ instantiation
   ▼
Max_gcshape(dict, a, b)
   │
   ├─ dict.eq / dict.hash / dict.methods
   ▼
  code for GCShape
```

### Производительность implications

```go
// GCShape stenciling может быть медленнее полной monomorphization

func BenchmarkGenericMax(b *testing.B) {
    for i := 0; i < b.N; i++ {
        _ = Max(i, i+1)  // generic
    }
}

func BenchmarkConcreteMax(b *testing.B) {
    for i := 0; i < b.N; i++ {
        _ = maxInt(i, i+1)  // конкретная функция
    }
}

func maxInt(a, b int) int {
    if a > b {
        return a
    }
    return b
}

// Результаты могут отличаться:
// BenchmarkGenericMax-8     500000000    2.3 ns/op
// BenchmarkConcreteMax-8    1000000000   0.5 ns/op
//
// Причина: dictionary passing + indirect calls в некоторых случаях
```

Иногда generic код близок по стоимости к интерфейсному, особенно с вызовами через dictionary.

### Когда GCShape stenciling замедляет

Исследование PlanetScale показало, что generics могут быть медленнее в определённых сценариях:

```go
// Медленнее с generics (из-за dictionary passing):
func ProcessItems[T any](items []T, process func(T)) {
    for _, item := range items {
        process(item)  // indirect call через dictionary
    }
}

// Быстрее с конкретным типом:
func ProcessInts(items []int, process func(int)) {
    for _, item := range items {
        process(item)  // direct call, может быть inlined
    }
}
```

Вывод: если важна абсолютная производительность, измеряйте и при необходимости пишите специализированную версию.

**Когда это важно:**
- Hot loops с миллионами итераций
- Критичные к latency paths
- Микрооптимизации

**Когда это НЕ важно:**
- Большинство application code
- IO-bound операции
- Code clarity важнее микрооптимизаций

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     INTERFACES vs GENERICS                                  │
├─────────────────────┬───────────────────────┬───────────────────────────────┤
│      Аспект         │     Interfaces        │        Generics               │
├─────────────────────┼───────────────────────┼───────────────────────────────┤
│ Полиморфизм         │ Runtime               │ Compile-time                  │
│                     │ (dynamic dispatch)    │ (GCShape stenciling)          │
├─────────────────────┼───────────────────────┼───────────────────────────────┤
│ Проверка типов      │ Runtime               │ Compile-time                  │
│                     │ (type assertion)      │ (constraint violation = error)│
├─────────────────────┼───────────────────────┼───────────────────────────────┤
│ Heterogeneous       │ ✓ Да                  │ ✗ Нет                         │
│ collections         │ []io.Reader с разными │ []T — все элементы            │
│                     │ типами внутри         │ одного типа T                 │
├─────────────────────┼───────────────────────┼───────────────────────────────┤
│ Type safety         │ Частичная             │ Полная                        │
│                     │ any теряет тип        │ компилятор проверяет          │
├─────────────────────┼───────────────────────┼───────────────────────────────┤
│ Boxing              │ Возможен              │ Обычно нет                    │
│                     │ value → heap          │ прямая работа с типом         │
├─────────────────────┼───────────────────────┼───────────────────────────────┤
│ Code bloat          │ Нет                   │ Умеренный                     │
│                     │ один код для всех     │ код на каждый GCShape         │
├─────────────────────┼───────────────────────┼───────────────────────────────┤
│ Производительность  │ Indirect call         │ Direct call                   │
│                     │ overhead обычно единицы ns │ но dictionary passing     │
├─────────────────────┼───────────────────────┼───────────────────────────────┤
│ Use case            │ Behavior abstraction  │ Type-safe containers          │
│                     │ io.Reader, DI, plugins│ Stack[T], algorithms          │
└─────────────────────┴───────────────────────┴───────────────────────────────┘

Когда использовать?

  INTERFACES                           GENERICS
  ══════════════════════════           ══════════════════════════
  → Разные типы в коллекции            → Type-safe containers
  → Plugin/driver architecture         → Algorithms (Sort, Map, Filter)
  → Dependency injection               → Избежать any/casting
  → Behavior abstraction               → Constraints на операции
  → API boundaries                     → Performance-critical code
```

## Constraints vs Interfaces

### Compile-time vs Runtime

```go
// Interface: runtime contract
type Stringer interface {
    String() string
}

func PrintString(s Stringer) {
    fmt.Println(s.String())  // runtime dispatch
}

// Constraint: compile-time contract
type StringerConstraint interface {
    String() string
}

func PrintString[T StringerConstraint](s T) {
    fmt.Println(s.String())  // может быть devirtualized
}
```

Интерфейс решает задачу «вызвать метод», generics — «типобезопасный код для группы типов».

### Type sets в constraints

Constraints могут ограничивать underlying types:

```go
// Только типы, underlying которых int или string
type IntOrString interface {
    ~int | ~string
}

// Работает с:
type MyInt int       // underlying int
type MyString string // underlying string

// Не работает с:
type MyStruct struct{} // underlying struct
```

`~` позволяет включать собственные named types, не теряя строгого контракта.

### Constraint с методами И type set

```go
// Constraint: числовой тип С методом String
type NumberStringer interface {
    ~int | ~int64 | ~float64
    String() string
}

type MyNumber int

func (n MyNumber) String() string {
    return fmt.Sprintf("%d", n)
}

func Process[T NumberStringer](n T) {
    doubled := n + n        // возможно благодаря ~int constraint
    fmt.Println(doubled.String()) // возможно благодаря String() method
}
```

Обе части constraint должны быть выполнены: тип должен быть числом **и** иметь метод `String`.

## Decision Matrix

### Используй Interfaces когда:

| Сценарий | Причина |
|----------|---------|
| Разные типы в одной коллекции | Heterogeneous data |
| Plugin/driver architecture | Runtime loading |
| Dependency injection | Тестируемость |
| Behavior abstraction | io.Reader, http.Handler |
| API boundaries | Стабильность контракта |

### Используй Generics когда:

| Сценарий | Причина |
|----------|---------|
| Type-safe containers | Stack[T], Queue[T] |
| Algorithms на типах | Sort, Filter, Map |
| Избежать any/casting | Type safety |
| Performance-critical generic code | Избежать boxing |
| Constraints на operations | Ordered, Comparable |

## Практические рекомендации (Go team)

- Начинайте с конкретного кода, не с type constraints: generics добавляйте, когда видите повторяемость.
- Не заменяйте интерфейсы на type parameters, если вам нужна только dispatch по поведению.
- Generics оправданы для функций над slice/map/channel и для общих структур данных.
- Если реализация отличается по типам — используйте интерфейсы, не generics.
- Если операция зависит от runtime-типа без методов — используйте reflection.

## Generic interfaces

Интерфейсы могут иметь type parameters и удобно выражают self-referential constraints:

```go
type Comparer[T any] interface {
    Compare(T) int
}

type MethodTree[E Comparer[E]] struct {
    root *node[E]
}
```

Это позволяет выразить «тип сравнивается сам с собой» без привязки к конкретному типу заранее.

Практика:
- Не усиливайте базовые интерфейсы (`Comparer`) лишними constraints; добавляйте их в конкретных типах.
- Ограничения на pointer receivers часто усложняют API — по возможности избегайте.

## Combining Generics and Interfaces

Generics и интерфейсы отлично работают вместе:

### Generic function с interface constraint

```go
type Processor interface {
    Process() error
}

// Generic, но с interface constraint
func ProcessAll[T Processor](items []T) error {
    for _, item := range items {
        if err := item.Process(); err != nil {
            return err
        }
    }
    return nil
}
```

Здесь generics нужен, чтобы работать со слайсом конкретных типов без кастов, но контракт всё равно задаётся интерфейсом.

### Generic type implementing interface

```go
// Generic тип
type Result[T any] struct {
    Value T
    Err   error
}

// Реализует fmt.Stringer
func (r Result[T]) String() string {
    if r.Err != nil {
        return fmt.Sprintf("Error: %v", r.Err)
    }
    return fmt.Sprintf("Value: %v", r.Value)
}

// Можно использовать как Stringer
var s fmt.Stringer = Result[int]{Value: 42}
```

Generic типы могут реализовывать обычные интерфейсы — всё работает как и с негернерик типами.

### Factory pattern

```go
type Repository[T any] interface {
    Get(id string) (T, error)
    Save(entity T) error
}

type Factory[T any] interface {
    Create() Repository[T]
}

// Конкретная реализация
type UserRepository struct {
    db *sql.DB
}

func (r *UserRepository) Get(id string) (User, error) { ... }
func (r *UserRepository) Save(u User) error { ... }

type UserRepositoryFactory struct {
    db *sql.DB
}

func (f *UserRepositoryFactory) Create() Repository[User] {
    return &UserRepository{db: f.db}
}
```

Factory скрывает конкретную реализацию, но при этом сохраняет типовую безопасность `User` на уровне API.

## Performance Comparison

```go
// Benchmark: Interface vs Generic для простой операции

type Adder interface {
    Add(int) int
}

type IntAdder int

func (a IntAdder) Add(n int) int {
    return int(a) + n
}

func BenchmarkInterface(b *testing.B) {
    var a Adder = IntAdder(1)
    for i := 0; i < b.N; i++ {
        _ = a.Add(i)
    }
}

func BenchmarkGeneric(b *testing.B) {
    a := IntAdder(1)
    for i := 0; i < b.N; i++ {
        _ = addGeneric(a, i)
    }
}

func addGeneric[T interface{ Add(int) int }](a T, n int) int {
    return a.Add(n)
}

func BenchmarkConcrete(b *testing.B) {
    a := IntAdder(1)
    for i := 0; i < b.N; i++ {
        _ = a.Add(i)
    }
}

// Типичные результаты:
// BenchmarkInterface-8    300000000    4.2 ns/op
// BenchmarkGeneric-8      500000000    2.8 ns/op
// BenchmarkConcrete-8     1000000000   0.3 ns/op
// Цифры зависят от CPU, версии Go и оптимизаций компилятора
```

Не делайте выводов по микробенчмарку без контекста: в реальном коде стоимость часто перекрывается бизнес‑логикой или IO.

**Выводы:**
- Concrete чаще всего быстрее (compiler optimizations)
- Generic часто быстрее interface в простых случаях
- Разница в единицы ns — важна только в hot loops

## Выводы

1. **Interfaces** — для runtime полиморфизма, behavior abstraction, heterogeneous collections

2. **Generics** — для compile-time type safety, containers, algorithms

3. **GCShape stenciling** — Go не делает полную monomorphization, возможен overhead

4. **Combine wisely** — generics и interfaces работают вместе

5. **Measure, don't guess** — benchmark конкретный код, микрооптимизации редко нужны

6. **Clarity > micro-performance** — читаемость кода важнее наносекунд в большинстве случаев

## Sources

- [Go blog: When to use generics](https://go.dev/blog/when-generics)
- [Go blog: An introduction to generics](https://go.dev/blog/intro-generics)
- [Go blog: Generic interfaces](https://go.dev/blog/generic-interfaces)
- [Go spec: Interface types](https://go.dev/ref/spec#Interface_types)
- [Go spec: Type parameter declarations](https://go.dev/ref/spec#Type_parameter_declarations)
