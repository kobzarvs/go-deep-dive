# nil Interface Trap

Один из самых коварных gotchas в Go: `(*T)(nil)` присвоенный интерфейсу — не nil. Эта особенность вызывает баги даже у опытных разработчиков. Разберём почему так происходит и как избежать.

## TL;DR

| Сценарий | `interface == nil` |
|----------|-------------------|
| Никогда не присваивали | `true` |
| Присвоили `nil` напрямую | `true` |
| Присвоили typed nil `(*T)(nil)` | `false` |
| Присвоили zero value struct `T{}` | `false` |

**Правило:** интерфейс nil, только если оба поля (`tab`/`_type` и `data`) равны nil.

## Проблема: typed nil

### Классический пример

```go
func getError() error {
    var err *MyError = nil  // typed nil pointer
    return err              // присваиваем интерфейсу
}

func main() {
    err := getError()
    if err != nil {
        fmt.Println("Error!")  // Выведется! Хотя err "как бы" nil
    }
}
```

Почему `err != nil` возвращает `true`?

### Визуализация проблемы

```
Два вида "nil" в интерфейсах:

True nil interface:              Typed nil в интерфейсе:
┌──────────────────────┐         ┌──────────────────────┐
│ tab/type: nil        │         │ tab/type: *MyError   │ ← НЕ nil!
├──────────────────────┤         ├──────────────────────┤
│ data:     nil        │         │ data:     nil        │
└──────────────────────┘         └──────────────────────┘

err == nil: TRUE                 err == nil: FALSE
                                 (потому что type != nil)
```

### Почему так работает

Сравнение `interface == nil` проверяет **оба** поля:

```go
// Псевдокод сравнения interface с nil
func interfaceIsNil(i iface) bool {
    return i.tab == nil && i.data == nil
    // ИЛИ для eface:
    return i._type == nil && i.data == nil
}
```

Когда мы присваиваем `(*MyError)(nil)` интерфейсу:
- `data` = nil (значение указателя)
- `tab`/`_type` = информация о типе `*MyError` — **не nil!**

## Почему так сделано?

### Reflection должен знать тип

```go
var err error = (*MyError)(nil)

// reflect должен уметь определить тип:
fmt.Println(reflect.TypeOf(err))  // *main.MyError
```

Если бы Go терял информацию о типе при nil pointer, `reflect.TypeOf()` не работал бы.

### Method dispatch на nil receiver

В Go можно вызывать методы на `nil` receiver **если receiver — указатель** и сам метод это допускает. Это важно для понимания, почему интерфейс хранит тип даже при `data == nil`.

```go
type MyError struct {
    msg string
}

func (e *MyError) Error() string {
    if e == nil {
        return "nil error"
    }
    return e.msg
}

var err error = (*MyError)(nil)
fmt.Println(err.Error())  // "nil error" — работает!
```

Что происходит:
- интерфейс хранит **тип** `*MyError` (tab/_type ≠ nil)
- data = nil, но itab.fun знает адрес метода `(*MyError).Error`
- dispatch вызывает метод и передаёт receiver = nil

Про receiver: у метода есть **неявный первый параметр** — это и есть receiver. В исходном коде он не пишется, но компилятор передаёт его как обычный аргумент:

```go
var p *MyError = nil
// Синтаксический сахар:
_ = p.Error()

// Эквивалентно вызову метода как функции:
_ = (*MyError).Error(p) // receiver передан явно
```

Схема dispatch для typed-nil:

```
interface value (err)
┌──────────────────────┐
│ tab -> itab          │───┐
│ data = nil           │   │
└──────────────────────┘   │
                           ▼
                      itab.fun[0]
                           │
                           ▼
                    call Error(rcv=nil)
```

Если бы интерфейс становился полностью nil, method dispatch был бы невозможен.

Важно различать:

```go
var p *MyError = nil

// 1) nil receiver, но интерфейс не nil
var e1 error = p
fmt.Println(e1 == nil) // false
_ = e1.Error()         // вызов возможен, receiver = nil
                       // но поведение зависит от реализации:
                       //   если метод разыменовывает receiver
                       //   без проверки — будет panic

// 2) nil interface — вообще нет типа, нет dispatch
var e2 error = nil
fmt.Println(e2 == nil) // true
// e2.Error() // panic: вызов метода на nil interface
```

