# Interface Best Practices

Интерфейсы — мощный инструмент абстракции в Go, но их легко использовать неправильно. В этой статье — проверенные паттерны и anti-patterns для работы с интерфейсами.

## TL;DR Checklist

| Правило | Пример |
|---------|--------|
| Маленькие интерфейсы (1-3 метода) | `io.Reader`, `io.Writer`, `fmt.Stringer` |
| Accept interfaces, return structs | `func New(r io.Reader) *Parser` |
| Define interfaces at consumer | `type Storage interface` в пакете, который использует |
| Composition over inheritance | `io.ReadWriteCloser` = Reader + Writer + Closer |
| Проверка реализации в compile-time | `var _ Interface = (*Type)(nil)` |

## Interface Segregation Principle

ISP — один из принципов SOLID: клиенты не должны зависеть от интерфейсов, которые они не используют.

### Проблема: God Interface

```go
// ❌ Плохо: огромный интерфейс
type Repository interface {
    // Users
    CreateUser(u User) error
    GetUser(id int) (User, error)
    UpdateUser(u User) error
    DeleteUser(id int) error
    ListUsers() ([]User, error)

    // Posts
    CreatePost(p Post) error
    GetPost(id int) (Post, error)
    UpdatePost(p Post) error
    DeletePost(id int) error
    ListPosts() ([]Post, error)

    // Comments
    CreateComment(c Comment) error
    // ... ещё 20 методов
}
```

Большой интерфейс связывает код: любое изменение ломает реализации и моки.

**Проблемы:**
- Реализация требует 30+ методов, даже если нужен только один
- Тестирование требует огромных моков
- Изменение одного метода может сломать всех клиентов

### Решение: маленькие интерфейсы

```go
// ✅ Хорошо: разделённые интерфейсы
type UserReader interface {
    GetUser(id int) (User, error)
}

type UserWriter interface {
    CreateUser(u User) error
    UpdateUser(u User) error
}

type UserDeleter interface {
    DeleteUser(id int) error
}

// Композиция для тех, кому нужно всё
type UserRepository interface {
    UserReader
    UserWriter
    UserDeleter
}
```

```go
type Handler struct {
    users UserReader // нужен только GetUser
}
```

### stdlib примеры

```go
// io пакет — эталон маленьких интерфейсов
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

type Closer interface {
    Close() error
}

// Композиция
type ReadWriter interface {
    Reader
    Writer
}

type ReadWriteCloser interface {
    Reader
    Writer
    Closer
}
```

Это гибко: тип может реализовать только `Reader`, а участвовать в API, где нужен только `Reader`.

## Accept Interfaces, Return Structs

Один из главных принципов Go: принимай интерфейсы, возвращай конкретные типы.

### Почему принимать интерфейсы

```go
// ✅ Хорошо: функция принимает интерфейс
func ParseJSON(r io.Reader) (*Config, error) {
    // Работает с любым Reader:
    // - *os.File
    // - *bytes.Buffer
    // - *http.Response.Body
    // - strings.NewReader()
    // - и любым кастомным типом с Read()
}

// Использование
f, _ := os.Open("config.json")
cfg, _ := ParseJSON(f)  // файл

resp, _ := http.Get("https://api.example.com/config")
cfg, _ := ParseJSON(resp.Body)  // HTTP response

cfg, _ := ParseJSON(strings.NewReader(`{"key": "value"}`))  // строка
```

Смысл: API не привязан к источнику данных, а тесты легко подменяют вход.

### Почему возвращать конкретные типы

```go
// ✅ Хорошо: возвращаем конкретный тип
func NewServer(addr string) *Server {
    return &Server{addr: addr}
}

// ❌ Плохо: возвращаем интерфейс без необходимости
func NewServer(addr string) ServerInterface {
    return &Server{addr: addr}
}
```

Возврат интерфейса без необходимости ограничивает пользователя: он теряет доступ к методам конкретного типа.

**Причины:**
1. **Документация**: конкретный тип показывает, что именно вы получаете
2. **Расширяемость**: пользователи могут использовать методы, не в интерфейсе
3. **Производительность**: меньше overhead на interface dispatch
4. **Тестируемость**: моки нужны на входе функций, не на выходе

### Исключения

Иногда возврат интерфейса оправдан:

```go
// Фабрика, скрывающая реализацию
func NewStorage(config Config) Storage {
    switch config.Type {
    case "postgres":
        return &PostgresStorage{...}
    case "mysql":
        return &MySQLStorage{...}
    default:
        return &InMemoryStorage{...}
    }
}

// error — всегда интерфейс
func Parse(s string) (int, error) {
    // ...
}
```

