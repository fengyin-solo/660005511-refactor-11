"""网格参数的唯一定义与派生实现。

参数的范围、默认值、错误文案以及跨字段规则全部来自 shared/grid-params.json，
配置面板（前端）与回测引擎（本模块）都从同一份定义取值与校验，
网格间距 / 总网格资金的派生算法也只在这里实现一次。
"""
import json
import math
import os
from typing import Any, Dict, List, Mapping

_SPEC_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "shared", "grid-params.json")

with open(_SPEC_PATH, "r", encoding="utf-8") as _f:
    SPEC: Dict[str, Any] = json.load(_f)

FIELD_SPECS: Dict[str, Dict[str, Any]] = {f["name"]: f for f in SPEC["fields"]}
FIELD_NAMES: List[str] = [f["name"] for f in SPEC["fields"]]
RULE_SPECS: List[Dict[str, Any]] = SPEC["rules"]


def default_config() -> Dict[str, float]:
    """从共享定义取默认参数。"""
    return {name: FIELD_SPECS[name]["default"] for name in FIELD_NAMES}


def _format(template: str, spec: Dict[str, Any]) -> str:
    return template.format(label=spec["label"], min=spec["min"], max=spec["max"])


def _is_real_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if not isinstance(value, (int, float)):
        return False
    return math.isfinite(value)


def validate_grid_config(config: Mapping[str, Any]) -> List[Dict[str, str]]:
    """按共享定义校验参数，返回错误列表；为空表示全部合格。

    每条错误形如 {"field": 字段名, "code": 错误码, "message": 中文提示}，
    与 FastAPI RequestValidationError 的 detail 结构保持一致，
    面板可直接按 field 定位到具体哪一项不合格。
    """
    errors: List[Dict[str, str]] = []
    values: Dict[str, Any] = {}

    for name in FIELD_NAMES:
        spec = FIELD_SPECS[name]
        value = config.get(name)
        values[name] = value
        if not _is_real_number(value):
            errors.append({"field": name, "code": "not_a_number",
                           "message": _format(spec["messages"]["notANumber"], spec)})
            continue
        if spec["type"] == "integer" and int(value) != float(value):
            errors.append({"field": name, "code": "not_an_integer",
                           "message": _format(spec["messages"]["notAnInteger"], spec)})
            continue
        if value < spec["min"] or value > spec["max"]:
            errors.append({"field": name, "code": "out_of_range",
                           "message": _format(spec["messages"]["outOfRange"], spec)})

    # 单项数值都合法后，再检查跨字段规则
    if not any(e["field"] in ("lowerPrice", "upperPrice") for e in errors):
        for rule in RULE_SPECS:
            if rule["type"] == "lessThan":
                if not (values[rule["left"]] < values[rule["right"]]):
                    for field in rule["fields"]:
                        errors.append({"field": field, "code": rule["id"],
                                       "message": rule["message"]})

    return errors


def is_valid(config: Mapping[str, Any]) -> bool:
    return not validate_grid_config(config)


# ---- 派生算法：配置面板与回测引擎共用，保证口径一致 ----

def grid_spacing(config: Mapping[str, Any]) -> float:
    """网格间距 = (上限价格 - 下限价格) / 网格数量。"""
    return (config["upperPrice"] - config["lowerPrice"]) / config["gridCount"]


def total_grid_capital(config: Mapping[str, Any]) -> float:
    """总网格资金 = 网格数量 * 每格资金。"""
    return config["gridCount"] * config["capitalPerGrid"]


def derive_grid_params(config: Mapping[str, Any]) -> Dict[str, float]:
    spacing = grid_spacing(config)
    return {"gridSpacing": spacing, "totalGridCapital": total_grid_capital(config)}


def grid_prices(config: Mapping[str, Any]) -> List[float]:
    """由共享定义的间距算法生成网格价位。"""
    spacing = grid_spacing(config)
    lower = config["lowerPrice"]
    count = int(config["gridCount"])
    return [lower + i * spacing for i in range(count + 1)]