Отдельно: **value receiver** на nil pointer работать не может — будет panic при неявном разыменовании:

```go
type S struct{ msg string }
func (s S) String() string { return s.msg }

var ps *S = nil
// ps.String() // panic: nil pointer dereference
```

## Паттерны решения

### 1. Явный return nil

```go
// ❌ Плохо: возвращаем typed nil
func getError() error {
    var err *MyError
    if !somethingWrong {
        return err  // (*MyError)(nil) — не nil интерфейс!
    }
    return err
}

// ✅ Хорошо: явно возвращаем nil
func getError() error {
    if !somethingWrong {
        return nil  // untyped nil — будет nil интерфейс
    }
    return &MyError{msg: "something wrong"}
}
```

### 2. Проверка перед return

```go
// ❌ Плохо: typed nil error уходит в интерфейс
func findUser(id int) (*User, error) {
    user := db.Find(id)
    var err *DBError

    if user == nil {
        err = &DBError{msg: "not found"}
    }

    return user, err  // err может быть (*DBError)(nil) → typed nil error
}
```

```go
// ✅ Хорошо: явный nil для interface
func findUser(id int) (*User, error) {
    user := db.Find(id)
    var err *DBError

    if user == nil {
        err = &DBError{msg: "not found"}
    }

    if err != nil {
        return user, err
    }
    return user, nil
}
```

### 3. Использование конкретных типов внутри

```go
// ❌ Плохо: работаем с interface{} внутри функции
func process() error {
    var result error
    // ... логика, которая может установить result
    return result  // может быть typed nil!
}

// ✅ Хорошо: создаём error только когда нужно
func process() error {
    // ... логика
    if somethingWrong {
        return &MyError{...}
    }
    return nil
}
```

## Проверка nil pointer в interface

Иногда нужно проверить, является ли значение внутри интерфейса nil pointer.

### Через reflect

```go
func isNilInterface(i interface{}) bool {
    if i == nil {
        return true
    }
    v := reflect.ValueOf(i)
    switch v.Kind() {
    case reflect.Ptr, reflect.Map, reflect.Slice, reflect.Chan, reflect.Func:
        return v.IsNil()
    }
    return false
}

// Использование
var err error = (*MyError)(nil)
fmt.Println(err == nil)           // false
fmt.Println(isNilInterface(err))  // true
```

`IsNil` разрешён только для ptr/map/slice/chan/func; для `int/struct/string` будет panic.

### Осторожно с производительностью

```go
// reflect.ValueOf/IsNil могут аллоцировать — не для hot path!
func BenchmarkReflectIsNil(b *testing.B) {
    var err error = (*MyError)(nil)
    for i := 0; i < b.N; i++ {
    _ = isNilInterface(err)  // порядок десятков ns/op, возможна аллокация
    }
}
```

Подходит для диагностики и тестов, не для hot path.

## nil Interface Method Call

### Panic на true nil

```go
var w io.Writer  // true nil interface
w.Write([]byte("hello"))  // 💥 PANIC: nil pointer dereference
```

Причина: у `w` нет типа и данных; `tab == nil` → panic.

### Работает на typed nil (если метод обрабатывает nil)

```go
type SafeWriter struct {
    w io.Writer
}

func (s *SafeWriter) Write(p []byte) (int, error) {
    if s == nil {
        return 0, errors.New("SafeWriter is nil")
    }
    return s.w.Write(p)
}

var w io.Writer = (*SafeWriter)(nil)
n, err := w.Write([]byte("hello"))  // err = "SafeWriter is nil"
```

Интерфейс **не nil**, есть тип `*SafeWriter`, поэтому метод вызывается; дальше всё решает логика метода.

<NilInterfaceDemo />

## Распространённые ловушки

### Ловушка 1: error return в функции

```go
func readFile(path string) ([]byte, error) {
    var fileErr *os.PathError  // typed nil

    data, err := os.ReadFile(path)
    if err != nil {
        if pe, ok := err.(*os.PathError); ok {
            fileErr = pe
        }
    }

return data, fileErr  // 🐞 BUG: fileErr может быть (*os.PathError)(nil)
}

// ✅ Фикс:
func readFile(path string) ([]byte, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        if pe, ok := err.(*os.PathError); ok {
            return nil, pe  // конкретное значение
        }
        return nil, err
    }
return data, nil  // явный nil
}
```

