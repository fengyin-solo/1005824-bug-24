<template>
  <div class="identity-bar">
    <span class="identity-label">当前值班身份</span>
    <select :value="store.operator" class="identity-select" @change="onChange">
      <option v-for="person in operators" :key="person.name" :value="person.name">
        {{ person.name }}（{{ person.district }} · {{ person.title }}）
      </option>
    </select>
    <span class="identity-badge" :class="{ self: true }">
      归属片区：{{ store.district }}
    </span>
    <span class="identity-hint">归属校验在数据层执行，切换身份即可验证跨片区挡回</span>
  </div>
</template>

<script setup lang="ts">
import { OPERATORS, useSessionStore } from '@/stores/session'

const store = useSessionStore()
const operators = OPERATORS

function onChange(event: Event) {
  store.setOperator((event.target as HTMLSelectElement).value)
}
</script>
