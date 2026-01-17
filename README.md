# Go Deep Dive

Go 1.25 для Senior разработчиков — runtime, memory, concurrency без воды.

## 🚀 Quick Start

```bash
# Клонировать
git clone https://github.com/kobzarvs/go-deep-dive.git
cd go-deep-dive

# Установить зависимости
npm install

# Запустить dev сервер
npm run dev

# Открыть http://localhost:5173
```

## 📁 Структура проекта

```
go-deep-dive/
├── docs/                    # Контент книги (VitePress)
│   ├── .vitepress/
│   │   └── config.mts       # Конфиг VitePress
│   ├── 01-runtime/          # Часть 1: Runtime & Memory
│   ├── 02-concurrency/      # Часть 2: Concurrency
│   ├── 03-data-structures/  # Часть 3: Data Structures
│   │   ├── index.md
│   │   ├── slice-append.md  # ✅ Готово
│   │   └── ...
│   ├── ...
│   └── index.md             # Главная страница
├── components/              # Vue компоненты для инфографики
├── public/                  # Статика (картинки, CSS)
├── package.json
└── README.md
```

## 📝 Как добавить главу

1. Создать `.md` файл в нужной папке
2. Добавить ссылку в `docs/.vitepress/config.mts` → `sidebar`
3. Использовать Markdown + Vue компоненты для инфографики

## 🎨 Инфографика

Сложные визуализации делаем как Vue компоненты в `components/`:

```vue
<script setup>
// SliceMemoryDiagram.vue
</script>

<template>
  <div class="memory-diagram">
    <!-- SVG / Canvas визуализация -->
  </div>
</template>
```

Использование в Markdown:
```md
<SliceMemoryDiagram :data="[1, 2, 3]" />
```

## 🔨 Команды

| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev сервер с hot reload |
| `npm run build` | Билд для продакшена |
| `npm run preview` | Превью билда |

## 📚 Содержание

1. **Runtime & Memory** — GMP, GC, Stack/Heap
2. **Concurrency** — Goroutines, Channels, Context
3. **Data Structures** — Slice, Map, String internals
4. **Generics** — Type parameters, constraints
5. **Stdlib Magic** — unsafe, reflect, cgo
6. **Errors & Observability** — errors.Is/As, slog, OpenTelemetry
7. **Architecture** — Clean Architecture, DDD, DI
8. **Microservices** — gRPC, HTTP/2, net/http
9. **Databases** — SQL drivers, connection pools
10. **Testing & Optimization** — pprof, trace, fuzzing
11. **Security** — FIPS 140-3, crypto
12. **Infrastructure** — Docker, K8s, modules
13. **System Design** — Soft skills, интервью

## 🎯 Целевая аудитория

- Senior Go разработчики
- Готовящиеся к System Design интервью
- Любопытные о runtime internals

## 📜 License

MIT
