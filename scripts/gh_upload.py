#!/usr/bin/env python3
"""通过 GitHub Contents API 上传 gh-workbench 目录到 userjudy777/workbench 仓库"""
import base64
import json
import sys
import urllib.request
from pathlib import Path

TOKEN = sys.argv[1]
OWNER = "userjudy777"
REPO = "workbench"
ROOT = Path(__file__).resolve().parent.parent  # gh-workbench/

API = f"https://api.github.com/repos/{OWNER}/{REPO}/contents"

def api_req(url, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"token {TOKEN}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())

def get_sha(path):
    try:
        return api_req(f"{API}/{path}")["sha"]
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

def upload(path, local: Path, msg):
    sha = get_sha(path)
    payload = {
        "message": msg,
        "content": base64.b64encode(local.read_bytes()).decode(),
    }
    if sha:
        payload["sha"] = sha
    api_req(f"{API}/{path}", "PUT", payload)
    print(f"  ✓ {path} ({local.stat().st_size}B)")

def main():
    files = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or ".git" in p.parts or "__pycache__" in p.parts:
            continue
        rel = p.relative_to(ROOT).as_posix()
        if rel.endswith(".pyc"):
            continue
        files.append((rel, p))

    print(f"共 {len(files)} 个文件待上传")
    failed = []
    for rel, p in files:
        try:
            upload(rel, p, "初始部署：工作台站点 + 选股脚本 + 自动化配置")
        except Exception as e:
            print(f"  ✗ {rel}: {e}", file=sys.stderr)
            failed.append(rel)
    if failed:
        sys.exit(f"上传失败: {failed}")
    print("全部上传完成")

if __name__ == "__main__":
    main()
