# Stack vs Heap

::: warning WIP
Эта страница в разработке
:::

## Escape Analysis

```bash
go build -gcflags='-m -m' main.go
```

## Темы для раскрытия

- Goroutine stack: начальный размер и рост
- Stack copying vs segmented stacks
- Escape analysis правила
- `//go:noescape` directive
- DWARF 5 debug info в Go 1.25
