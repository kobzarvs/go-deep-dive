---
layout: home

hero:
  name: "Go Deep Dive"
  text: "Go 1.25 для Senior разработчиков"
  tagline: Runtime, Memory, Concurrency — без воды, только механика
  image:
    src: /images/gopher-deep.svg
    alt: Go Gopher Deep Dive
  actions:
    - theme: brand
      text: Начать читать
      link: /01-runtime/
    - theme: alt
      text: GitHub
      link: https://github.com/YOUR_USERNAME/go-deep-dive

features:
  - icon: ⚡
    title: Runtime & Memory
    details: GMP Scheduler, Garbage Collector "Green Tea", Stack vs Heap, DWARF 5
  - icon: 🔄
    title: Concurrency
    details: Goroutines internals, Channels, Context, testing/synctest
  - icon: 📊
    title: Data Structures
    details: Slice, Map, String internals — как они устроены под капотом
  - icon: 🧬
    title: Generics
    details: Type parameters, constraints, core types removal в Go 1.25
  - icon: 🔮
    title: Stdlib Magic
    details: unsafe, reflect, cgo, compiler directives, go:embed
  - icon: 📈
    title: Testing & Profiling
    details: pprof, trace, FlightRecorder API, fuzzing, bisect tool
---

## О книге

Эта книга для тех, кто уже знает Go и хочет понять **как он работает внутри**.

Никаких "что такое переменная" — только:
- Реальные структуры данных из `runtime/`
- Код который можно запустить и проверить
- Инфографика в стиле Engineering Blueprint

## Целевая аудитория

- Senior Go разработчики
- Те кто готовится к System Design интервью
- Те кому интересно как работает runtime

## Go 1.25+

Книга ориентирована на Go 1.25 (август 2025):
- Container-aware GOMAXPROCS
- Experimental "Green Tea" GC
- runtime/trace.FlightRecorder API
- Experimental encoding/json/v2
- DWARF 5 debug info
