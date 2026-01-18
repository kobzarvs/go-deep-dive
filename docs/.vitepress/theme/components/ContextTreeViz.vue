<script setup lang="ts">
import { ref, computed } from 'vue'

interface ContextNode {
  id: string
  type: 'background' | 'todo' | 'cancel' | 'timeout' | 'deadline' | 'value'
  label: string
  value?: string
  cancelled: boolean
  children: ContextNode[]
}

const tree = ref<ContextNode>({
  id: 'bg',
  type: 'background',
  label: 'Background',
  cancelled: false,
  children: []
})

const nextId = ref(1)
const selectedNode = ref<string | null>('bg')

const flatNodes = computed(() => {
  const nodes: { node: ContextNode; depth: number; parent: ContextNode | null }[] = []
  function traverse(node: ContextNode, depth: number, parent: ContextNode | null) {
    nodes.push({ node, depth, parent })
    for (const child of node.children) {
      traverse(child, depth + 1, node)
    }
  }
  traverse(tree.value, 0, null)
  return nodes
})

function findNode(id: string, root: ContextNode = tree.value): ContextNode | null {
  if (root.id === id) return root
  for (const child of root.children) {
    const found = findNode(id, child)
    if (found) return found
  }
  return null
}

function addChild(type: ContextNode['type']) {
  if (!selectedNode.value) return
  const parent = findNode(selectedNode.value)
  if (!parent) return

  const id = `ctx-${nextId.value++}`
  let label = ''
  let value = ''

  switch (type) {
    case 'cancel':
      label = 'WithCancel'
      break
    case 'timeout':
      label = 'WithTimeout(5s)'
      value = '5s'
      break
    case 'deadline':
      label = 'WithDeadline'
      value = new Date(Date.now() + 30000).toISOString().slice(11, 19)
      break
    case 'value':
      label = 'WithValue'
      value = `key${nextId.value - 1}`
      break
  }

  const newNode: ContextNode = {
    id,
    type,
    label,
    value,
    cancelled: parent.cancelled,
    children: []
  }

  parent.children.push(newNode)
  selectedNode.value = id
}

function cancelNode(id: string) {
  function cancelRecursive(node: ContextNode) {
    node.cancelled = true
    for (const child of node.children) {
      cancelRecursive(child)
    }
  }

  const node = findNode(id)
  if (node && node.type !== 'background' && node.type !== 'todo') {
    cancelRecursive(node)
  }
}

function reset() {
  tree.value = {
    id: 'bg',
    type: 'background',
    label: 'Background',
    cancelled: false,
    children: []
  }
  selectedNode.value = 'bg'
  nextId.value = 1
}

function getTypeColor(type: ContextNode['type'], cancelled: boolean): string {
  if (cancelled) return '#f87171'
  switch (type) {
    case 'background': return '#4ade80'
    case 'todo': return '#fbbf24'
    case 'cancel': return '#60a5fa'
    case 'timeout': return '#a78bfa'
    case 'deadline': return '#f472b6'
    case 'value': return '#4ecdc4'
    default: return '#808080'
  }
}
</script>

