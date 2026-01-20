import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Go Deep Dive',
  description: 'Go 1.25 для Senior разработчиков',
  
  // Русский язык
  lang: 'ru-RU',
  
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap' }],
  ],
  
  themeConfig: {
    logo: '/images/logo.svg',
    
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
