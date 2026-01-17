# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Go Deep Dive — техническая книга о Go 1.25 для Senior разработчиков, построенная на VitePress. Контент фокусируется на runtime internals, memory management, concurrency и других продвинутых темах без базовых объяснений.

## Commands

```bash
# Dev server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Architecture

```
docs/                        # VitePress content (Markdown)
├── .vitepress/config.mts    # VitePress config, sidebar, nav
├── 01-runtime/              # GMP, GC, Stack/Heap
├── 02-concurrency/          # Goroutines, Channels, Context
├── 03-data-structures/      # Slice, Map, String internals
├── 04-generics/             # Type parameters, constraints
├── 05-stdlib-magic/         # unsafe, reflect, cgo
├── 06-errors-observability/ # errors.Is/As, slog, OpenTelemetry
├── 07-architecture/         # Clean Architecture, DDD, DI
├── 08-microservices/        # gRPC, HTTP/2
├── 09-databases/            # SQL drivers, connection pools
├── 10-testing/              # pprof, trace, fuzzing
├── 11-security/             # FIPS 140-3, crypto
├── 12-infrastructure/       # Docker, K8s, modules
└── 13-system-design/        # System Design интервью
```

## Content Guidelines

- Язык контента: русский
- Целевая аудитория: Senior Go разработчики
- Стиль: технический, без "воды", с реальными структурами из `runtime/`
- Инфографика: Engineering Blueprint стиль, Vue компоненты в `components/`

## Adding Content

1. Создать `.md` файл в соответствующей папке `docs/XX-topic/`
2. Добавить ссылку в `docs/.vitepress/config.mts` → `sidebar` в нужную секцию
3. Vue компоненты для визуализаций размещать в `components/`

## Important Rules

- **НИКОГДА не запускать `npm run dev`** — dev server всегда запущен у пользователя
- `npm run build` — можно запускать для проверки сборки
