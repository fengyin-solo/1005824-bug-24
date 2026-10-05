import { defineStore } from 'pinia'

export type Operator = {
  name: string
  district: string
  title: string
}

// 值班身份名册：归属校验用的「操作人片区」来自这里，页面选谁就以谁的身份提交。
export const OPERATORS: Operator[] = [
  { name: '李卫东', district: '城东片区', title: '城东片区站长' },
  { name: '周雨桐', district: '城东片区', title: '城东片区值班员' },
  { name: '王建国', district: '城西片区', title: '城西片区站长' },
  { name: '陈志远', district: '城南片区', title: '城南片区站长' },
  { name: '赵敏', district: '城北片区', title: '城北片区站长' },
]

export const DEFAULT_OPERATOR = OPERATORS[0]

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: DEFAULT_OPERATOR.name,
    district: DEFAULT_OPERATOR.district,
    shiftLabel: '白班 08:00-20:00',
    scope: '城市排水防涝泵站运行与内涝处置管理平台',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
    identity: (state) => ({ operator: state.operator, district: state.district }),
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setOperator(name: string) {
      const target = OPERATORS.find((item) => item.name === name) ?? OPERATORS[0]
      this.operator = target.name
      this.district = target.district
    },
  },
})
