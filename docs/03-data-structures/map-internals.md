# Map Internals

Map в Go — это **pointer type**. Переменная `map[K]V` содержит указатель на структуру `runtime.hmap`. Это объясняет, почему map ведёт себя как reference type: передача в функцию не копирует данные.

## Memory Layout

```
Stack                          Heap
┌─────────┐      ┌─────────────────────────────────────────────────────┐
│ *hmap ──┼─────▶│ hmap                                                │
└─────────┘      │ ┌────────────────────────────────────────────────┐  │
   8 bytes       │ │ count     int           // количество элементов│  │
                 │ │ flags     uint8         // состояние итерации  │  │
                 │ │ B         uint8         // log₂(buckets)       │  │
                 │ │ noverflow uint16        // overflow buckets    │  │
                 │ │ hash0     uint32        // hash seed           │  │
                 │ │ buckets   *bmap         // массив buckets      │  │
                 │ │ oldbuckets *bmap        // при evacuation      │  │
                 │ │ nevacuate uintptr       // прогресс evacuation │  │
                 │ └────────────────────────────────────────────────┘  │
                 │           │                                         │
                 │           ▼                                         │
                 │ ┌─────────────────────────────────────────────────┐ │
                 │ │ buckets: [bucket0][bucket1]...[bucket_2^B]      │ │
                 │ │          ├─tophash[8]─┤  // верхние биты хеша   │ │
                 │ │          ├─keys[8]────┤  // 8 ключей            │ │
                 │ │          ├─values[8]──┤  // 8 значений          │ │
                 │ │          └─overflow───┘  // указатель на след.  │ │
                 │ └─────────────────────────────────────────────────┘ │
                 └─────────────────────────────────────────────────────┘
```

## hmap структура

```go
// runtime/map.go
type hmap struct {
    count     int            // количество элементов (len)
    flags     uint8          // флаги состояния (iterator, oldIterator, etc)
    B         uint8          // log₂ количества buckets (2^B buckets)
    noverflow uint16         // приблизительное число overflow buckets
    hash0     uint32         // hash seed (рандомизация)
    buckets   unsafe.Pointer // массив из 2^B buckets
    oldbuckets unsafe.Pointer // предыдущий массив (во время роста)
    nevacuate uintptr        // прогресс эвакуации (< nevacuate перемещены)
    extra     *mapextra      // опциональные поля
}
```

## Bucket (bmap) структура

Каждый bucket хранит до **8 пар ключ-значение**:

```go
// runtime/map.go
type bmap struct {
    tophash [bucketCnt]uint8 // верхние 8 бит хеша каждого ключа
    // За этим следуют bucketCnt ключей и bucketCnt значений
    // Затем overflow pointer
}

const bucketCnt = 8
```

**Почему tophash?**
- Быстрая проверка: сначала сравниваем 1 байт tophash
- Если не совпал — пропускаем дорогое сравнение ключа
- Cache-friendly: все tophash рядом в памяти

```
Bucket layout в памяти:
┌────────────────────────────────────────────────────────────┐
│ tophash[0] tophash[1] ... tophash[7]  │  8 bytes           │
├────────────────────────────────────────────────────────────┤
│ key[0] key[1] ... key[7]              │  8 × sizeof(K)     │
├────────────────────────────────────────────────────────────┤
│ value[0] value[1] ... value[7]        │  8 × sizeof(V)     │
├────────────────────────────────────────────────────────────┤
│ overflow *bmap                        │  8 bytes (pointer) │
└────────────────────────────────────────────────────────────┘
```

::: tip Оптимизация layout
Ключи и значения хранятся **отдельными массивами** (не парами), чтобы избежать padding при разных размерах K и V.
:::

## Hash function и lookup

```go
// Упрощённая логика поиска
func mapaccess(h *hmap, key K) V {
    hash := h.hash0 ^ hash(key)

    // Выбор bucket: младшие B бит хеша
    bucket := hash & (1<<h.B - 1)

    // tophash: старшие 8 бит
    top := uint8(hash >> (64 - 8))

    b := (*bmap)(h.buckets + bucket*bucketSize)
    for {
        for i := 0; i < 8; i++ {
            if b.tophash[i] != top {
                continue  // быстрый skip
            }
            if b.keys[i] == key {
                return b.values[i]  // нашли!
            }
        }
        b = b.overflow
        if b == nil {
            return zeroValue
        }
    }
}
```

## Load factor и рост

