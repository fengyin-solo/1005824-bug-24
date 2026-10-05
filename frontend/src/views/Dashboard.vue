<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常；泵站装机台数按各站当前归属重算。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>

    <section class="district-block">
      <h3>泵站装机台数 · 按所属片区重算</h3>
      <p class="page-desc">
        归属口径：每座站的装机台数只算进它当前「所属片区」；被数据层挡回的改动不落档，不会串进这里。
        当前合计 <strong>{{ pumpInstalledTotal }}</strong> 台。
      </p>
      <table class="data-table">
        <thead>
          <tr>
            <th>所属片区</th>
            <th>泵站数</th>
            <th>装机台数</th>
            <th>已停用泵站</th>
            <th>已停用装机台数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in pumpDistricts" :key="row.district">
            <td>{{ row.district }}</td>
            <td>{{ row.stations }}</td>
            <td>{{ row.installed }}</td>
            <td>{{ row.decommissioned }}</td>
            <td>{{ row.decommissionedUnits }}</td>
          </tr>
          <tr v-if="!pumpDistricts.length">
            <td colspan="5" class="empty-state">暂无泵站归属数据</td>
          </tr>
        </tbody>
      </table>
    </section>

    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { loadOverview } from '@/api/local-service'
import type { DistrictInstall, OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const pumpDistricts = ref<DistrictInstall[]>([])
const pumpInstalledTotal = ref(0)

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  pumpDistricts.value = payload.pumpDistricts
  pumpInstalledTotal.value = payload.pumpInstalledTotal
}

onMounted(refresh)
</script>
