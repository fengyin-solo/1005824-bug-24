<template>
  <section class="page" data-module="pumpstation-detail">
    <template v-if="station">
      <header class="page-head">
        <div>
          <h2>泵站详情 · {{ station['站名'] }}</h2>
          <p class="page-desc">
            编号 {{ station.id }} · 归属「{{ station['所属片区'] }}」 · 台账版本 {{ baseRevision }} ·
            当前状态「{{ station.status }}」
            <template v-if="locked"> · 已停用，整条受控只读</template>
          </p>
        </div>
        <div class="page-actions">
          <button class="btn ghost" type="button" @click="goBack">返回台账列表</button>
        </div>
      </header>

      <table class="data-table">
        <tbody>
          <tr v-for="column in columns" :key="column">
            <th class="detail-label">{{ column }}</th>
            <td>{{ station[column] ?? '—' }}</td>
          </tr>
        </tbody>
      </table>

      <section class="edit-panel">
        <h3 class="section-title">改动台账</h3>
        <p class="panel-tip">
          当前值班：{{ session.operator }} · 值班片区「{{ session.region }}」。
          只有本片区能改站名、所属片区、设计流量；提交基于台账版本 {{ baseRevision }}，
          同一座站被重复提交时只落先到的那一版。
        </p>
        <form class="edit-form" @submit.prevent="submit">
          <label class="form-item">
            <span>站名</span>
            <input v-model="form.站名" :disabled="locked" placeholder="同一片区下站名不能重复" />
          </label>
          <label class="form-item">
            <span>所属片区</span>
            <input v-model="form.所属片区" list="detail-region-options" :disabled="locked" />
            <datalist id="detail-region-options">
              <option v-for="region in regionOptions" :key="region" :value="region" />
            </datalist>
          </label>
          <label class="form-item">
            <span>设计流量</span>
            <input v-model="form.设计流量" :disabled="locked" placeholder="单位 m³/s" />
          </label>
          <div class="edit-actions">
            <button class="btn primary" type="submit" :disabled="locked">提交改动</button>
            <button class="btn ghost" type="button" @click="reload">还原为台账现值</button>
          </div>
        </form>
        <p v-if="message" :class="applied ? 'ok-text' : 'error-text'">{{ message }}</p>
      </section>

      <section>
        <h3 class="section-title">该站改动留痕</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>值班人</th>
              <th>值班片区</th>
              <th>试图改动</th>
              <th>结果</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in auditRows" :key="entry.id">
              <td>{{ formatTime(entry.time) }}</td>
              <td>{{ entry.operator }}</td>
              <td>{{ entry.operatorRegion }}</td>
              <td>{{ entry.attempt }}</td>
              <td :class="entry.result === '已受理' ? 'result-applied' : 'result-rejected'">
                {{ entry.result }}
              </td>
              <td>{{ entry.reason || '—' }}</td>
            </tr>
            <tr v-if="!auditRows.length">
              <td colspan="6" class="empty-state">该站暂无改动留痕</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
    <template v-else>
      <p class="error-text">{{ loadError }}</p>
      <button class="btn" type="button" @click="goBack">返回台账列表</button>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getPumpStation,
  listStationAudit,
  listStationRegions,
  moduleMeta,
  updatePumpStation,
} from '@/api/local-service'
import type { AuditEntry, EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('pumpstation')
const columns = meta.fields

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const stationId = Number(route.params.id)

const station = ref<EntryRow | null>(null)
const baseRevision = ref(0)
const form = reactive({ 站名: '', 所属片区: '', 设计流量: '' })
const message = ref('')
const applied = ref(false)
const loadError = ref('')
const auditRows = ref<AuditEntry[]>([])
const regionOptions = ref<string[]>([])

const locked = computed(() => String(station.value?.status ?? '') === '已停用')

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false })
}

function goBack() {
  router.push({ name: 'pumpstation' })
}

function submit() {
  // 与列表入口走同一个数据层校验：归属、只读、重名、版本都在这里卡。
  const result = updatePumpStation(
    stationId,
    { 站名: form.站名, 所属片区: form.所属片区, 设计流量: form.设计流量 },
    { operator: session.operator, region: session.region, baseRevision: baseRevision.value },
  )
  applied.value = result.ok
  message.value = result.message
  reload()
}

function reload() {
  try {
    const row = getPumpStation(stationId)
    station.value = row
    baseRevision.value = Number(row.revision ?? 0)
    form.站名 = String(row['站名'] ?? '')
    form.所属片区 = String(row['所属片区'] ?? '')
    form.设计流量 = String(row['设计流量'] ?? '')
    loadError.value = ''
  } catch (error) {
    station.value = null
    loadError.value = error instanceof Error ? error.message : '泵站详情读取失败'
  }
  auditRows.value = listStationAudit(stationId)
  regionOptions.value = listStationRegions()
}

onMounted(reload)
</script>
