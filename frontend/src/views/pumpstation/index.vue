<template>
  <section class="page" data-module="pumpstation">
    <header class="page-head">
      <div>
        <h2>泵站台账管理</h2>
        <p class="page-desc">维护排水泵站，围绕站名、所属片区、设计流量、装机台数做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记排水泵站</button>
        <button class="btn" type="button" @click="exportRows">导出泵站台账清单</button>
      </div>
    </header>

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

    <div class="region-bar">
      <span>当前值班片区：</span>
      <select :value="session.region" @change="switchRegion">
        <option v-for="region in regionOptions" :key="region" :value="region">{{ region }}</option>
      </select>
      <span class="region-hint">
        每座站的归属只算它所在的片区：只有本片区能改站名、所属片区、设计流量；已停用的站整条只读。
      </span>
    </div>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">详情</button>
            <button class="link" type="button" @click="openEdit(row)">编辑</button>
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
          <td :colspan="columns.length + 2" class="empty-state">暂无泵站台账数据，可先登记排水泵站</td>
        </tr>
      </tbody>
    </table>

    <section class="audit-panel">
      <h3 class="section-title">台账改动留痕</h3>
      <p class="panel-tip">受理与挡回都记录在案：谁、什么时候、想动哪一座站、越在哪，都可倒查。</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>值班人</th>
            <th>值班片区</th>
            <th>目标泵站</th>
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
            <td>{{ entry.stationName }}（编号 {{ entry.stationId }}）</td>
            <td>{{ entry.attempt }}</td>
            <td :class="entry.result === '已受理' ? 'result-applied' : 'result-rejected'">
              {{ entry.result }}
            </td>
            <td>{{ entry.reason || '—' }}</td>
          </tr>
          <tr v-if="!auditRows.length">
            <td colspan="7" class="empty-state">暂无改动留痕</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span>共 {{ total }} 条泵站台账记录</span>
      <span v-if="noticeMessage" class="ok-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="editing" class="modal-mask">
      <div class="modal-card">
        <h3>编辑泵站台账（编号 {{ editing.id }}）</h3>
        <p class="modal-tip">
          归属「{{ editing.homeRegion }}」 · 台账版本 {{ editing.baseRevision }} ·
          当前值班片区「{{ session.region }}」。跨片区提交会被数据层退回并留痕。
        </p>
        <label class="form-item">
          <span>站名</span>
          <input v-model="editing.站名" placeholder="同一片区下站名不能重复" />
        </label>
        <label class="form-item">
          <span>所属片区</span>
          <input v-model="editing.所属片区" list="region-options" placeholder="可填既有片区或新片区" />
          <datalist id="region-options">
            <option v-for="region in regionOptions" :key="region" :value="region" />
          </datalist>
        </label>
        <label class="form-item">
          <span>设计流量</span>
          <input v-model="editing.设计流量" placeholder="单位 m³/s" />
        </label>
        <p v-if="editError" class="error-text">{{ editError }}</p>
        <div class="modal-actions">
          <button class="btn primary" type="button" @click="submitEdit">提交改动</button>
          <button class="btn ghost" type="button" @click="closeEdit">取消</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  downloadEntries,
  listEntries,
  listStationAudit,
  listStationRegions,
  moduleMeta,
  runAction as applyAction,
  updatePumpStation,
} from '@/api/local-service'
import type { AuditEntry, EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('pumpstation')
const columns = ["站名", "所属片区", "设计流量", "装机台数", "服务面积", "投运日期", "站长", "站点状态"]
const actions = ["提交投运", "安排检修", "停用泵站"]
const statuses = ["待投运", "运行中", "检修中", "已停用"]
const stats = [{"label": "运行中泵站", "value": 0}, {"label": "检修中泵站", "value": 0}, {"label": "待投运泵站", "value": 0}]

const session = useSessionStore()
const router = useRouter()

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const regionOptions = ref<string[]>([])
const auditRows = ref<AuditEntry[]>([])

type EditForm = {
  id: number
  baseRevision: number
  homeRegion: string
  站名: string
  所属片区: string
  设计流量: string
}
const editing = ref<EditForm | null>(null)
const editError = ref('')

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function switchRegion(event: Event) {
  session.setRegion((event.target as HTMLSelectElement).value)
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false })
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '排水泵站登记入口尚未接入审批流'
}

function openDetail(row: EntryRow) {
  router.push({ name: 'pumpstation-detail', params: { id: Number(row.id) } })
}

function openEdit(row: EntryRow) {
  noticeMessage.value = ''
  editError.value = ''
  editing.value = {
    id: Number(row.id),
    baseRevision: Number(row.revision ?? 0),
    homeRegion: String(row['所属片区'] ?? ''),
    站名: String(row['站名'] ?? ''),
    所属片区: String(row['所属片区'] ?? ''),
    设计流量: String(row['设计流量'] ?? ''),
  }
}

function closeEdit() {
  editing.value = null
  editError.value = ''
}

function submitEdit() {
  const form = editing.value
  if (!form) {
    return
  }
  const result = updatePumpStation(
    form.id,
    { 站名: form.站名, 所属片区: form.所属片区, 设计流量: form.设计流量 },
    { operator: session.operator, region: session.region, baseRevision: form.baseRevision },
  )
  if (!result.ok) {
    // 被退回的改动留在对话框里写明原因，列表与留痕同步刷新。
    editError.value = result.message
    reload()
    return
  }
  closeEdit()
  noticeMessage.value = result.message
  reload()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    const regions = new Set(listStationRegions())
    if (session.region) {
      regions.add(session.region)
    }
    regionOptions.value = [...regions]
    auditRows.value = listStationAudit()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '泵站台账列表读取失败'
  }
}

onMounted(reload)
</script>
