import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './custom.css'
import Layout from './Layout.vue'
import SliceMemoryDiagram from './components/SliceMemoryDiagram.vue'
import SliceMutationBug from './components/SliceMutationBug.vue'
import SliceStructure from './components/SliceStructure.vue'
import SliceAppendDebugger from './components/SliceAppendDebugger.vue'
import SliceScenariosDebugger from './components/SliceScenariosDebugger.vue'
import SliceSharedDemo from './components/SliceSharedDemo.vue'
import SliceNewDemo from './components/SliceNewDemo.vue'
import CodeDebugger from './components/CodeDebugger.vue'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('SliceMemoryDiagram', SliceMemoryDiagram)
    app.component('SliceMutationBug', SliceMutationBug)
    app.component('SliceStructure', SliceStructure)
    app.component('SliceAppendDebugger', SliceAppendDebugger)
    app.component('SliceScenariosDebugger', SliceScenariosDebugger)
    app.component('SliceSharedDemo', SliceSharedDemo)
    app.component('SliceNewDemo', SliceNewDemo)
    app.component('CodeDebugger', CodeDebugger)
  }
} satisfies Theme