Если вы скрываете реализацию за фабрикой или динамической загрузкой, возврат интерфейса оправдан — это **граница абстракции**.

## Interface Pollution

"Interface pollution" — создание интерфейсов без реальной необходимости.

### Признаки

1. **Один implementation** — если только одна реализация, интерфейс не нужен
2. **Создан "на будущее"** — YAGNI (You Ain't Gonna Need It)
3. **Экспортирован, но не используется** — мёртвый код
4. **Дублирует конкретный тип** — все методы типа в интерфейсе

### Пример pollution

```go
// ❌ Плохо: ненужный интерфейс
type UserService interface {
    CreateUser(u User) error
    GetUser(id int) (User, error)
}

type userService struct {
    db *sql.DB
}

func NewUserService(db *sql.DB) UserService {  // возвращает интерфейс
    return &userService{db: db}
}

// ... единственная реализация
```

Здесь интерфейс не даёт преимуществ, но скрывает методы конкретного типа.

### Когда интерфейс НЕ нужен

```go
// ✅ Хорошо: просто конкретный тип
type UserService struct {
    db *sql.DB
}

func NewUserService(db *sql.DB) *UserService {
    return &UserService{db: db}
}

// Интерфейс появится, когда будет реальная потребность в абстракции
```

Правило: сначала конкретные типы, интерфейс — **по факту** необходимости.

### Decision Table

| Ситуация | Нужен интерфейс? |
|----------|------------------|
| Множественные реализации | Да |
| Тестирование с моками | Да (определи на стороне consumer) |
| Dependency injection | Да |
| Одна реализация, без моков | Нет |
| "Может понадобиться в будущем" | Нет (YAGNI) |
| Библиотека для внешних пользователей | Зависит от use case |

## Define Interfaces at Consumer

В Go интерфейсы определяют там, где их используют, не где реализуют.

### Java-стиль (плохо в Go)

```go
// producer package
package database

type UserRepository interface {  // интерфейс рядом с реализацией
    GetUser(id int) (User, error)
    CreateUser(u User) error
}

type PostgresUserRepository struct {
    // ...
}

// consumer package
package api

import "myapp/database"

type Handler struct {
    repo database.UserRepository  // зависит от пакета producer
}
```

Минус: producer диктует интерфейс всем consumers, даже если им нужны разные подмножества.

### Go-стиль (хорошо)

```go
// producer package
package database

// Только конкретная реализация, без интерфейса
type PostgresUserRepository struct {
    // ...
}

func (r *PostgresUserRepository) GetUser(id int) (User, error) { ... }
func (r *PostgresUserRepository) CreateUser(u User) error { ... }

// consumer package
package api

// Интерфейс определён там, где используется
type UserGetter interface {
    GetUser(id int) (User, error)
}

type Handler struct {
    users UserGetter  // минимальный интерфейс для нужд Handler
}
```

Так consumer контролирует размер интерфейса, и мок живёт в его пакете.

### Преимущества

1. **Минимальная зависимость**: consumer определяет только нужные методы
2. **Легче тестировать**: мок интерфейса в том же пакете, где тест
3. **Loose coupling**: producer не знает о всех потребителях
4. **Разные интерфейсы** для разных consumers

## Naming & Semantics

Конвенции из Effective Go помогают избегать двусмысленности:

- **Однометодные интерфейсы** — суффикс `-er`: `Reader`, `Writer`, `Closer`, `Stringer`.
- **Канонические имена методов** (`Read`, `Write`, `Close`, `String`, `Flush`) используйте только с канонической сигнатурой и семантикой.
- **Без `Get` префиксов** для геттеров: `Owner()` вместо `GetOwner()`.

```go
// ✅ Хорошо: стандартное имя и сигнатура
type Stringer interface {
    String() string
}

// ❌ Плохо: имя Read, но другая сигнатура/семантика
// Почему плохо: имя `Reader` обычно означает `io.Reader` со
// сигнатурой Read(p []byte) (n int, err error) и семантикой потокового чтения.
// Здесь поведение другое ("прочитать всё"), поэтому имя вводит в заблуждение.
type Reader interface {
    Read() []byte
}

// ❌ Плохо: Get-префикс
// Почему плохо: в Go геттеры и так читаются как `Name()`,
// а `GetName()` добавляет шум и не даёт смысла.
func (u *User) GetName() string { return u.name }
// ✅ Хорошо
func (u *User) Name() string { return u.name }
```

Идея — **не ломать ожидания**: `Read` должен вести себя как `io.Reader`.

## Эволюция интерфейсов

Добавление метода в интерфейс — **breaking change** для всех реализаций.

**Рекомендации:**
- Добавляйте новый интерфейс вместо расширения старого.
- Используйте embedding для расширения без ломки существующих типов.

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

// Расширение через embedding
type ReadCloser interface {
    Reader
    Close() error
}
```

Это не ломает реализации `Reader`, но даёт новый контракт тем, кто умеет больше.

## Empty Interface Anti-patterns

`any` / `interface{}` отключает type safety. Используйте с осторожностью.

### Когда any допустим

```go
// JSON/encoding — типы не известны заранее
func Unmarshal(data []byte, v any) error

// fmt — работает с любым типом
func Printf(format string, a ...any) (n int, err error)

// Контейнеры для разнородных данных
type Event struct {
    Type    string
    Payload any
}
```

`any` уместен, когда тип заранее неизвестен или нужна максимальная гибкость (logging, JSON).

### Когда any — anti-pattern

```go
// ❌ Плохо: потеря type safety
func Process(data any) {
    switch v := data.(type) {
    case string:
        // ...
    case int:
        // ...
    // Легко забыть case!
    }
}

// ✅ Хорошо: явные типы или generics
func ProcessString(s string) { ... }
func ProcessInt(i int) { ... }

// Или с generics (Go 1.18+)
func Process[T string | int](data T) { ... }
```

`any` часто превращается в `switch` и ручные assertions — поддержка кода ухудшается.

### type switch вместо интерфейса

```go
// ❌ Плохо: type switch по any
func calculateArea(shape any) float64 {
    switch s := shape.(type) {
    case *Circle:
        return math.Pi * s.r * s.r
    case *Rectangle:
        return s.w * s.h
    default:
        panic("unknown shape")
    }
}

// ✅ Хорошо: интерфейс с методом
type Shape interface {
    Area() float64
}

func calculateArea(s Shape) float64 {
    return s.Area()
}
```

Интерфейс лучше: добавление нового типа не требует менять `calculateArea`.

## Interface Composition

Композиция интерфейсов — мощный паттерн в Go.

### Embedding интерфейсов

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

// Композиция
type ReadWriter interface {
    Reader  // embedded
    Writer  // embedded
}

// Эквивалентно:
type ReadWriter interface {
    Read(p []byte) (n int, err error)
    Write(p []byte) (n int, err error)
}
```

Embedding «склеивает» method set — чистая композиция без наследования.

### Optional Interfaces

Optional interfaces — это **дополнительные возможности**, которые реализуют не все типы. Базовый интерфейс остаётся минимальным, а расширения проверяются через comma-ok. Так API остаётся совместимым: старые реализации работают, новые могут давать больше функциональности.

```
Handler (обязательный)
 ├─ Validator (опционально)
 └─ Closer    (опционально)
```

```go
// Базовый интерфейс
type Handler interface {
    Handle(ctx context.Context, req Request) (Response, error)
}

// Опциональные capabilities
type Validator interface {
    Validate(req Request) error
}

type Closer interface {
    Close() error
}

// Использование
func Execute(h Handler, req Request) (Response, error) {
    // Проверяем optional interface
    if v, ok := h.(Validator); ok {
        if err := v.Validate(req); err != nil {
            return nil, err
        }
    }

    resp, err := h.Handle(context.Background(), req)

    // Cleanup если поддерживается
    if c, ok := h.(Closer); ok {
        defer c.Close()
    }

    return resp, err
}
```

Пример поведения:

```go
type BasicHandler struct{}
func (BasicHandler) Handle(ctx context.Context, req Request) (Response, error) { ... }

type ValidatingHandler struct{}
func (ValidatingHandler) Handle(ctx context.Context, req Request) (Response, error) { ... }
func (ValidatingHandler) Validate(req Request) error { ... }

Execute(BasicHandler{}, req)      // validation пропускается
Execute(ValidatingHandler{}, req) // validation выполняется
```

«Optional interfaces» добавляет способности без изменения базового интерфейса и снижает риск breaking changes.

## Method Sets: Value vs Pointer Receiver

Понимание method sets критично для работы с интерфейсами.

### Правила method sets

| Receiver | Методы value receiver | Методы pointer receiver |
|----------|----------------------|------------------------|
| `T` (value) | Да | Нет |
| `*T` (pointer) | Да | Да |

```go
type Counter struct {
    count int
}

func (c Counter) Value() int {    // value receiver
    return c.count
}

func (c *Counter) Increment() {   // pointer receiver
    c.count++
}

type ValueGetter interface {
    Value() int
}

type Incrementer interface {
    Increment()
}

// Значение можно инкрементировать как переменную:
c := Counter{}
c.Increment() // ✅ ok: компилятор делает (&c).Increment()

// Value может удовлетворять только ValueGetter
var vg ValueGetter = Counter{}  // ✅ OK
var inc Incrementer = Counter{} // ❌ ОШИБКА: Counter не имеет метода Increment

// Pointer может удовлетворять оба
var vg2 ValueGetter = &Counter{}  // ✅ OK
var inc2 Incrementer = &Counter{} // ✅ OK
```

Ключевой момент: **интерфейс удовлетворяется только method set типа**, а не тем, что компилятор может «взять адрес» при вызове метода.

Запомнить проще так: значение `T` не имеет методов с pointer receiver, а `*T` имеет всё.

### Почему такое ограничение?

```go
// Когда значение не addressable, компилятор не может взять указатель:
type Map map[string]Counter

m := Map{"a": Counter{count: 1}}

// m["a"].Increment()  // ❌ ОШИБКА: cannot take address of m["a"]

// Это значение временное — изменение было бы потеряно
```

То есть компилятор защищает от «тихих» багов, когда изменение применяется к копии.

### Проверка реализации в compile-time

```go
// Гарантирует, что *Server реализует http.Handler
var _ http.Handler = (*Server)(nil)

// Гарантирует, что MyError реализует error
var _ error = (*MyError)(nil)
var _ error = MyError{}  // если value receiver

// Если не реализует — ошибка компиляции:
// cannot use (*Server)(nil) (type *Server) as type http.Handler:
//     *Server does not implement http.Handler (missing ServeHTTP method)
```

Такую проверку часто помещают рядом с типом, чтобы компилятор ловил несоответствие интерфейсу как можно раньше.

## Practical Patterns

### Functional Options с интерфейсом

```go
type Option interface {
    apply(*Server)
}

type optionFunc func(*Server)

func (f optionFunc) apply(s *Server) { f(s) }

func WithPort(port int) Option {
    return optionFunc(func(s *Server) {
        s.port = port
    })
}

func WithLogger(l Logger) Option {
    return optionFunc(func(s *Server) {
        s.logger = l
    })
}

func NewServer(opts ...Option) *Server {
    s := &Server{port: 8080}
    for _, opt := range opts {
        opt.apply(s)
    }
    return s
}
```

`Option` задаёт контракт, а `optionFunc` позволяет передавать функции как реализации.

### Decorator pattern

```go
type Handler interface {
    Handle(req Request) Response
}

// Decorator для логирования
type LoggingHandler struct {
    next   Handler
    logger Logger
}

func (h *LoggingHandler) Handle(req Request) Response {
    h.logger.Log("handling request")
    resp := h.next.Handle(req)
    h.logger.Log("request handled")
    return resp
}

// Decorator для метрик
type MetricsHandler struct {
    next    Handler
    metrics Metrics
}

func (h *MetricsHandler) Handle(req Request) Response {
    start := time.Now()
    resp := h.next.Handle(req)
    h.metrics.RecordDuration(time.Since(start))
    return resp
}

// Композиция декораторов
handler := &LoggingHandler{
    next: &MetricsHandler{
        next: &RealHandler{},
    },
}
```

Декораторы работают потому, что сами реализуют тот же интерфейс, что и оборачиваемый объект.

### Strategy pattern

```go
type Compressor interface {
    Compress(data []byte) ([]byte, error)
}

type GzipCompressor struct{}
type ZstdCompressor struct{}
type NoopCompressor struct{}

type Storage struct {
    compressor Compressor
}

func (s *Storage) Save(data []byte) error {
    compressed, err := s.compressor.Compress(data)
    if err != nil {
        return err
    }
    return s.write(compressed)
}
```

Strategy полезен, когда нужна подмена поведения без if/else, например в тестах или для выбора алгоритма компрессии.

## Выводы

1. **Маленькие интерфейсы** (1-3 метода) легче реализовать, тестировать, понимать

2. **Accept interfaces, return structs** — максимальная гибкость и прозрачность

3. **Определяйте интерфейсы у consumer**, не у producer — Go-way

4. **Избегайте interface pollution** — интерфейс нужен при >1 реализации или для тестирования

5. **Понимайте method sets** — pointer receiver методы доступны только для `*T`

6. **Проверяйте реализацию**: `var _ Interface = (*Type)(nil)`

7. **Композиция интерфейсов** — мощный инструмент для optional capabilities

## Sources

- [Effective Go: Interface names](https://go.dev/doc/effective_go#interface-names)
- [Effective Go: Names](https://go.dev/doc/effective_go#names)
- [Effective Go: Getters](https://go.dev/doc/effective_go#getters)