Map растёт когда **load factor** превышает порог:

```go
const (
    loadFactorNum = 13
    loadFactorDen = 2
    // loadFactor = 13/2 = 6.5
)

// Условие роста
func overLoadFactor(count int, B uint8) bool {
    return count > bucketCnt &&
           uintptr(count) > loadFactorNum*(1<<B)/loadFactorDen
}
```

**Load factor 6.5** означает: в среднем 6.5 элементов на bucket (из 8 возможных).

### Evacuation (инкрементальный рост)

При росте map **не копируется сразу** — это было бы O(n) latency spike.

```
До роста (B=2, 4 buckets):
┌────────┬────────┬────────┬────────┐
│ buck 0 │ buck 1 │ buck 2 │ buck 3 │
└────────┴────────┴────────┴────────┘

После начала роста (B=3, 8 buckets):
oldbuckets:
┌────────┬────────┬────────┬────────┐
│ buck 0 │ buck 1 │ buck 2 │ buck 3 │  ← постепенно эвакуируются
└────────┴────────┴────────┴────────┘

buckets:
┌────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│ buck 0 │ buck 1 │ buck 2 │ buck 3 │ buck 4 │ buck 5 │ buck 6 │ buck 7 │
└────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘
```

При каждой операции записи эвакуируется **1-2 bucket** из old → new:

```go
func mapassign(h *hmap, key K) *V {
    if h.growing() {
        growWork(h, bucket)  // эвакуировать 1-2 buckets
    }
    // ... обычная вставка
}
```

## Ключевые константы

| Параметр | Значение | Описание |
|----------|----------|----------|
| `bucketCnt` | 8 | Пар ключ-значение в bucket |
| Load factor | 6.5 | Порог для роста |
| `minTopHash` | 5 | Значения 0-4 зарезервированы для статуса |
| `sameSizeGrow` | — | Рост без увеличения (при много overflow) |

## Iteration randomization

Go **рандомизирует порядок итерации** при каждом `range`:

```go
m := map[string]int{"a": 1, "b": 2, "c": 3}

// Каждый запуск может дать разный порядок
for k, v := range m {
    fmt.Println(k, v)
}
```

**Зачем:**
1. **Защита от hash-DoS** — атакующий не может предсказать порядок
2. **Предотвращение зависимости** — код не должен полагаться на порядок

```go
// runtime/map.go
func mapiterinit(h *hmap, it *hiter) {
    // Случайный стартовый bucket
    r := uintptr(fastrand())
    it.startBucket = r & bucketMask(h.B)
    it.offset = uint8(r >> h.B & (bucketCnt - 1))
}
```

## Специализированные реализации

Для частых типов ключей Go использует оптимизированные функции:

| Файл | Типы ключей | Оптимизация |
|------|-------------|-------------|
| `map_fast32.go` | `int32`, `uint32` | Inline hash, no alloc |
| `map_fast64.go` | `int64`, `uint64`, pointers | Inline hash |
| `map_faststr.go` | `string` | Оптимизированное сравнение |

```go
// Компилятор автоматически выбирает:
m1 := make(map[int]string)     // → map_fast64
m2 := make(map[string]int)     // → map_faststr
m3 := make(map[MyStruct]int)   // → generic map.go
```

## Pre-allocation

```go
// ❌ Avoid: множественные evacuations
m := make(map[string]int)  // начальный размер
for i := 0; i < 10000; i++ {
    m[keys[i]] = values[i]  // несколько эвакуаций
}

// ✅ Better: hint для начального размера
m := make(map[string]int, len(keys))
for i := 0; i < 10000; i++ {
    m[keys[i]] = values[i]  // 0 эвакуаций
}
```

::: tip Как работает hint
`make(map[K]V, hint)` вычисляет начальное B так, чтобы `2^B × 6.5 >= hint`.
Для hint=10000: B=11 → 2048 buckets × 6.5 ≈ 13312 capacity.
:::

## Безопасное удаление при итерации

```go
// ✅ Safe: удаление во время range
for k, v := range m {
    if shouldDelete(v) {
        delete(m, k)  // безопасно в Go
    }
}
```

Go **гарантирует** безопасность `delete` во время итерации:
- Удалённый элемент не будет возвращён (если ещё не был)
- Итератор не сломается

```go
// ✅ Alternative: collect-then-delete (clearer intent)
var toDelete []string
for k, v := range m {
    if shouldDelete(v) {
        toDelete = append(toDelete, k)
    }
}
for _, k := range toDelete {
    delete(m, k)
}
```

