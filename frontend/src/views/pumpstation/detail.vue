<template>
  <section class="page pump-detail" data-module="pumpstation">
    <header class="page-head">
      <div>
        <h2>泵站档案详情</h2>
        <p class="page-desc">
          详情与列表读取同一份受控档案，归属、设计流量以数据层现值为准；本页改动同样过归属、停用、重名与版本校验。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/pumpstation">返回列表</RouterLink>
      </div>
    </header>

    <OperatorBar />

    <template v-if="station">
      <div v-if="locked" class="lock-banner">
        该站已停用，整条站档受控只读：即使是本片区（{{ station['所属片区'] }}）的人也不能改动，状态动作一律挡回。
      </div>

      <div class="stat-row">
        <article class="stat-card">
          <span class="stat-label">站名</span>
          <strong class="stat-value">{{ station['站名'] }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">所属片区（归属口径）</span>
          <strong class="stat-value">{{ station['所属片区'] }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">设计流量 m³/s</span>
          <strong class="stat-value">{{ station['设计流量'] }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">装机台数</span>
          <strong class="stat-value">{{ station['装机台数'] }}</strong>
        </article>
      </div>

      <table class="data-table detail-table">
        <tbody>
          <tr v-for="field in detailFields" :key="field">
            <th>{{ field }}</th>
            <td>{{ station[field] ?? '—' }}</td>
          </tr>
          <tr>
            <th>当前状态</th>
            <td>{{ station.status }}</td>
          </tr>
          <tr>
            <th>档案版本</th>
            <td>v{{ station.version ?? 1 }}</td>
          </tr>
          <tr>
            <th>归属判定</th>
            <td>
              <span :class="ownDistrict ? 'audit-tag ok' : 'audit-tag no'">
                {{ ownDistrict ? `当前身份（${store.district}）为本片区，可提交改动` : `当前身份属「${store.district}」，与本站片区不同，提交将被挡回` }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="detail-actions">
        <button class="btn primary" type="button" :disabled="locked" @click="openEdit">
          改动站名 / 所属片区 / 设计流量
        </button>
        <button
          v-for="action in actions"
          :key="action"
          class="btn"
          type="button"
          @click="runAction(action)"
        >
          {{ action }}
        </button>
      </div>

      <p v-if="message" :class="messageOk ? 'ok-text' : 'error-text'" class="detail-message">
        {{ message }}
      </p>

      <AuditPanel ref="auditRef" :station-id="Number(station.id)" />

      <StationEditModal
        v-if="editing && station"
        :station="station"
        :identity="store.identity"
        source="detail"
        :districts="districts"
        @closed="editing = false"
        @saved="onSaved"
      />
    </template>

    <section v-else class="page">
      <p class="error-text">没有找到编号为 {{ route.params.id }} 的排水泵站。</p>
      <RouterLink class="btn" to="/pumpstation">返回列表</RouterLink>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { runAction as applyAction } from '@/api/local-service'
import {
  getStation,
  listDistricts,
} from '@/api/station-service'
import { moduleMeta } from '@/api/local-service'
import { useSessionStore } from '@/stores/session'
import type { EntryRow, UpdateStationResult } from '@/data/types'
import AuditPanel from './AuditPanel.vue'
import OperatorBar from './OperatorBar.vue'
import StationEditModal from './StationEditModal.vue'

const route = useRoute()
const store = useSessionStore()
const meta = moduleMeta('pumpstation')
const actions = ['提交投运', '安排检修', '停用泵站']
const detailFields = ['服务面积', '投运日期', '站长', '站点状态']

const station = ref<EntryRow | null>(null)
const districts = ref<string[]>([])
const editing = ref(false)
const message = ref('')
const messageOk = ref(false)
const auditRef = ref<InstanceType<typeof AuditPanel> | null>(null)

const locked = computed(() => station.value !== null && String(station.value.status) === '已停用')
const ownDistrict = computed(
  () => station.value !== null && String(station.value['所属片区']) === store.district,
)

function openEdit() {
  message.value = ''
  editing.value = true
}

function onSaved({ result }: { result: UpdateStationResult }) {
  editing.value = false
  message.value = result.message
  messageOk.value = result.ok
  reload()
  auditRef.value?.reload()
}

function runAction(action: string) {
  if (!station.value) {
    return
  }
  const result = applyAction(meta.key, Number(station.value.id), action, 'detail')
  message.value = result.message
  messageOk.value = result.ok
  reload()
  auditRef.value?.reload()
}

function reload() {
  const id = Number(route.params.id)
  station.value = getStation(id)
  districts.value = listDistricts()
}

watch(() => route.params.id, reload)
onMounted(reload)
</script>
