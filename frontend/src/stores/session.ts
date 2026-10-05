import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    // 当前值班账号所属的片区：台账归属校验以它为准，默认拒绝一切跨片区改动。
    region: '城东片区',
    scope: '城市排水防涝泵站运行与内涝处置管理平台',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setRegion(label: string) {
      this.region = label
    },
  },
})
