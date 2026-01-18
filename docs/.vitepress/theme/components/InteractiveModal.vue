<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  title: string
  icon?: string
  description?: string
}>()

const isOpen = ref(false)

function open() {
  isOpen.value = true
  document.body.style.overflow = 'hidden'
}

function close() {
  isOpen.value = false
  document.body.style.overflow = ''
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <!-- Preview Card -->
  <div class="interactive-card" @click="open">
    <div class="card-icon">{{ icon || '▶' }}</div>
    <div class="card-content">
      <div class="card-title">{{ title }}</div>
      <div v-if="description" class="card-description">{{ description }}</div>
    </div>
    <div class="card-action">
      <span class="open-btn">Открыть</span>
    </div>
  </div>

  <!-- Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="close">
        <div class="modal-container">
          <div class="modal-header">
            <h2 class="modal-title">{{ title }}</h2>
            <button class="close-btn" @click="close" aria-label="Close">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.interactive-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid #3a3a5e;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  margin: 20px 0;
}

.interactive-card:hover {
  border-color: #60a5fa;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(96, 165, 250, 0.15);
}

.card-icon {
  font-size: 28px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(96, 165, 250, 0.1);
  border-radius: 10px;
  flex-shrink: 0;
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  font-family: 'JetBrains Mono', monospace;
}

.card-description {
  font-size: 13px;
  color: #a0a0a0;
  margin-top: 4px;
}

.card-action {
  flex-shrink: 0;
}

.open-btn {
  padding: 8px 16px;
  background: #60a5fa;
  color: #0a0a0a;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
  transition: all 0.2s ease;
}

.interactive-card:hover .open-btn {
  background: #3b82f6;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal-container {
  width: 100%;
  max-width: 1200px;
  max-height: 90vh;
  background: #1a1a2e;
  border: 1px solid #3a3a5e;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #2a2a4e;
  background: #252545;
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  font-family: 'JetBrains Mono', monospace;
}

.close-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid #3a3a5e;
  border-radius: 8px;
  color: #a0a0a0;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: #f87171;
  border-color: #f87171;
  color: #ffffff;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

/* Remove wrapper styles from content inside modal */
.modal-body :deep(.lifecycle-simulator),
.modal-body :deep(.race-demo),
.modal-body :deep(.happens-before-viz),
.modal-body :deep(.waitgroup-sim),
.modal-body :deep(.deadlock-demo),
.modal-body :deep(.pipeline-viz),
.modal-body :deep(.channel-viz),
.modal-body :deep(.select-simulator),
.modal-body :deep(.mutex-viz),
.modal-body :deep(.context-tree-viz),
.modal-body :deep(.concurrency-overview) {
  margin: 0;
  border: none;
  border-radius: 0;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95) translateY(20px);
}

@media (max-width: 768px) {
  .interactive-card {
    flex-wrap: wrap;
    gap: 12px;
  }

  .card-action {
    width: 100%;
  }

  .open-btn {
    display: block;
    width: 100%;
    text-align: center;
  }

  .modal-container {
    max-height: 95vh;
    border-radius: 12px;
  }

  .modal-header {
    padding: 12px 16px;
  }
}
</style>
