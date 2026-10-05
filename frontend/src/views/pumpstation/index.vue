<template>
  <section class="page" data-module="pumpstation">
    <header class="page-head">
      <div>
        <h2>泵站台账管理</h2>
        <p class="page-desc">
          归属只认每座站所在的片区：只有本片区能改站名、所属片区与设计流量；已停用站整档只读。
          列表与详情共用同一道数据层校验。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出泵站台账清单</button>
      </div>
    </header>

    <OperatorBar />

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>所属片区</span>
        <select v-model="districtFilter">
          <option value="">全部片区</option>
          <option v-for="district in districts" :key="district" :value="district">{{ district }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>站名 / 流量检索</span>
        <input v-model="keyword" placeholder="按站名、片区、设计流量检索" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>版本</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ locked: isDecommissioned(row) }">
          <td>
            <RouterLink class="link" :to="`/pumpstation/${row.id}`">{{ row['站名'] ?? '—' }}</RouterLink>
            <span v-if="isDecommissioned(row)" class="lock-tag">已停用·只读</span>
          </td>
          <td>{{ row['所属片区'] ?? '—' }}</td>
          <td>{{ row['设计流量'] ?? '—' }}</td>
          <td>{{ row['装机台数'] ?? '—' }}</td>
          <td>{{ row['服务面积'] ?? '—' }}</td>
          <td>{{ row['投运日期'] ?? '—' }}</td>
          <td>{{ row['站长'] ?? '—' }}</td>
          <td>{{ row['站点状态'] ?? '—' }}</td>
          <td class="nowrap">v{{ row.version ?? 1 }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openEdit(row)">改动档案</button>
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无符合条件的泵站台账数据</td>
        </tr>
      </tbody>
    </table>

    <section class="district-block">
      <h3>各片区装机台数（按当前归属实时重算）</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>所属片区</th>
            <th>泵站数</th>
            <th>装机台数（合计）</th>
            <th>其中：已停用站</th>
            <th>已停用装机台数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in districtStats" :key="item.district">
            <td>{{ item.district }}</td>
            <td>{{ item.stations }}</td>
            <td>{{ item.installed }}</td>
            <td>{{ item.decommissioned }}</td>
            <td>{{ item.decommissionedUnits }}</td>
          </tr>
          <tr v-if="!districtStats.length">
            <td colspan="5" class="empty-state">暂无片区统计</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span>共 {{ total }} 条泵站台账记录</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <AuditPanel ref="auditRef" />

    <StationEditModal
      v-if="editing"
      :station="editing"
      :identity="store.identity"
      source="list"
      :districts="districts"
      @closed="closeEdit"
      @saved="onSaved"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  installedByDistrict,
  listDistricts,
  listStations,
} from '@/api/station-service'
import { useSessionStore } from '@/stores/session'
import type { EntryRow, UpdateStationResult } from '@/data/types'
import AuditPanel from './AuditPanel.vue'
import OperatorBar from './OperatorBar.vue'
import StationEditModal from './StationEditModal.vue'

const meta = moduleMeta('pumpstation')
const columns = ['站名', '所属片区', '设计流量', '装机台数', '服务面积', '投运日期', '站长', '站点状态']
const actions = ['提交投运', '安排检修', '停用泵站']
const statuses = ['待投运', '运行中', '检修中', '已停用']

const store = useSessionStore()
const rows = ref<EntryRow[]>([])
const total = ref(0)
const message = ref('')
const messageOk = ref(false)
const districtFilter = ref('')
const keyword = ref('')
const districts = ref<string[]>([])
const editing = ref<EntryRow | null>(null)
const auditRef = ref<InstanceType<typeof AuditPanel> | null>(null)

const stats = computed(() => [
  { label: '运行中泵站', value: rows.value.filter((row) => String(row.status) === '运行中').length },
  { label: '检修中泵站', value: rows.value.filter((row) => String(row.status) === '检修中').length },
  { label: '待投运泵站', value: rows.value.filter((row) => String(row.status) === '待投运').length },
  {
    label: '装机台数（当前筛选片区）',
    value: rows.value.reduce((sum, row) => sum + (Number(row['装机台数']) || 0), 0),
  },
])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const districtStats = computed(() =>
  installedByDistrict().filter(
    (item) => !districtFilter.value || item.district === districtFilter.value,
  ),
)

function isDecommissioned(row: EntryRow): boolean {
  return String(row.status) === '已停用'
}

function resetFilters() {
  districtFilter.value = ''
  keyword.value = ''
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openEdit(row: EntryRow) {
  message.value = ''
  editing.value = row
}

function closeEdit() {
  editing.value = null
}

function onSaved({ result }: { result: UpdateStationResult }) {
  editing.value = null
  message.value = result.message
  messageOk.value = result.ok
  reload()
  auditRef.value?.reload()
}

function runAction(action: string, row: EntryRow) {
  const result = applyAction(meta.key, Number(row.id), action, 'list')
  message.value = result.message
  messageOk.value = result.ok
  reload()
  auditRef.value?.reload()
}

function reload() {
  message.value = ''
  try {
    rows.value = listStations({ district: districtFilter.value, keyword: keyword.value })
    total.value = rows.value.length
    districts.value = listDistricts()
  } catch (error) {
    message.value = error instanceof Error ? error.message : '泵站台账列表读取失败'
    messageOk.value = false
  }
}

onMounted(reload)
</script>
