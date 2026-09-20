<template>
  <div class="panel">
    <h4>⚙️ 网格策略配置</h4>
    <el-form :model="store.config" label-width="90px" size="small" label-position="top">
      <el-row :gutter="8">
        <el-col :span="12"><el-form-item label="下限价格" :error="errors.lowerPrice"><el-input-number v-model="store.config.lowerPrice" :min="fieldSpec('lowerPrice').min" :max="fieldSpec('lowerPrice').max" :step="fieldSpec('lowerPrice').step" controls-position="right"/></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="上限价格" :error="errors.upperPrice"><el-input-number v-model="store.config.upperPrice" :min="fieldSpec('upperPrice').min" :max="fieldSpec('upperPrice').max" :step="fieldSpec('upperPrice').step" controls-position="right"/></el-form-item></el-col>
      </el-row>
      <el-row :gutter="8">
        <el-col :span="12"><el-form-item label="网格数量" :error="errors.gridCount"><el-input-number v-model="store.config.gridCount" :min="fieldSpec('gridCount').min" :max="fieldSpec('gridCount').max" :step="fieldSpec('gridCount').step" controls-position="right"/></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="每格资金" :error="errors.capitalPerGrid"><el-input-number v-model="store.config.capitalPerGrid" :min="fieldSpec('capitalPerGrid').min" :max="fieldSpec('capitalPerGrid').max" :step="fieldSpec('capitalPerGrid').step" controls-position="right"/></el-form-item></el-col>
      </el-row>
      <el-form-item label="初始资金" :error="errors.initialCapital"><el-input-number v-model="store.config.initialCapital" :min="fieldSpec('initialCapital').min" :max="fieldSpec('initialCapital').max" :step="fieldSpec('initialCapital').step" controls-position="right"/></el-form-item>
      <el-button type="primary" @click="onRun" :loading="store.loading" block>🚀 运行回测</el-button>
    </el-form>
    <div class="grid-info" v-if="store.config.gridCount">
      <div class="info-row"><span>网格间距</span><span>{{ spacingText }}</span></div>
      <div class="info-row"><span>总网格资金</span><span>¥{{ totalCapitalText }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useTradingStore } from '../store/trading'
import type { GridConfig } from '../types'
import {
  FIELD_SPECS, GRID_FIELDS,
  validateGridConfig, gridSpacing, totalGridCapital,
  type GridFieldError,
} from '../params/gridParams'

const store = useTradingStore()
const submitted = ref(false)

// 参数范围/步长全部来自共享定义，与后端同一份
function fieldSpec(name: keyof GridConfig) {
  return FIELD_SPECS[name]
}

// 错误同样来自共享定义：本地实时校验 + 回测时后端返回的字段错误，按项合并
const errorMap = computed<Partial<Record<keyof GridConfig, string>>>(() => {
  const map: Partial<Record<keyof GridConfig, string>> = {}
  const local = submitted.value ? validateGridConfig(store.config) : []
  const all: GridFieldError[] = [...local, ...store.serverErrors]
  for (const e of all) if (!map[e.field]) map[e.field] = e.message
  return map
})

const errors = computed(() => ({
  lowerPrice: errorMap.value.lowerPrice,
  upperPrice: errorMap.value.upperPrice,
  gridCount: errorMap.value.gridCount,
  capitalPerGrid: errorMap.value.capitalPerGrid,
  initialCapital: errorMap.value.initialCapital,
}))

// 派生取值与后端同一套算法
const spacingText = computed(() => gridSpacing(store.config).toFixed(2))
const totalCapitalText = computed(() => totalGridCapital(store.config).toLocaleString())

async function onRun() {
  submitted.value = true
  const outcome = await store.runBacktest()
  if (!outcome.ok) {
    if (!outcome.errors.length) ElMessage.error(outcome.message)
  }
}

// 参数被修改后重新实时校验；同时清掉上一次后端返回的错误
watch(() => GRID_FIELDS.map((f) => store.config[f.name]), () => {
  store.serverErrors = []
})
</script>
<style scoped>
.panel{background:#0f1535;border-radius:8px;padding:12px;border:1px solid #1e2a5a}
.panel h4{color:#4fc3f7;font-size:13px;margin-bottom:8px}
.grid-info{margin-top:12px;font-size:12px}
.info-row{display:flex;justify-content:space-between;padding:4px 0;color:#94a3b8;border-bottom:1px solid #1e2a5a33}
</style>