## Частые ошибки

### Nil map

```go
var m map[string]int

_ = m["key"]     // ✅ OK — вернёт zero value (0)
m["key"] = 1     // ❌ panic: assignment to entry in nil map
```

**Решение:** всегда инициализируй map перед записью:

```go
m := make(map[string]int)
// или
m := map[string]int{}
```

::: info Оба варианта идентичны?
Да, функционально одинаковы — оба вызывают `runtime.makemap_small()` и создают пустой map с `len=0`. Buckets выделяются лениво при первой записи.

**Единственное отличие** — `make` позволяет задать size hint:

```go
m := make(map[string]int, 1000)  // pre-allocate buckets для ~1000 элементов
```

Composite literal `map[K]V{}` size hint не поддерживает. Используй `make` с hint когда знаешь примерный размер — это избежит rehashing при росте map.
:::

### Нет стабильных адресов

```go
m := map[string]Data{"key": {Field: 1}}

ptr := &m["key"]        // ❌ не компилируется
m["key"].Field = 2      // ❌ не компилируется
```

**Почему:** при evacuation элементы перемещаются → адрес может стать невалидным.

**Решения:**

```go
// 1. Извлечь → модифицировать → записать
d := m["key"]
d.Field = 2
m["key"] = d

// 2. Хранить указатели
m := map[string]*Data{"key": {Field: 1}}
m["key"].Field = 2  // ✅ OK — меняем данные, не map
```

### Concurrent access

```go
// ❌ Data race!
go func() { m["a"] = 1 }()
go func() { _ = m["a"] }()
```

Map **не thread-safe**. Runtime детектирует concurrent write и **паникует**:

```go
fatal error: concurrent map writes
```

::: warning Почему map не thread-safe?
Это осознанное решение Go team. Добавление встроенной синхронизации:
- Замедлило бы **все** операции с map (даже однопоточные)
- Большинство map используются в single-threaded контексте
- Разные use-cases требуют разных стратегий синхронизации
:::

#### Решение 1: sync.RWMutex (универсальное)

Подходит для большинства случаев. `RWMutex` позволяет **множественное чтение** при отсутствии записи.

```go
type SafeCache struct {
    mu   sync.RWMutex
    data map[string][]byte
}

// Чтение — RLock позволяет параллельные читатели
func (c *SafeCache) Get(key string) ([]byte, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()

    val, ok := c.data[key]
    return val, ok
}

// Запись — Lock блокирует всех
func (c *SafeCache) Set(key string, val []byte) {
    c.mu.Lock()
    defer c.mu.Unlock()

    c.data[key] = val
}

// Delete — тоже требует эксклюзивный лок
func (c *SafeCache) Delete(key string) {
    c.mu.Lock()
    defer c.mu.Unlock()

    delete(c.data, key)
}

// Iteration — держим RLock на всё время итерации
func (c *SafeCache) Keys() []string {
    c.mu.RLock()
    defer c.mu.RUnlock()

    keys := make([]string, 0, len(c.data))
    for k := range c.data {
        keys = append(keys, k)
    }
    return keys
}
```

::: danger Типичная ошибка: RLock + запись
```go
func (c *SafeCache) GetOrCreate(key string, create func() []byte) []byte {
    c.mu.RLock()
    if val, ok := c.data[key]; ok {
        c.mu.RUnlock()
        return val
    }
    c.mu.RUnlock()

    // ❌ RACE CONDITION! Другая горутина может создать ключ между Unlock и Lock
    c.mu.Lock()
    c.data[key] = create()
    c.mu.Unlock()
    return c.data[key]
}
```

**Правильно — double-check locking:**
```go
func (c *SafeCache) GetOrCreate(key string, create func() []byte) []byte {
    // Fast path: проверяем с RLock
    c.mu.RLock()
    if val, ok := c.data[key]; ok {
        c.mu.RUnlock()
        return val
    }
    c.mu.RUnlock()

    // Slow path: берём полный лок и проверяем снова
    c.mu.Lock()
    defer c.mu.Unlock()

    // Double-check: возможно другая горутина уже создала
    if val, ok := c.data[key]; ok {
        return val
    }

    val := create()
    c.data[key] = val
    return val
}
```
:::

#### Решение 2: sync.Map (для специфичных паттернов)

