# Garbage Collector

::: warning WIP
Эта страница в разработке
:::

## Tri-color Mark & Sweep

```
White — не посещённые объекты (кандидаты на удаление)
Gray  — посещённые, но потомки не проверены
Black — посещённые, потомки проверены (живые)
```

## Темы для раскрытия

- Write barrier и concurrent marking
- GC pacing и GOGC
- Memory ballast pattern
- "Green Tea" GC (experimental в Go 1.25)
- Stack scanning
- Finalizers и их проблемы
