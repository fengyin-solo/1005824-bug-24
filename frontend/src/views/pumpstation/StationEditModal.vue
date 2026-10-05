<template>
  <div class="modal-mask" @click.self="$emit('closed')">
    <div class="modal-card">
      <header class="modal-head">
        <h3>改动泵站档案</h3>
        <button class="link" type="button" @click="$emit('closed')">关闭</button>
      </header>

      <div class="modal-body">
        <p class="modal-meta">
          站档编号 #{{ station.id }} · 当前 v{{ version }} ·
          现归属「{{ station['所属片区'] }}」 ·
          以 {{ identity.operator }}（{{ identity.district }}）身份从{{ sourceText }}入口提交
        </p>

        <label class="form-item">
          <span>站名</span>
          <input v-model="form.站名" />
        </label>
        <label class="form-item">
          <span>所属片区</span>
          <input v-model="form.所属片区" list="station-districts" />
          <datalist id="station-districts">
            <option v-for="district in districts" :key="district" :value="district" />
          </datalist>
        </label>
        <label class="form-item">
          <span>设计流量（m³/s）</span>
          <input v-model="form.设计流量" />
        </label>

        <ul class="rule-list">
          <li>只有「{{ identity.district }}」本片区的人能改这三项；跨片区提交会被数据层挡回。</li>
          <li>改片区后按目标片区查重，同片区站名不能重名。</li>
          <li>已停用站整条只读；提交带版本号，先到先得、后到挡回。</li>
        </ul>

        <p v-if="error" class="error-text reject-box">{{ error }}</p>
      </div>

      <footer class="modal-foot">
        <button class="btn" type="button" :disabled="submitting" @click="$emit('closed')">取消</button>
        <button class="btn primary" type="button" :disabled="submitting" @click="submit">
          {{ submitting ? '提交中…' : '提交改动' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

import { updateStation } from '@/api/station-service'
import type { EntryRow, Identity, StationPatch, SubmitSource, UpdateStationResult } from '@/data/types'

const props = defineProps<{
  station: EntryRow
  identity: Identity
  source: SubmitSource
  districts: string[]
}>()

const emit = defineEmits<{
  (event: 'closed'): void
  (event: 'saved', payload: { result: UpdateStationResult }): void
}>()

function initialForm(): StationPatch {
  return {
    站名: String(props.station['站名'] ?? ''),
    所属片区: String(props.station['所属片区'] ?? ''),
    设计流量: String(props.station['设计流量'] ?? ''),
  }
}

const form = reactive<StationPatch>(initialForm())
const version = ref(Number(props.station.version ?? 1))
const error = ref('')
const submitting = ref(false)

const sourceText = props.source === 'list' ? '列表' : '详情'

watch(
  () => props.station.id,
  () => {
    Object.assign(form, initialForm())
    version.value = Number(props.station.version ?? 1)
    error.value = ''
  },
)

function submit() {
  error.value = ''
  submitting.value = true
  const result = updateStation({
    identity: props.identity,
    stationId: Number(props.station.id),
    patch: { ...form },
    expectedVersion: version.value,
    source: props.source,
  })
  submitting.value = false
  if (!result.ok) {
    error.value = result.message
    return
  }
  if (result.version !== undefined) {
    version.value = result.version
  }
  emit('saved', { result })
}
</script>
