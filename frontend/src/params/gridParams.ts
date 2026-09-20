import specRaw from '../../../shared/grid-params.json'
import type { GridConfig } from '@/types'

/**
 * 网格参数的唯一定义与派生实现（前端侧）。
 *
 * 参数范围、默认值、错误文案、跨字段规则均来自 shared/grid-params.json，
 * 与后端 app/grid_params.py 读取的是同一份定义；
 * 网格间距 / 总网格资金的算法在此也只实现一次，面板展示与回测提交都从这里取值。
 */

type FieldType = 'number' | 'integer'

export interface GridFieldSpec {
  name: keyof GridConfig
  label: string
  type: FieldType
  default: number
  min: number
  max: number
  step: number
  messages: { notANumber: string; notAnInteger: string; outOfRange: string }
}

interface PriceOrderRule {
  id: string
  type: 'lessThan'
  left: keyof GridConfig
  right: keyof GridConfig
  fields: (keyof GridConfig)[]
  message: string
}

export interface GridSpec {
  fields: GridFieldSpec[]
  rules: PriceOrderRule[]
}

export const GRID_SPEC: GridSpec = specRaw as unknown as GridSpec

export const FIELD_SPECS: Record<keyof GridConfig, GridFieldSpec> =
  Object.fromEntries(GRID_SPEC.fields.map((f) => [f.name, f])) as Record<keyof GridConfig, GridFieldSpec>

export const GRID_FIELDS: GridFieldSpec[] = GRID_SPEC.fields

export type FieldErrorCode =
  | 'not_a_number'
  | 'not_an_integer'
  | 'out_of_range'
  | 'priceOrder'
  | 'remote'

export interface GridFieldError {
  field: keyof GridConfig
  code: FieldErrorCode
  message: string
}

function formatMessage(template: string, spec: GridFieldSpec): string {
  return template.replace(/\{label\}/g, spec.label).replace(/\{min\}/g, String(spec.min)).replace(/\{max\}/g, String(spec.max))
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * 与后端 validate_grid_config 同口径的校验：逐字段类型/范围检查通过后，再检查跨字段规则。
 * 参数填反或越界时，错误项按 field 定位到具体哪一项不合格。
 */
export function validateGridConfig(config: Partial<GridConfig>): GridFieldError[] {
  const errors: GridFieldError[] = []
  const values = {} as Record<keyof GridConfig, unknown>

  for (const spec of GRID_FIELDS) {
    const name = spec.name
    const value = config[name]
    values[name] = value
    if (!isFiniteNumber(value)) {
      errors.push({ field: name, code: 'not_a_number', message: formatMessage(spec.messages.notANumber, spec) })
      continue
    }
    if (spec.type === 'integer' && !Number.isInteger(value)) {
      errors.push({ field: name, code: 'not_an_integer', message: formatMessage(spec.messages.notAnInteger, spec) })
      continue
    }
    if (value < spec.min || value > spec.max) {
      errors.push({ field: name, code: 'out_of_range', message: formatMessage(spec.messages.outOfRange, spec) })
    }
  }

  const priceFields: (keyof GridConfig)[] = ['lowerPrice', 'upperPrice']
  if (!errors.some((e) => priceFields.includes(e.field))) {
    for (const rule of GRID_SPEC.rules) {
      if (rule.type === 'lessThan' && !((values[rule.left] as number) < (values[rule.right] as number))) {
        for (const field of rule.fields) {
          errors.push({ field, code: rule.id as FieldErrorCode, message: rule.message })
        }
      }
    }
  }

  return errors
}

// ---- 派生算法：面板展示与回测（后端同款公式）共用 ----

/** 网格间距 = (上限价格 - 下限价格) / 网格数量 */
export function gridSpacing(config: GridConfig): number {
  return (config.upperPrice - config.lowerPrice) / config.gridCount
}

/** 总网格资金 = 网格数量 * 每格资金 */
export function totalGridCapital(config: GridConfig): number {
  return config.gridCount * config.capitalPerGrid
}

export function defaultGridConfig(): GridConfig {
  return Object.fromEntries(GRID_FIELDS.map((f) => [f.name, f.default])) as unknown as GridConfig
}
