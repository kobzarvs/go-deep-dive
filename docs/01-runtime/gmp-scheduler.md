# GMP Scheduler

::: warning WIP
Эта страница в разработке
:::

## G-M-P модель

```
G (Goroutine) — легковесный "поток" Go
M (Machine)   — OS thread
P (Processor) — логический процессор, контекст выполнения
```

## Темы для раскрытия

- Work stealing алгоритм
- Local Run Queue vs Global Run Queue
- Preemption (cooperative vs async в Go 1.14+)
- GOMAXPROCS и container-aware настройки в Go 1.25
- Parking/Unparking горутин
