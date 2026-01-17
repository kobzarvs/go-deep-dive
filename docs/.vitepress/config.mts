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
      { text: 'GitHub', link: 'https://github.com/YOUR_USERNAME/go-deep-dive' }
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
        collapsed: true,
        items: [
          { text: 'Введение', link: '/02-concurrency/' },
          { text: 'Goroutines', link: '/02-concurrency/goroutines' },
          { text: 'Channels', link: '/02-concurrency/channels' },
          { text: 'Context', link: '/02-concurrency/context' },
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
        text: '4. Generics',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/04-generics/' },
        ]
      },
      {
        text: '5. Stdlib Magic',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/05-stdlib-magic/' },
        ]
      },
      {
        text: '6. Errors & Observability',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/06-errors-observability/' },
        ]
      },
      {
        text: '7. Architecture',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/07-architecture/' },
        ]
      },
      {
        text: '8. Microservices',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/08-microservices/' },
        ]
      },
      {
        text: '9. Databases',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/09-databases/' },
        ]
      },
      {
        text: '10. Testing & Optimization',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/10-testing/' },
        ]
      },
      {
        text: '11. Security',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/11-security/' },
        ]
      },
      {
        text: '12. Infrastructure',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/12-infrastructure/' },
        ]
      },
      {
        text: '13. System Design',
        collapsed: true,
        items: [
          { text: 'Введение', link: '/13-system-design/' },
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/YOUR_USERNAME/go-deep-dive' }
    ],
    
    search: {
      provider: 'local'
    },
    
    outline: {
      level: [2, 3],
      label: 'На этой странице'
    },
    
    editLink: {
      pattern: 'https://github.com/YOUR_USERNAME/go-deep-dive/edit/main/docs/:path',
      text: 'Редактировать на GitHub'
    },
    
    lastUpdated: {
      text: 'Обновлено',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'short'
      }
    },
    
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
