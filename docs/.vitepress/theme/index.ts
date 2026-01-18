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
import StackLayoutDiagram from './components/StackLayoutDiagram.vue'
import StackGrowthSimulator from './components/StackGrowthSimulator.vue'
import EscapeAnalysisPlayground from './components/EscapeAnalysisPlayground.vue'
import GMPModelDiagram from './components/GMPModelDiagram.vue'
import WorkStealingSimulator from './components/WorkStealingSimulator.vue'
import SchedulerTraceExplorer from './components/SchedulerTraceExplorer.vue'
import GCPhaseSimulator from './components/GCPhaseSimulator.vue'
import TricolorMarkingDemo from './components/TricolorMarkingDemo.vue'
import GCTraceExplorer from './components/GCTraceExplorer.vue'
import GCPacingCalculator from './components/GCPacingCalculator.vue'
import WorkerPoolAnimation from './components/WorkerPoolAnimation.vue'
import GoroutineLifecycleSimulator from './components/GoroutineLifecycleSimulator.vue'
import ChannelInternalsViz from './components/ChannelInternalsViz.vue'
import MutexStateViz from './components/MutexStateViz.vue'
import ContextTreeViz from './components/ContextTreeViz.vue'
import SelectSimulator from './components/SelectSimulator.vue'
import ConcurrencyOverviewDiagram from './components/ConcurrencyOverviewDiagram.vue'
import RaceConditionDemo from './components/RaceConditionDemo.vue'
import HappensBeforeViz from './components/HappensBeforeViz.vue'
import WaitGroupSimulator from './components/WaitGroupSimulator.vue'
import DeadlockDemo from './components/DeadlockDemo.vue'
import PipelineVisualizer from './components/PipelineVisualizer.vue'
import InteractiveModal from './components/InteractiveModal.vue'

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
    app.component('StackLayoutDiagram', StackLayoutDiagram)
    app.component('StackGrowthSimulator', StackGrowthSimulator)
    app.component('EscapeAnalysisPlayground', EscapeAnalysisPlayground)
    app.component('GMPModelDiagram', GMPModelDiagram)
    app.component('WorkStealingSimulator', WorkStealingSimulator)
    app.component('SchedulerTraceExplorer', SchedulerTraceExplorer)
    app.component('GCPhaseSimulator', GCPhaseSimulator)
    app.component('TricolorMarkingDemo', TricolorMarkingDemo)
    app.component('GCTraceExplorer', GCTraceExplorer)
    app.component('GCPacingCalculator', GCPacingCalculator)
    app.component('WorkerPoolAnimation', WorkerPoolAnimation)
    app.component('GoroutineLifecycleSimulator', GoroutineLifecycleSimulator)
    app.component('ChannelInternalsViz', ChannelInternalsViz)
    app.component('MutexStateViz', MutexStateViz)
    app.component('ContextTreeViz', ContextTreeViz)
    app.component('SelectSimulator', SelectSimulator)
    app.component('ConcurrencyOverviewDiagram', ConcurrencyOverviewDiagram)
    app.component('RaceConditionDemo', RaceConditionDemo)
    app.component('HappensBeforeViz', HappensBeforeViz)
    app.component('WaitGroupSimulator', WaitGroupSimulator)
    app.component('DeadlockDemo', DeadlockDemo)
    app.component('PipelineVisualizer', PipelineVisualizer)
    app.component('InteractiveModal', InteractiveModal)
  }
} satisfies Theme