Суть ловушки: typed nil «прячется» в интерфейсе и делает `err != nil` истинным.

### Ловушка 2: struct с interface полями

```go
type Service struct {
    logger Logger  // interface
}

func NewService() *Service {
    return &Service{
        // logger не инициализирован — nil interface
    }
}

func (s *Service) DoSomething() {
    s.logger.Log("doing something")  // 💥 PANIC если logger == nil
}

// ✅ Фикс (вариант 1): явная проверка
func (s *Service) DoSomething() {
    if s.logger != nil {
        s.logger.Log("doing something")
    }
}

// ✅ Фикс (вариант 2): паттерн Null Object
type noopLogger struct{}
func (noopLogger) Log(string) {}

func NewService() *Service {
    return &Service{
        logger: noopLogger{},  // никогда не nil
    }
}
```

:::tip
Выберите один вариант: либо всегда проверяйте `s.logger` перед вызовом, либо задайте default logger (Null Object) при создании `Service`, чтобы `logger` никогда не был nil.
:::

Поле-интерфейс по умолчанию `nil`; вызов без проверки приводит к panic.

### Ловушка 3: присваивание в условии

```go
func getConnection() (net.Conn, error) {
    var conn *net.TCPConn

    if shouldUseTCP() {
        conn = dial()  // может вернуть nil
    }
    
    return conn, nil  // 🐞 BUG: conn может быть (*net.TCPConn)(nil)
}

// ✅ Фикс:
func getConnection() (net.Conn, error) {
    if shouldUseTCP() {
        conn := dial()
        if conn != nil {
            return conn, nil
        }
    }
    return nil, errors.New("no connection")
}
```

Ловушка: typed nil `*net.TCPConn` становится **ненулевым** интерфейсом.

### Ловушка 4: generic code

```go
func First[T any](items []T) T {
    if len(items) == 0 {
        var zero T
        return zero  // Может быть проблема с interfaces!
    }
    return items[0]
}

// Если T = error:
var errs []error
first := First(errs)  // first = nil (но правильный nil)

// Если T = io.Reader и items содержит (*os.File)(nil):
readers := []io.Reader{(*os.File)(nil)}
first := First(readers)  // first != nil (typed nil)
```

Если `T` — интерфейс, можно вернуть typed nil с сохранённым dynamic type. Проверяйте в месте формирования слайса.

## Сравнение двух интерфейсов

```go
var a error = (*MyError)(nil)
var b error = (*OtherError)(nil)

fmt.Println(a == nil)  // false
fmt.Println(b == nil)  // false
fmt.Println(a == b)    // false — разные типы!
```

Интерфейсы равны, только если:
1. Оба nil
2. Одинаковый dynamic type И равные значения

## Checklist: избегаем nil interface trap

1. **Не объявляйте typed nil переменные для возврата error**
   ```go
   // ❌ Плохо
   var err *MyError
   return err

   // ✅ Хорошо
   return nil
   ```

2. **Проверяйте конкретный тип перед присваиванием интерфейсу**
   ```go
   if concretePtr != nil {
       return concretePtr
   }
   return nil
   ```

3. **Используйте Null Object pattern для обязательных interface полей**

4. **В тестах проверяйте `err == nil` и `err != nil`, не полагайтесь на значения**

5. **При работе с reflection помните о производительности**

## Выводы

1. **Интерфейс != nil**, если хранит информацию о типе, даже при nil data

2. **Причина:** Go сохраняет type info для reflection и method dispatch на nil receiver

3. **Решение:** явно возвращайте `nil`, не typed nil переменные

4. **Проверка через reflect** возможна, но дорогая — не для hot path

5. **Null Object pattern** помогает избежать проверок на nil везде

## Sources

- [Go spec: Interface types](https://go.dev/ref/spec#Interface_types)
- [Go spec: Comparison operators](https://go.dev/ref/spec#Comparison_operators)
- [pkg: reflect](https://pkg.go.dev/reflect)
