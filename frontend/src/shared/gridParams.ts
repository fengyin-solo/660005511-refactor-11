// 网格参数的唯一定义来源：范围、步进、联动校验规则、派生值算法均来自
// ../../../shared/grid-spec.json。配置面板与回测（含失败重试）都从这里取值，
// 任何一侧都不再自行硬编码范围或重复计算网格间距/总网格资金。
import specJson from '../../../shared/grid-spec.json'
import type { GridConfig } from '@/types'

export interface FieldSpec {
  label: string
  type: 'number' | 'integer'
  min: number
  max: number
  step: number
  default: number
}
export interface RuleSpec {
  expr: [string, unknown, unknown]
  fields: (keyof GridConfig)[]
  message: string
}
export interface GridSpec {
  fields: Record<keyof GridConfig, FieldSpec>
  rows: { cols: (keyof GridConfig)[] }[]
  rules: RuleSpec[]
  derived: Record<string, { expr: unknown[] }>
}

export const GRID_SPEC = specJson as unknown as GridSpec
export const GRID_FIELDS = GRID_SPEC.fields
export const GRID_ROWS = GRID_SPEC.rows

export function defaultGridConfig(): GridConfig {
  const cfg = {} as GridConfig
  ;(Object.keys(GRID_FIELDS) as (keyof GridConfig)[]).forEach((key) => {
    cfg[key] = GRID_FIELDS[key].default
  })
  return cfg
}

// ---- 派生值：与后端 shared 解释器同一套表达式，保证口径一致 ----
function evalExpr(expr: unknown, cfg: GridConfig): number {
  if (typeof expr === 'number') return expr
  if (typeof expr === 'string') return Number(cfg[expr as keyof GridConfig])
  const [op, a, b] = expr as [string, unknown, unknown]
  const x = evalExpr(a, cfg)
  const y = evalExpr(b, cfg)
  switch (op) {
    case '+': return x + y
    case '-': return x - y
    case '*': return x * y
    case '/': return x / y
    default: throw new Error(`不支持的表达式运算符: ${op}`)
  }
}

function compareExpr(expr: RuleSpec['expr'], cfg: GridConfig): boolean {
  const [op, a, b] = expr
  const x = evalExpr(a, cfg)
  const y = evalExpr(b, cfg)
  switch (op) {
    case '<': return x < y
    case '<=': return x <= y
    case '>': return x > y
    case '>=': return x >= y
    default: throw new Error(`不支持的校验运算符: ${op}`)
  }
}

export function gridSpacing(cfg: GridConfig): number {
  return evalExpr(GRID_SPEC.derived.gridSpacing.expr, cfg)
}

export function totalGridCapital(cfg: GridConfig): number {
  return evalExpr(GRID_SPEC.derived.totalGridCapital.expr, cfg)
}

function fillMessage(template: string): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => GRID_FIELDS[key as keyof GridConfig].label)
}

export type ConfigErrors = Partial<Record<keyof GridConfig, string>>

// 同一份定义产出每项不合格的原因；越界提示来自字段 min/max，
// 填反（如下限>=上限）由 rules 挂到相关字段上。
export function validateGridConfig(cfg: GridConfig): ConfigErrors {
  const errors: ConfigErrors = {}
  ;(Object.keys(GRID_FIELDS) as (keyof GridConfig)[]).forEach((key) => {
    const f = GRID_FIELDS[key]
    const raw = cfg[key]
    if (raw === null || raw === undefined || Number.isNaN(Number(raw))) {
      errors[key] = `${f.label}不能为空`
      return
    }
    const v = Number(raw)
    if (f.type === 'integer' && !Number.isInteger(v)) {
      errors[key] = `${f.label}必须为整数`
      return
    }
    if (v < f.min || v > f.max) {
      errors[key] = `${f.label}需在 ${f.min} ~ ${f.max} 之间`
    }
  })
  for (const rule of GRID_SPEC.rules) {
    if (!compareExpr(rule.expr, cfg)) {
      const msg = fillMessage(rule.message)
      for (const field of rule.fields) {
        if (!errors[field]) errors[field] = msg
      }
    }
  }
  return errors
}
