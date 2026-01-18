---
layout: home

hero:
  name: "Go Deep Dive"
  text: "Go 1.25 для Senior разработчиков"
  tagline: Runtime, Memory, Concurrency — без воды, только механика
  actions:
    - theme: brand
      text: Начать читать
      link: /01-runtime/
    - theme: alt
      text: GitHub
      link: https://github.com/kobzarvs/go-deep-dive

features:
  - icon: ⚡
    title: Runtime & Memory
    details: GMP Scheduler, Garbage Collector "Green Tea", Stack vs Heap, DWARF 5
    link: /01-runtime/
    linkText: Читать →
  - icon: 🔄
    title: Concurrency
    details: Goroutines internals, Channels, Context, testing/synctest
    link: /02-concurrency/
    linkText: Читать →
  - icon: 📊
    title: Data Structures
    details: Slice, Map, String internals — как они устроены под капотом
    link: /03-data-structures/
    linkText: Читать →
  - icon: 🧬
    title: Generics
    details: Type parameters, constraints, core types removal в Go 1.25
    link: /04-generics/
    linkText: Читать →
  - icon: 🔮
    title: Stdlib Magic
    details: unsafe, reflect, cgo, compiler directives, go:embed
    link: /05-stdlib-magic/
    linkText: Читать →
  - icon: 📈
    title: Testing & Profiling
    details: pprof, trace, FlightRecorder API, fuzzing, bisect tool
    link: /10-testing/
    linkText: Читать →
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

---

## Об авторе

**Valeriy Kobzar** — Software Engineer

- GitHub: [@kobzarvs](https://github.com/kobzarvs)
- Email: [kobzarvs@gmail.com](mailto:kobzarvs@gmail.com)
