#!/usr/bin/env python3
"""
开盘啦（KPL）数据快照抓取 —— GitHub Actions 定时运行
抓取市场情绪 / 涨停天梯 / 涨停原因三个接口，保存为静态 JSON 供 GitHub Pages 前端读取。
关键点：开盘啦接口对浏览器 UA 返回空数据，必须用非浏览器 UA（okhttp）。
"""
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data"

KPL_HQ = "https://apphwhq.longhuvip.com/w1/api/index.php"
KPL_HIS = "https://apphis.longhuvip.com/w1/api/index.php"
BASE_PARAMS = {
    "apiv": "w47", "PhoneOSNew": "1", "VerSion": "6.2.20.2", "Red": "0",
    "DeviceID": "", "Token": "", "UserID": "",
}
HEADERS = {
    "User-Agent": "okhttp/3.12.0",
    "Referer": "https://kaipanla.com/",
}


def beijing_today():
    return datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")


def kpl_get(base, params):
    qs = urllib.parse.urlencode({**BASE_PARAMS, **params})
    req = urllib.request.Request(f"{base}?{qs}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def prev_workday(date_str):
    d = datetime.strptime(date_str, "%Y-%m-%d")
    while True:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            return d.strftime("%Y-%m-%d")


def save(name, payload):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"saved {path.name} ({path.stat().st_size} bytes)")


def fetch_emotion():
    data = kpl_get(KPL_HIS, {"a": "ChangeStatistics", "c": "HisHomeDingPan", "st": "10", "Index": "0"})
    save("kpl-emotion.json", {"success": True, "data": data, "fetchedAt": beijing_today()})


def fetch_ladder():
    data = kpl_get(KPL_HQ, {"a": "GetZhangTingTianTi_W47", "c": "FuPanLa"})
    save("kpl-ladder.json", {"success": True, "data": data, "fetchedAt": beijing_today()})


def fetch_reasons():
    date = beijing_today()
    data = kpl_get(KPL_HIS, {"a": "GetPlateInfo_w38", "c": "HisLimitResumption", "st": "100", "Index": "0", "Date": date})
    # 盘前/假日当日无数据时，自动回退到最近的交易日（最多回溯 5 个交易日）
    tries = 0
    while (not data.get("list")) and tries < 5:
        date = prev_workday(date)
        data = kpl_get(KPL_HIS, {"a": "GetPlateInfo_w38", "c": "HisLimitResumption", "st": "100", "Index": "0", "Date": date})
        tries += 1
    save("kpl-reasons.json", {"success": True, "data": data, "queryDate": date})


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    tasks = {"emotion": fetch_emotion, "ladder": fetch_ladder, "reasons": fetch_reasons}
    failed = []
    for name, fn in tasks.items():
        if only and name != only:
            continue
        try:
            fn()
        except Exception as e:
            print(f"{name} failed: {e}", file=sys.stderr)
            failed.append(name)
    if failed:
        sys.exit(f"failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
