<template>
  <div class="panel">
    <h4>⚙️ 网格策略配置</h4>
    <el-form :model="store.config" label-width="90px" size="small" label-position="top">
      <el-row v-for="(row, ri) in GRID_ROWS" :key="ri" :gutter="8">
        <el-col v-for="key in row.cols" :key="key" :span="24 / row.cols.length">
          <el-form-item :label="FIELDS[key].label" :error="store.fieldErrors[key]">
            <el-input-number
              v-model="store.config[key]"
              :min="FIELDS[key].min"
              :max="FIELDS[key].max"
              :step="FIELDS[key].step"
              controls-position="right"
              @change="store.clearFieldError(key)"
            />
          </el-form-item>
        </el-col>
      </el-row>
      <el-button type="primary" @click="store.runBacktest" :loading="store.loading" block>🚀 运行回测</el-button>
      <div class="form-error" v-if="store.errorMessage">{{ store.errorMessage }}</div>
    </el-form>
    <div class="grid-info" v-if="store.config.gridCount">
      <div class="info-row"><span>网格间距</span><span>{{ spacingText }}</span></div>
      <div class="info-row"><span>总网格资金</span><span>¥{{ totalCapitalText }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTradingStore } from '../store/trading'
import { GRID_FIELDS as FIELDS, GRID_ROWS, gridSpacing, totalGridCapital } from '../shared/gridParams'
const store = useTradingStore()
// 派生值与后端共用同一套算法
const spacingText = computed(() => gridSpacing(store.config).toFixed(2))
const totalCapitalText = computed(() => totalGridCapital(store.config).toLocaleString())
</script>
<style scoped>
.panel{background:#0f1535;border-radius:8px;padding:12px;border:1px solid #1e2a5a}
.panel h4{color:#4fc3f7;font-size:13px;margin-bottom:8px}
.grid-info{margin-top:12px;font-size:12px}
.info-row{display:flex;justify-content:space-between;padding:4px 0;color:#94a3b8;border-bottom:1px solid #1e2a5a33}
.form-error{margin-top:6px;font-size:12px;color:#ef4444}
</style>