<template>
  <div class="context-viz">
    <div class="viz-header">
      <h3>Context Tree Visualizer</h3>
      <div class="controls">
        <button class="btn btn-cancel-ctx" @click="addChild('cancel')">+ WithCancel</button>
        <button class="btn btn-timeout" @click="addChild('timeout')">+ WithTimeout</button>
        <button class="btn btn-deadline" @click="addChild('deadline')">+ WithDeadline</button>
        <button class="btn btn-value" @click="addChild('value')">+ WithValue</button>
        <button class="btn btn-reset" @click="reset">Reset</button>
      </div>
    </div>

    <div class="main-content">
      <!-- Tree visualization -->
      <div class="tree-panel">
        <div class="panel-title">Context Tree</div>
        <div class="tree-container">
          <div
            v-for="{ node, depth } in flatNodes"
            :key="node.id"
            class="tree-node"
            :class="{ selected: node.id === selectedNode, cancelled: node.cancelled }"
            :style="{ marginLeft: `${depth * 24}px` }"
            @click="selectedNode = node.id"
          >
            <div class="node-connector" v-if="depth > 0"></div>
            <div
              class="node-box"
              :style="{ borderColor: getTypeColor(node.type, node.cancelled) }"
            >
              <div class="node-type" :style="{ color: getTypeColor(node.type, node.cancelled) }">
                {{ node.type }}
              </div>
              <div class="node-label">{{ node.label }}</div>
              <div v-if="node.value" class="node-value">{{ node.value }}</div>
              <div v-if="node.cancelled" class="node-cancelled">CANCELLED</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected node info -->
      <div class="info-panel">
        <div class="panel-title">Selected Context</div>
        <template v-if="selectedNode">
          <div class="info-content" v-if="findNode(selectedNode)">
            <div class="info-row">
              <span class="info-label">Type:</span>
              <span class="info-value">{{ findNode(selectedNode)?.type }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">ID:</span>
              <span class="info-value">{{ selectedNode }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Children:</span>
              <span class="info-value">{{ findNode(selectedNode)?.children.length }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Status:</span>
              <span
                class="info-value"
                :class="{ cancelled: findNode(selectedNode)?.cancelled }"
              >
                {{ findNode(selectedNode)?.cancelled ? 'Cancelled' : 'Active' }}
              </span>
            </div>

            <button
              v-if="findNode(selectedNode)?.type !== 'background' && findNode(selectedNode)?.type !== 'value' && !findNode(selectedNode)?.cancelled"
              class="btn btn-cancel"
              @click="cancelNode(selectedNode)"
            >
              Cancel Context
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Legend -->
    <div class="legend">
      <div class="legend-item">
        <div class="legend-color" style="background: #4ade80"></div>
        <span>Background</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #60a5fa"></div>
        <span>WithCancel</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #a78bfa"></div>
        <span>WithTimeout</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #f472b6"></div>
        <span>WithDeadline</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #4ecdc4"></div>
        <span>WithValue</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #f87171"></div>
        <span>Cancelled</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.context-viz {
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  padding: 20px;
  font-family: 'JetBrains Mono', monospace;
  color: #e0e0e0;
  margin: 24px 0;
}

.viz-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.viz-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ffffff;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  padding: 8px 12px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  transition: all 0.2s ease;
}

.btn-cancel-ctx {
  background: #60a5fa;
  color: #0a0a0a;
}

.btn-timeout {
  background: #a78bfa;
  color: #0a0a0a;
}

.btn-deadline {
  background: #f472b6;
  color: #0a0a0a;
}

.btn-value {
  background: #4ecdc4;
  color: #0a0a0a;
}

.btn-cancel {
  background: #f87171;
  color: #0a0a0a;
  margin-top: 12px;
  width: 100%;
}

.btn-reset {
  background: #3a3a5e;
  color: #e0e0e0;
  border: 1px solid #4a4a7e;
}

.main-content {
  display: grid;
  grid-template-columns: 1fr 250px;
  gap: 20px;
  margin-bottom: 20px;
}

.tree-panel,
.info-panel {
  background: #252545;
  border-radius: 6px;
  padding: 16px;
}

.panel-title {
  font-size: 12px;
  color: #808080;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.tree-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tree-node {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.node-connector {
  width: 16px;
  height: 2px;
  background: #3a3a5e;
  margin-right: 8px;
}

.node-box {
  padding: 8px 12px;
  background: #1a1a2e;
  border: 2px solid;
  border-radius: 6px;
  min-width: 120px;
  transition: all 0.2s ease;
}

.tree-node.selected .node-box {
  background: #2a2a4e;
  box-shadow: 0 0 10px rgba(96, 165, 250, 0.3);
}

.tree-node.cancelled .node-box {
  opacity: 0.7;
}

.node-type {
  font-size: 9px;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.node-label {
  font-size: 12px;
  font-weight: 600;
}

.node-value {
  font-size: 10px;
  color: #808080;
  margin-top: 2px;
}

.node-cancelled {
  font-size: 9px;
  color: #f87171;
  margin-top: 4px;
  font-weight: 600;
}

.info-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.info-label {
  color: #808080;
}

.info-value {
  color: #e0e0e0;
  font-weight: 600;
}

.info-value.cancelled {
  color: #f87171;
}

.legend {
  display: flex;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid #2a2a4e;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #808080;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

@media (max-width: 768px) {
  .main-content {
    grid-template-columns: 1fr;
  }
}
</style>
