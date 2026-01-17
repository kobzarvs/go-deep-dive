<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { page, theme } = useData()

const date = computed(() => {
  const timestamp = page.value.lastUpdated
  if (!timestamp) return null

  const d = new Date(timestamp)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')

  return `${day}.${month}.${year}, ${hours}:${minutes}`
})

const text = computed(() => theme.value.lastUpdated?.text || 'Обновлено')
</script>

<template>
  <p v-if="date" class="last-updated">
    {{ text }}: {{ date }}
  </p>
</template>

<style scoped>
.last-updated {
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 24px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--vp-c-divider);
}
</style>
