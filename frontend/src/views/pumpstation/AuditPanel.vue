<template>
  <section class="audit-panel">
    <header class="audit-head">
      <h3>改动尝试留痕</h3>
      <div class="audit-tools">
        <label class="audit-filter">
          <input type="checkbox" :checked="mode === 'rejected'" @change="setMode(mode === 'rejected' ? 'all' : 'rejected')" />
          只看被挡回
        </label>
        <label class="audit-filter">
          <input type="checkbox" :checked="mode === 'accepted'" @change="setMode(mode === 'accepted' ? 'all' : 'accepted')" />
          只看已落档
        </label>
        <button class="btn" type="button" @click="reload">刷新留痕</button>
      </div>
    </header>
    <p class="audit-desc">
      接受与挡回的每一次尝试都记录在案，可倒查「谁、什么时候、从哪个入口、想动哪一座站、越在哪」。
      <template v-if="stationId">当前只看 #{{ stationId }} 这座站。</template>
    </p>
    <table class="data-table audit-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>操作人</th>
          <th>操作人片区</th>
          <th>泵站</th>
          <th>入口</th>
          <th>结果</th>
          <th>说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.id" :class="{ rejected: !entry.accepted }">
          <td class="nowrap">{{ formatTime(entry.at) }}</td>
          <td>{{ entry.operator }}</td>
          <td>{{ entry.operatorDistrict }}</td>
          <td>
            <template v-if="entry.stationId !== null">#{{ entry.stationId }} {{ entry.stationName }}</template>
            <template v-else>{{ entry.stationName }}</template>
          </td>
          <td>{{ sourceLabel(entry.source) }}</td>
          <td>
            <span class="audit-tag" :class="entry.accepted ? 'ok' : 'no'">
              {{ entry.accepted ? '已落档' : '已挡回' }}
            </span>
            <div v-if="entry.reason" class="audit-reason">{{ REJECT_LABELS[entry.reason] }}</div>
          </td>
          <td class="audit-detail">{{ entry.detail }}</td>
        </tr>
        <tr v-if="!entries.length">
          <td colspan="7" class="empty-state">暂无改动尝试记录</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { stationAudit } from '@/api/station-service'
import type { AuditEntry } from '@/data/types'
import { formatTime, REJECT_LABELS, sourceLabel } from './format'

const props = defineProps<{ stationId?: number }>()

type Mode = 'all' | 'rejected' | 'accepted'
const mode = ref<Mode>('all')
const entries = ref<AuditEntry[]>([])

function setMode(next: Mode) {
  mode.value = next
  reload()
}

function reload() {
  entries.value = stationAudit({
    stationId: props.stationId,
    rejectedOnly: mode.value === 'rejected',
    acceptedOnly: mode.value === 'accepted',
  })
}

defineExpose({ reload })

onMounted(reload)
</script>
