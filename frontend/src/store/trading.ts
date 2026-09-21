import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { Tick, OrderBook, GridConfig, GridResult } from '@/types'
import { defaultGridConfig, validateGridConfig, type ConfigErrors } from '../shared/gridParams'

export const useTradingStore = defineStore('trading', () => {
  const loading = ref(false)
  const ticks = ref<Tick[]>([])
  const orderBook = ref<OrderBook | null>(null)
  const gridResult = ref<GridResult | null>(null)
  const wsConnected = ref(false)
  // 默认值同样取自共用定义，避免再写一份
  const config = ref<GridConfig>(defaultGridConfig())
  const fieldErrors = ref<ConfigErrors>({})
  const errorMessage = ref('')

  let ws: WebSocket | null = null
  function connectWS() {
    ws = new WebSocket(`ws://${location.hostname}:8000/ws`)
    ws.onopen = () => { wsConnected.value = true }
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        if (d.ticks) ticks.value = d.ticks.slice(-60)
        if (d.orderBook) orderBook.value = d.orderBook
      } catch {}
    }
    ws.onclose = () => { wsConnected.value = false }
  }

  function clearFieldError(key: keyof GridConfig) {
    if (fieldErrors.value[key]) {
      delete fieldErrors.value[key]
      fieldErrors.value = { ...fieldErrors.value }
    }
    errorMessage.value = ''
  }

  function extractServerErrors(err: any): ConfigErrors {
    const errors: ConfigErrors = {}
    const detail = (err.response?.data as { detail?: unknown })?.detail
    if (Array.isArray(detail)) {
      // Pydantic 校验错误：loc 末位是字段名
      for (const item of detail) {
        const loc = Array.isArray(item?.loc) ? item.loc : []
        const field = loc.length ? String(loc[loc.length - 1]) : ''
        if (field in config.value && !errors[field as keyof GridConfig]) {
          errors[field as keyof GridConfig] = String(item?.msg ?? '参数不合法')
        }
      }
    } else if (detail && typeof detail === 'object') {
      // 后端共用定义给出的逐字段错误 {field: message}
      for (const [field, msg] of Object.entries(detail as Record<string, string>)) {
        if (field in config.value) errors[field as keyof GridConfig] = String(msg)
      }
    }
    return errors
  }

  async function runBacktest() {
    fieldErrors.value = {}
    errorMessage.value = ''
    // 同一份定义负责提示哪一项不合格
    const errors = validateGridConfig(config.value)
    if (Object.keys(errors).length) {
      fieldErrors.value = errors
      return
    }
    // 提交前快照旧参数：网络/服务端失败重试时沿用同一口径，
    // 不会因为表单期间被改动而让两次请求的网格参数不一致
    const payload: GridConfig = { ...config.value }
    loading.value = true
    try {
      try {
        const { data } = await axios.post('/api/backtest', payload)
        gridResult.value = data
      } catch (first) {
        // 参数被驳回(4xx)不属于可重试的瞬时故障；仅对网络错误/5xx 用同一参数重试一次
        if (axios.isAxiosError(first) && first.response && first.response.status < 500) throw first
        const { data } = await axios.post('/api/backtest', payload)
        gridResult.value = data
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const serverErrors = extractServerErrors(err)
        if (Object.keys(serverErrors).length) {
          fieldErrors.value = serverErrors
        } else {
          const status = err.response?.status
          errorMessage.value = status
            ? `回测失败（HTTP ${status}），请稍后重试`
            : '回测请求失败，请检查网络后重试'
        }
      } else {
        errorMessage.value = '回测失败，请稍后重试'
      }
    } finally {
      loading.value = false
    }
  }

  function disconnectWS() { ws?.close(); ws = null; wsConnected.value = false }

  return { loading, ticks, orderBook, gridResult, wsConnected, config, fieldErrors, errorMessage, connectWS, runBacktest, disconnectWS, clearFieldError }
})
