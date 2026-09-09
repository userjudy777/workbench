#!/usr/bin/env python3
"""
A股主升浪选股 —— 云端自运行版
从 westock-tool 策略/排行构建候选池，按 10 条技术面条件精筛与评分。
与本地版差异：
- westock 脚本从 cloud/bin/ 相对路径调用（已打包进云端项目）
- 不含 tdx 庄家抬轿数据（云端无通达信环境，该条件记为不命中，满分 90）
- 报告直接写入 cloud/reports/，并自动更新 index.json（保留最近 10 期）
"""
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

CLOUD_DIR = Path(__file__).resolve().parent.parent
WESTOCK_DATA = CLOUD_DIR / "bin" / "westock-data.js"
WESTOCK_TOOL = CLOUD_DIR / "bin" / "westock-tool.js"
REPORT_DIR = CLOUD_DIR / "reports"

STRATEGY_SOURCES = [
    ("ma_long", 100, "均线多头"),
    ("boll_bt_upper", 100, "布林上轨"),
    ("macd_golden", 100, "MACD金叉"),
    ("sar_buy_signal", 100, "SAR买入"),
    ("major_force", 60, "主力抢筹"),
    ("institution_chasing", 60, "机构接盘"),
]

RANKING_SOURCES = [
    ("limitup_days", 60, "连板天数"),
    ("cap_main_5d", 60, "5日主力净流入"),
]


def run_westock(script, args):
    cmd = ["node", str(script)] + args + ["--raw"]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        print(f"timeout: {' '.join(args)}", file=sys.stderr)
        return None
    if res.returncode != 0:
        print(f"{script.name} error: {' '.join(args)}\n{res.stderr[:500]}", file=sys.stderr)
        return None
    try:
        return json.loads(res.stdout)
    except Exception as e:
        print(f"json parse error: {' '.join(args)}\n{e}", file=sys.stderr)
        return None


def get_candidate_pool(date):
    pool = {}
    for name, limit, label in STRATEGY_SOURCES:
        data = run_westock(WESTOCK_TOOL, ["strategy", name, "--date", date, "--limit", str(limit)])
        if not data:
            continue
        for item in data:
            code = item.get("code")
            if not code:
                continue
            entry = pool.setdefault(code, {"code": code, "name": item.get("name", ""), "signals": []})
            entry["signals"].append(label)

    for name, limit, label in RANKING_SOURCES:
        data = run_westock(WESTOCK_TOOL, ["ranking", name, "--date", date, "--limit", str(limit)])
        if not data:
            continue
        for item in data:
            code = item.get("代码") or item.get("code")
            nm = item.get("名称") or item.get("name")
            if not code:
                continue
            entry = pool.setdefault(code, {"code": code, "name": nm or "", "signals": []})
            entry["signals"].append(label)

    for entry in pool.values():
        entry["signals"] = sorted(set(entry["signals"]))
    return list(pool.values())


def batch_call(codes, command, extra_args, batch_size=8):
    results = {}
    for i in range(0, len(codes), batch_size):
        batch = codes[i:i+batch_size]
        data = run_westock(WESTOCK_DATA, [command, ",".join(batch)] + extra_args)
        if data is None:
            continue
        if isinstance(data, list):
            for row in data:
                sym = row.get("symbol") or row.get("code")
                if sym:
                    payload = row.get("data") if isinstance(row.get("data"), dict) else row
                    results[sym] = payload
        elif isinstance(data, dict) and "data" in data:
            inner = data["data"]
            if isinstance(inner, dict):
                for sym, val in inner.items():
                    results[sym] = val
            elif isinstance(inner, list):
                for row in inner:
                    sym = row.get("symbol") or row.get("code")
                    if sym:
                        payload = row.get("data") if isinstance(row.get("data"), dict) else row
                        results[sym] = payload
    return results


def batch_klines(codes, period, limit, batch_size=4):
    results = {code: [] for code in codes}
    for i in range(0, len(codes), batch_size):
        batch = codes[i:i+batch_size]
        data = run_westock(WESTOCK_DATA, ["kline", ",".join(batch), "--period", period, "--limit", str(limit)])
        if not data:
            continue
        if isinstance(data, list):
            for row in data:
                sym = row.get("symbol")
                if sym and sym in results:
                    results[sym].append(row)
    for sym in results:
        results[sym].sort(key=lambda x: x.get("date", ""))
    return results


def calc_ma(closes, window):
    if len(closes) < window:
        return None
    return sum(closes[-window:]) / window


def calc_sar(high, low, close):
    n = len(close)
    if n < 5:
        return None, 0
    trend = 1 if close[4] > close[0] else -1
    sar = low[0] if trend == 1 else high[0]
    ep = high[0] if trend == 1 else low[0]
    af = 0.02
    for i in range(1, n):
        new_sar = sar + af * (ep - sar)
        if trend == 1:
            new_sar = min(new_sar, low[i-1], low[max(0, i-2)])
            if low[i] < new_sar:
                trend = -1
                sar = max(high[i-1], ep)
                ep = low[i]
                af = 0.02
            else:
                sar = new_sar
                if high[i] > ep:
                    ep = high[i]
                    af = min(af + 0.02, 0.2)
        else:
            new_sar = max(new_sar, high[i-1], high[max(0, i-2)])
            if high[i] > new_sar:
                trend = 1
                sar = min(low[i-1], ep)
                ep = low[i]
                af = 0.02
            else:
                sar = new_sar
                if low[i] < ep:
                    ep = low[i]
                    af = min(af + 0.02, 0.2)
    return sar, trend


