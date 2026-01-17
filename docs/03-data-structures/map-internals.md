# Map Internals

::: warning WIP
Эта страница в разработке
:::

## hmap структура

```go
// runtime/map.go
type hmap struct {
    count     int
    flags     uint8
    B         uint8   // log_2 количества buckets
    noverflow uint16
    hash0     uint32  // hash seed
    buckets   unsafe.Pointer
    oldbuckets unsafe.Pointer
    nevacuate uintptr
    extra     *mapextra
}
```

## Темы для раскрытия

- Bucket structure (bmap)
- Hash function и collision resolution
- Evacuation при росте
- Map iteration randomization
