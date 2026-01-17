# Channels

::: warning WIP
Эта страница в разработке
:::

## runtime.hchan структура

```go
type hchan struct {
    qcount   uint           // количество элементов в буфере
    dataqsiz uint           // размер буфера
    buf      unsafe.Pointer // ring buffer
    sendx    uint           // send index
    recvx    uint           // receive index
    sendq    waitq          // очередь ожидающих отправителей
    recvq    waitq          // очередь ожидающих получателей
    lock     mutex
}
```

## Темы для раскрытия

- Unbuffered vs buffered channels
- Send/receive blocking механика
- Select implementation
- Channel closing и broadcast pattern