def is_limit_up(change_pct, code, name=""):
    pure = code.replace("sh", "").replace("sz", "").replace("bj", "")
    is_st = name.startswith("ST") or name.startswith("*ST")
    if pure.startswith("8") or pure.startswith("920"):
        return change_pct >= 29.9
    if pure.startswith("300") or pure.startswith("301") or pure.startswith("688"):
        return change_pct >= 19.9
    if is_st:
        return change_pct >= 4.9
    return change_pct >= 9.5


def exclude_basic(code, name):
    pure = code.replace("sh", "").replace("sz", "").replace("bj", "")
    if name.startswith("ST") or name.startswith("*ST"):
        return True
    if name.startswith("N") or name.startswith("C"):
        return True
    if pure.startswith("8") or pure.startswith("920"):
        return True
    return False


def ma_upward(klines, windows):
    if not klines or len(klines) < max(windows):
        return False
    closes = [k["last"] for k in klines]
    vals = [calc_ma(closes, w) for w in windows]
    vals = [v for v in vals if v is not None]
    if len(vals) < 2:
        return False
    return all(vals[i] > vals[i+1] for i in range(len(vals)-1))


def check_conditions(day_k, week_k, month_k, tech, quote):
    res = {}
    closes = [k["last"] for k in day_k]
    highs = [k["high"] for k in day_k]
    lows = [k["low"] for k in day_k]
    volumes = [k["volume"] for k in day_k]

    ma_windows = [5, 10, 20, 30, 50, 60, 90, 120, 250]
    mas = {w: calc_ma(closes, w) for w in ma_windows}
    ma_values = [mas[w] for w in ma_windows if mas[w] is not None]
    ma_bullish = all(ma_values[i] > ma_values[i+1] for i in range(len(ma_values)-1)) if len(ma_values) >= 2 else False
    rising_3d = len(closes) >= 4 and closes[-1] > closes[-2] > closes[-3] > closes[-4]
    res["ma_bullish"] = ma_bullish
    res["rising_3d"] = rising_3d
    res["ma_values"] = {f"MA{w}": round(mas[w], 3) if mas[w] else None for w in ma_windows}

    if len(volumes) >= 21:
        vol_ma20 = sum(volumes[-21:-1]) / 20
        vol_ratio_today = volumes[-1] / vol_ma20 if vol_ma20 else 0
        vol_ratio_yesterday = volumes[-2] / vol_ma20 if vol_ma20 else 0
        vol_3x = vol_ratio_today >= 3.0 and vol_ratio_yesterday >= 3.0
    else:
        vol_ratio_today = vol_ratio_yesterday = 0
        vol_3x = False
    res["vol_ratio_today"] = round(vol_ratio_today, 2)
    res["vol_ratio_yesterday"] = round(vol_ratio_yesterday, 2)
    res["vol_3x_maintain"] = vol_3x

    one_year_high = max(highs[:-1]) if len(highs) > 1 else 0
    res["break_1y_high"] = highs[-1] >= one_year_high * 0.99 if one_year_high else False
    res["one_year_high"] = round(one_year_high, 2)

    macd = tech.get("macd", {}) if tech else {}
    dif = macd.get("DIF", 0)
    dea = macd.get("DEA", 0)
    macd_hist = macd.get("MACD", 0)
    price = quote.get("price", closes[-1] if closes else 0)
    near_zero = abs(dif) / price < 0.015 if price else False
    macd_golden = dif > dea and macd_hist > 0
    res["macd_golden"] = macd_golden
    res["macd_near_zero"] = near_zero
    res["macd"] = macd

    sar, trend = calc_sar(highs, lows, closes)
    res["sar_value"] = round(sar, 3) if sar else None
    res["sar_red"] = trend == 1

    res["break_resistance"] = closes[-1] >= one_year_high * 0.98 if one_year_high else False

    boll = tech.get("boll", {}) if tech else {}
    upper = boll.get("BOLL_UPPER")
    res["boll_upper"] = round(upper, 3) if upper else None
    res["along_boll_upper"] = (closes[-1] >= upper * 0.98) if upper else False

    # 云端无通达信 ZJTJ，该条件恒为不命中（云端满分 90）
    res["zjtj_purple"] = False
    res["zjtj_value"] = None

    change_pct = quote.get("change_percent", 0)
    name = quote.get("name", "")
    code = quote.get("code", "")
    res["limit_up"] = is_limit_up(change_pct, code, name)
    res["change_pct"] = change_pct

    daily_res = ma_upward(day_k, [5, 10, 20])
    weekly_res = ma_upward(week_k, [5, 10, 20])
    monthly_res = ma_upward(month_k, [5, 10])
    res["daily_resonance"] = daily_res
    res["weekly_resonance"] = weekly_res
    res["monthly_resonance"] = monthly_res
    res["multi_resonance"] = daily_res and weekly_res and monthly_res

    leader_score = 0
    if res["limit_up"]:
        leader_score += 30
    if res["vol_3x_maintain"]:
        leader_score += 20
    if res["break_1y_high"]:
        leader_score += 20
    if res["multi_resonance"]:
        leader_score += 30
    res["leader_hotspot_score"] = leader_score
    res["leader_hotspot"] = leader_score >= 60

    score_parts = [
        (ma_bullish and rising_3d, 12),
        (vol_3x, 8),
        (res["break_1y_high"], 5),
        (macd_golden and near_zero, 8),
        (res["sar_red"], 8),
        (res["break_resistance"], 8),
        (res["zjtj_purple"], 10),
        (res["along_boll_upper"], 8),
        (res["limit_up"], 8),
        (res["multi_resonance"], 15),
        (res["leader_hotspot"], 10),
    ]
    total = sum(v for cond, v in score_parts if cond)
    res["score"] = total
    res["max_score"] = 100
    return res


