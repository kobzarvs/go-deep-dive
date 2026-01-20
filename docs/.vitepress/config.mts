import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Go Deep Dive',
  description: 'Go 1.25 для Senior разработчиков',
  
  // Русский язык
  lang: 'ru-RU',
  
  head: [
    // Fonts
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap' }],

    // SEO Meta
    ['meta', { name: 'author', content: 'Valeriy Kobzar' }],
    ['meta', { name: 'keywords', content: 'Go, Golang, Go 1.25, runtime, GMP scheduler, garbage collector, concurrency, goroutines, channels, slice, map, generics, Senior разработчик, программирование' }],
    ['meta', { name: 'robots', content: 'index, follow' }],
    ['meta', { name: 'googlebot', content: 'index, follow' }],
    ['link', { rel: 'canonical', href: 'https://go-deep-dive.com/' }],

    // Favicon
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/images/apple-touch-icon.png' }],

    // Open Graph
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Go Deep Dive — Go 1.25 для Senior разработчиков' }],
    ['meta', { property: 'og:description', content: 'Техническая книга о Go: Runtime internals, GMP Scheduler, Garbage Collector, Concurrency, Data Structures. Без воды — только механика.' }],
    ['meta', { property: 'og:image', content: 'https://go-deep-dive.com/images/og-image.jpg' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:url', content: 'https://go-deep-dive.com/' }],
    ['meta', { property: 'og:site_name', content: 'Go Deep Dive' }],
    ['meta', { property: 'og:locale', content: 'ru_RU' }],

    // Twitter Card
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'Go Deep Dive — Go 1.25 для Senior разработчиков' }],
    ['meta', { name: 'twitter:description', content: 'Техническая книга о Go: Runtime internals, GMP Scheduler, Garbage Collector, Concurrency, Data Structures.' }],
    ['meta', { name: 'twitter:image', content: 'https://go-deep-dive.com/images/og-image.jpg' }],

    // JSON-LD Structured Data
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': 'Go Deep Dive',
      'description': 'Техническая книга о Go 1.25 для Senior разработчиков',
      'url': 'https://go-deep-dive.com/',
      'author': {
        '@type': 'Person',
        'name': 'Valeriy Kobzar',
        'url': 'https://github.com/kobzarvs'
      },
      'inLanguage': 'ru-RU',
      'keywords': 'Go, Golang, runtime, concurrency, goroutines, channels'
    })],

    // JSON-LD Book
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Book',
      'name': 'Go Deep Dive',
      'author': {
        '@type': 'Person',
        'name': 'Valeriy Kobzar'
      },
      'url': 'https://go-deep-dive.com/',
      'image': 'https://go-deep-dive.com/images/og-image.jpg',
      'inLanguage': 'ru',
      'genre': 'Программирование',
      'about': 'Go programming language internals'
    })],
  ],

  // Sitemap
  sitemap: {
    hostname: 'https://go-deep-dive.com'
  },
  
  themeConfig: {
    logo: '/images/logo.png',
    
    nav: [
      { text: 'Главная', link: '/' },
      { text: 'Содержание', link: '/01-runtime/' },
      { text: 'GitHub', link: 'https://github.com/kobzarvs/go-deep-dive' }
    ],

    sidebar: [
      {
        text: '1. Runtime & Memory',
        collapsed: false,
        items: [
          { text: 'Введение', link: '/01-runtime/' },
          { text: 'GMP Scheduler', link: '/01-runtime/gmp-scheduler' },
          { text: 'Garbage Collector', link: '/01-runtime/gc' },
          { text: 'Stack vs Heap', link: '/01-runtime/stack-heap' },
        ]
      },
      {
        text: '2. Concurrency',
        collapsed: false,
        items: [
          { text: 'Введение', link: '/02-concurrency/' },
          { text: 'Goroutines', link: '/02-concurrency/goroutines' },
          { text: 'Channels', link: '/02-concurrency/channels' },
          { text: 'Context', link: '/02-concurrency/context' },
          { text: 'sync Primitives', link: '/02-concurrency/sync-primitives' },
          { text: 'Atomic Operations', link: '/02-concurrency/atomic' },
          { text: 'Memory Model', link: '/02-concurrency/memory-model' },
          { text: 'Patterns', link: '/02-concurrency/patterns' },
        ]
      },
      {
        text: '3. Data Structures',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/03-data-structures/' },
          { text: 'Slice Internals', link: '/03-data-structures/slice-internals' },
          { text: 'Slice Append', link: '/03-data-structures/slice-append' },
          { text: 'Map Internals', link: '/03-data-structures/map-internals' },
          { text: 'String & Rune', link: '/03-data-structures/string-rune' },
        ]
      },
      {
        text: '4. Interfaces',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/04-interfaces/' },
        ]
      },
      {
        text: '5. Generics',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/05-generics/' },
        ]
      },
      {
        text: '6. Stdlib Magic',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/06-stdlib-magic/' },
        ]
      },
      {
        text: '7. Errors & Observability',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/07-errors-observability/' },
        ]
      },
      {
        text: '8. Architecture',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/08-architecture/' },
        ]
      },
      {
        text: '9. Microservices',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/09-microservices/' },
        ]
      },
      {
        text: '10. Databases',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/10-databases/' },
        ]
      },
      {
        text: '11. Testing & Optimization',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/11-testing/' },
        ]
      },
      {
        text: '12. Security',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/12-security/' },
        ]
      },
      {
        text: '13. Infrastructure',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/13-infrastructure/' },
        ]
      },
      {
        text: '14. System Design',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/14-system-design/' },
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/kobzarvs/go-deep-dive' }
    ],
    
    search: {
      provider: 'local'
    },
    
    outline: {
      level: [2, 3],
      label: 'На этой странице'
    },
    
    editLink: {
      pattern: 'https://github.com/kobzarvs/go-deep-dive/edit/main/docs/:path',
      text: 'Редактировать на GitHub'
    },
    
    lastUpdated: {
      text: 'Обновлено'
    },

    // Дата форматируется кастомным компонентом LastUpdated.vue
    
    footer: {
      message: 'Go Deep Dive — книга для Senior разработчиков',
      copyright: 'MIT License'
    }
  },
  
  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'one-dark-pro'
    }
  }
})