`sync.Map` оптимизирован для двух сценариев:
1. **Write-once, read-many** — ключ записывается один раз, потом только читается
2. **Disjoint writes** — разные горутины пишут в разные ключи (нет contention)

```go
var cache sync.Map

// Store — запись
cache.Store("user:123", User{Name: "Alice"})

// Load — чтение
if val, ok := cache.Load("user:123"); ok {
    user := val.(User)  // type assertion обязателен
    fmt.Println(user.Name)
}

// LoadOrStore — атомарный get-or-set
actual, loaded := cache.LoadOrStore("user:456", User{Name: "Bob"})
// loaded=true  → ключ существовал, actual = старое значение
// loaded=false → ключ создан, actual = новое значение

// LoadAndDelete — атомарный get-and-remove
val, loaded := cache.LoadAndDelete("user:123")

// Delete — удаление
cache.Delete("user:123")

// Range — итерация (не атомарна для всей map!)
cache.Range(func(key, value any) bool {
    fmt.Printf("%v: %v\n", key, value)
    return true  // false для раннего выхода
})
```

::: tip Когда sync.Map лучше RWMutex
```go
// ✅ Хорошо для sync.Map: кеш конфигов (write-once)
var configCache sync.Map

func GetConfig(service string) Config {
    if val, ok := configCache.Load(service); ok {
        return val.(Config)
    }
    cfg := loadConfigFromDB(service)
    configCache.Store(service, cfg)
    return cfg
}

// ✅ Хорошо для sync.Map: per-connection state (disjoint keys)
var connState sync.Map  // key = connID

func HandleConnection(connID string) {
    connState.Store(connID, &State{})  // каждая горутина пишет в свой ключ
    defer connState.Delete(connID)
    // ...
}
```
:::

::: warning Когда НЕ использовать sync.Map
```go
// ❌ Плохо: частые записи в одни и те же ключи
var counters sync.Map
func Increment(key string) {
    // Это НЕ атомарно!
    val, _ := counters.Load(key)
    counters.Store(key, val.(int)+1)  // race condition
}

// ❌ Плохо: нужен len() или полная итерация
// sync.Map не имеет метода Len()

// ❌ Плохо: нужна типобезопасность
// Все значения — any, нужны type assertions
```

**Для счётчиков используй:**
```go
var counters sync.Map

func Increment(key string) int64 {
    for {
        val, _ := counters.LoadOrStore(key, new(atomic.Int64))
        counter := val.(*atomic.Int64)
        return counter.Add(1)
    }
}
```
:::

#### Решение 3: Sharded map (высокая нагрузка)

При высоком contention на mutex, шардирование распределяет нагрузку:

```go
const numShards = 32

type ShardedMap struct {
    shards [numShards]struct {
        mu   sync.RWMutex
        data map[string]any
    }
}

func NewShardedMap() *ShardedMap {
    sm := &ShardedMap{}
    for i := range sm.shards {
        sm.shards[i].data = make(map[string]any)
    }
    return sm
}

// FNV-1a hash для выбора шарда
func (sm *ShardedMap) getShard(key string) *struct {
    mu   sync.RWMutex
    data map[string]any
} {
    h := fnv.New32a()
    h.Write([]byte(key))
    return &sm.shards[h.Sum32()%numShards]
}

func (sm *ShardedMap) Get(key string) (any, bool) {
    shard := sm.getShard(key)
    shard.mu.RLock()
    defer shard.mu.RUnlock()

    val, ok := shard.data[key]
    return val, ok
}

func (sm *ShardedMap) Set(key string, val any) {
    shard := sm.getShard(key)
    shard.mu.Lock()
    defer shard.mu.Unlock()

    shard.data[key] = val
}
```

::: tip Когда нужен sharding
- > 100K операций/сек на одну map
- Профилировщик показывает contention на mutex
- Ключи равномерно распределены (хешируются в разные шарды)