def update_index(date, date_compact):
    idx_path = REPORT_DIR / "index.json"
    try:
        idx = json.loads(idx_path.read_text(encoding="utf-8"))
    except Exception:
        idx = {"reports": []}
    reports = [r for r in idx.get("reports", []) if r.get("date") != date]
    reports.insert(0, {"date": date, "file": f"screen_result_{date_compact}.json"})
    idx["reports"] = reports[:10]
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"index.json 已更新（共 {len(idx['reports'])} 期）")


def main():
    today = datetime.now()
    date = today.strftime("%Y-%m-%d")
    date_compact = today.strftime("%Y%m%d")
    print(f"[{datetime.now()}] [云端] 开始 {date} 主升浪选股...")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    candidates = get_candidate_pool(date)
    print(f"候选池去重后 {len(candidates)} 只")

    codes = [c["code"] for c in candidates]
    quotes = batch_call(codes, "quote", [], batch_size=10)
    print(f"quote 获取成功 {len(quotes)} 只")

    filtered = []
    for cand in candidates:
        code = cand["code"]
        q = quotes.get(code)
        if not q:
            continue
        name = q.get("name", cand.get("name", ""))
        if exclude_basic(code, name):
            continue
        turnover = q.get("turnover_rate", 0) or 0
        amount = q.get("amount", 0) or 0
        change_pct = q.get("change_percent", 0) or 0
        if turnover < 2.0 or amount < 3e8 or change_pct <= 0:
            continue
        cand["name"] = name
        cand["price"] = q.get("price", 0)
        cand["change_percent"] = change_pct
        cand["turnover_rate"] = turnover
        cand["amount_yi"] = amount / 1e8
        filtered.append(cand)

    print(f"基础过滤后 {len(filtered)} 只")
    filtered_codes = [c["code"] for c in filtered]

    day_klines = batch_klines(filtered_codes, "day", 365, batch_size=4)
    week_klines = batch_klines(filtered_codes, "week", 60, batch_size=4)
    month_klines = batch_klines(filtered_codes, "month", 24, batch_size=4)
    tech_data = batch_call(filtered_codes, "technical", ["--group", "macd,boll"], batch_size=8)
    print(f"kline/technical 获取成功 day={len(day_klines)} week={len(week_klines)} month={len(month_klines)} tech={len(tech_data)}")

    results = []
    for cand in filtered:
        code = cand["code"]
        if code not in day_klines or not day_klines[code]:
            continue
        tech = {
            "macd": (tech_data.get(code) or {}).get("macd", {}),
            "boll": (tech_data.get(code) or {}).get("boll", {}),
        }
        cond = check_conditions(
            day_klines[code],
            week_klines.get(code, []),
            month_klines.get(code, []),
            tech,
            quotes[code],
        )
        results.append({**cand, "conditions": cond})

    results.sort(key=lambda x: x["conditions"]["score"], reverse=True)

    report = {
        "date": date,
        "generated_at": datetime.now().isoformat(),
        "generated_by": "cloud",
        "candidate_count": len(results),
        "stocks": results,
    }

    json_path = REPORT_DIR / f"screen_result_{date_compact}.json"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"JSON 已写入 {json_path}")
    update_index(date, date_compact)

    print("\n评分排序（前20）：")
    for r in results[:20]:
        c = r["conditions"]
        print(f"{r['code']} {r['name']:8} 得分:{c['score']:3} 涨停:{c['limit_up']} "
              f"MA多头:{c['ma_bullish']} 连涨3天:{c['rising_3d']} 量3x:{c['vol_3x_maintain']} "
              f"MACD:{c['macd_golden']} SAR红:{c['sar_red']} 布林上轨:{c['along_boll_upper']} "
              f"破1年高:{c['break_1y_high']} 多周期共振:{c['multi_resonance']}")


if __name__ == "__main__":
    main()
