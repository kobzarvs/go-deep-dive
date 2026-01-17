<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import LastUpdated from './components/LastUpdated.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #doc-footer-before>
      <LastUpdated />
    </template>
  </Layout>
</template>
