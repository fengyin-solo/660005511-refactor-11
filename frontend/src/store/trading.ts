import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios, { AxiosError } from 'axios'
import type { Tick, OrderBook, GridConfig, GridResult } from '@/types'
import { validateGridConfig, defaultGridConfig, type GridFieldError } from '@/params/gridParams'

const MAX_ATTEMPTS = 3
const RETRY_DELAYS = [300, 600]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type RunBacktestOutcome =
  | { ok: true; result: GridResult }
  | { ok: false; errors: GridFieldError[]; message: string }

export const useTradingStore = defineStore('trading', () => {
  const loading = ref(false)
  const ticks = ref<Tick[]>([])
  const orderBook = ref<OrderBook | null>(null)
  const gridResult = ref<GridResult | null>(null)
  const wsConnected = ref(false)
  const config = ref<GridConfig>(defaultGridConfig())
  // 回测被后端判定不合格时，按字段回填到表单项的错误
  const serverErrors = ref<GridFieldError[]>([])

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

  function toRemoteErrors(payload: unknown): GridFieldError[] {
    if (!Array.isArray(payload)) return []
    const errors: GridFieldError[] = []
    for (const item of payload) {
      if (!item || typeof item !== 'object') continue
      const loc: unknown = (item as { loc?: unknown }).loc
      const field = Array.isArray(loc) ? loc[loc.length - 1] : undefined
      if (typeof field === 'string' && field in config.value) {
        errors.push({
          field: field as keyof GridConfig,
          code: 'remote',
          message: String((item as { msg?: unknown }).msg ?? '参数不合格'),
        })
      }
    }
    return errors
  }

  async function runBacktest(): Promise<RunBacktestOutcome> {
    // 提交前先按共享定义本地校验，面板和回测用的是同一份口径
    const localErrors = validateGridConfig(config.value)
    if (localErrors.length) return { ok: false, errors: localErrors, message: '网格参数不合格，请检查标红项' }

    // 快照固化本次提交的参数：无论失败重试多少次，请求体始终是同一份参数
    const snapshot: GridConfig = Object.freeze({ ...config.value }) as GridConfig
    serverErrors.value = []
    loading.value = true
    try {
      let lastError: AxiosError | null = null
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const { data } = await axios.post<GridResult>('/api/backtest', snapshot)
          gridResult.value = data
          return { ok: true, result: data }
        } catch (err) {
          const axErr = err as AxiosError
          const status = axErr.response?.status ?? 0
          // 参数类错误（4xx）不重试，直接把具体不合格项回填到表单
          if (status >= 400 && status < 500) {
            const remote = toRemoteErrors((axErr.response?.data as { detail?: unknown })?.detail)
            if (remote.length) {
              serverErrors.value = remote
              return { ok: false, errors: remote, message: '网格参数不合格，请检查标红项' }
            }
            return { ok: false, errors: [], message: `回测请求被拒绝（${status}）` }
          }
          lastError = axErr
          if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAYS[attempt - 1])
        }
      }
      const reason = lastError?.response ? `服务异常（${lastError.response.status}）` : '网络错误，无法连接回测服务'
      return { ok: false, errors: [], message: `回测失败，已重试 ${MAX_ATTEMPTS} 次：${reason}` }
    } finally {
      loading.value = false
    }
  }

  function disconnectWS() { ws?.close(); ws = null; wsConnected.value = false }

  return { loading, ticks, orderBook, gridResult, wsConnected, config, serverErrors, connectWS, runBacktest, disconnectWS }
})