**Популярные библиотеки:**
- [orcaman/concurrent-map](https://github.com/orcaman/concurrent-map) — готовая реализация
- [puzpuzpuz/xsync](https://github.com/puzpuzpuz/xsync) — MapOf с дженериками
:::

#### Сравнение подходов

| Критерий | `RWMutex` | `sync.Map` | Sharded |
|----------|-----------|------------|---------|
| **Типобезопасность** | ✅ | ❌ (any) | ✅ |
| **len()** | ✅ | ❌ | ⚠️ (сумма шардов) |
| **Read-heavy** | хорошо | отлично | хорошо |
| **Write-heavy** | плохо | плохо | хорошо |
| **Сложность** | низкая | низкая | средняя |
| **Memory overhead** | низкий | высокий | средний |

**Рекомендация:** начни с `sync.RWMutex`. Переходи на альтернативы только когда профилировщик покажет проблему.

## Пакет maps (Go 1.21+)

Стандартный пакет `maps` для типовых операций.

```go
import "maps"

// ═══════════════════════════════════════════════════════════════════════════
// КОПИРОВАНИЕ
// ═══════════════════════════════════════════════════════════════════════════

original := map[string]int{"a": 1, "b": 2, "c": 3}

// Clone — shallow copy
clone := maps.Clone(original)
clone["a"] = 999  // original["a"] остаётся 1

// Copy — копировать src в dst (перезаписывает существующие ключи)
dst := map[string]int{"x": 10}
maps.Copy(dst, original)  // dst = {"x": 10, "a": 1, "b": 2, "c": 3}

// ═══════════════════════════════════════════════════════════════════════════
// ИТЕРАЦИЯ (Go 1.23+)
// ═══════════════════════════════════════════════════════════════════════════

m := map[string]int{"alice": 30, "bob": 25}

// Keys и Values возвращают iterator
for k := range maps.Keys(m) {
    fmt.Println(k)
}

// Для slice используй slices.Collect
keys := slices.Collect(maps.Keys(m))
values := slices.Collect(maps.Values(m))

// ═══════════════════════════════════════════════════════════════════════════
// МОДИФИКАЦИЯ И СРАВНЕНИЕ
// ═══════════════════════════════════════════════════════════════════════════

// DeleteFunc — удаление по условию
maps.DeleteFunc(m, func(k string, v int) bool {
    return v < 30
})

// Equal — сравнение
maps.Equal(m1, m2)  // true если равны

// EqualFunc — кастомное сравнение значений
maps.EqualFunc(m1, m2, func(v1, v2 int) bool {
    return abs(v1-v2) < 5
})
```

## samber/lo для map

```go
import "github.com/samber/lo"

m := map[string]int{"a": 1, "b": 2, "c": 3}

// Keys и Values — сразу как slice (без iterator)
keys := lo.Keys(m)      // []string{"a", "b", "c"}
values := lo.Values(m)  // []int{1, 2, 3}

// Invert — поменять местами ключи и значения
inverted := lo.Invert(m)  // map[int]string{1: "a", 2: "b", 3: "c"}

// MapKeys / MapValues — трансформация
upper := lo.MapKeys(m, func(v int, k string) string {
    return strings.ToUpper(k)
})  // map[string]int{"A": 1, "B": 2, "C": 3}

// KeyBy — создать map из slice
users := []User{{ID: 1, Name: "Alice"}, {ID: 2, Name: "Bob"}}
byID := lo.KeyBy(users, func(u User) int {
    return u.ID
})  // map[int]User{1: {Alice}, 2: {Bob}}

// Entries / FromEntries — map ↔ []Tuple
entries := lo.Entries(m)  // []lo.Entry[string, int]
m2 := lo.FromEntries(entries)
```

::: tip Когда что использовать
| Задача | stdlib `maps` | `samber/lo` |
|--------|---------------|-------------|
| Clone, Copy | ✅ | — |
| Equal, DeleteFunc | ✅ | — |
| Keys/Values (iterator) | ✅ Go 1.23+ | — |
| **Keys/Values (slice)** | ❌ | ✅ |
| **Invert, MapKeys/Values** | ❌ | ✅ |
| **KeyBy** (slice → map) | ❌ | ✅ |
| **Entries/FromEntries** | ❌ | ✅ |
:::

## Файлы runtime/

| Файл | Назначение |
|------|------------|
| `runtime/map.go` | Основная реализация, hmap, bmap |
| `runtime/map_fast32.go` | Оптимизация для int32/uint32 ключей |
| `runtime/map_fast64.go` | Оптимизация для int64/uint64/pointer ключей |
| `runtime/map_faststr.go` | Оптимизация для string ключей |

## Дальнейшее чтение

- [Go maps in action](https://go.dev/blog/maps) — официальный блог
- [How the Go runtime implements maps efficiently](https://dave.cheney.net/2018/05/29/how-the-go-runtime-implements-maps-efficiently-without-generics) — Dave Cheney
- [maps package](https://pkg.go.dev/maps) — документация
- Исходники: `$GOROOT/src/runtime/map.go`
