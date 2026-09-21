"""网格参数的唯一定义来源（与前端配置面板/回测共用）。

范围、步进、默认值、联动校验规则与派生值算法全部来自仓库根目录
shared/grid-spec.json，后端回测接口据此校验参数并计算网格间距/总网格资金，
前端 frontend/src/shared/gridParams.ts 使用同一份 JSON，保证两侧口径一致。
"""
import json
import math
import os
from numbers import Real

_SPEC_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "shared", "grid-spec.json")
)

with open(_SPEC_PATH, "r", encoding="utf-8") as _f:
    SPEC = json.load(_f)

FIELDS = SPEC["fields"]
RULES = SPEC["rules"]
DERIVED = SPEC["derived"]


def defaults():
    """从共用定义生成默认参数，避免再硬编码一份。"""
    return {key: spec["default"] for key, spec in FIELDS.items()}


def _eval_expr(expr, cfg):
    if isinstance(expr, (int, float)):
        return float(expr)
    if isinstance(expr, str):
        return float(cfg[expr])
    op, a, b = expr
    x = _eval_expr(a, cfg)
    y = _eval_expr(b, cfg)
    if op == "+":
        return x + y
    if op == "-":
        return x - y
    if op == "*":
        return x * y
    if op == "/":
        return x / y
    raise ValueError("不支持的表达式运算符: %s" % op)


_COMPARATORS = {
    "<": lambda x, y: x < y,
    "<=": lambda x, y: x <= y,
    ">": lambda x, y: x > y,
    ">=": lambda x, y: x >= y,
}


def _fill_message(template):
    for key, spec in FIELDS.items():
        template = template.replace("{%s}" % key, spec["label"])
    return template


def validate_config(cfg):
    """返回 {字段名: 不合格原因}；为空 dict 表示全部合格。

    越界提示来自字段 min/max；联动规则（如下限 >= 上限）挂到涉及的字段上，
    与前端 validateGridConfig 输出口径一致。
    """
    errors = {}
    for key, spec in FIELDS.items():
        v = cfg.get(key)
        if isinstance(v, bool) or not isinstance(v, Real) or math.isnan(float(v)) or math.isinf(float(v)):
            errors[key] = "%s不能为空" % spec["label"]
            continue
        if spec["type"] == "integer" and float(v) != int(v):
            errors[key] = "%s必须为整数" % spec["label"]
            continue
        if v < spec["min"] or v > spec["max"]:
            errors[key] = "%s需在 %s ~ %s 之间" % (spec["label"], spec["min"], spec["max"])

    for rule in RULES:
        op, a, b = rule["expr"]
        if not _COMPARATORS[op](_eval_expr(a, cfg), _eval_expr(b, cfg)):
            message = _fill_message(rule["message"])
            for field in rule["fields"]:
                errors.setdefault(field, message)
    return errors


# ---- 派生值：与前端使用同一份 JSON 表达式 ----
def grid_spacing(cfg):
    return _eval_expr(DERIVED["gridSpacing"]["expr"], cfg)


def total_grid_capital(cfg):
    return _eval_expr(DERIVED["totalGridCapital"]["expr"], cfg)
