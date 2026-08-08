#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""查询 get-auth-status 并尝试完成 gemini-cli token 交换。"""
import paramiko
import json
import time

HOST = "47.115.216.131"
PORT = 22
USER = "ikun"
PASS = "114514"
MANAGEMENT_KEY = "lycoris-radaita-qazxcwed112"

STATE = "BVrwHQMpa4j0mAfYahgiqeE0747MAOPc"


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 60) -> tuple[str, str, int]:
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return out, err, code


def main() -> None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=20, allow_agent=False, look_for_keys=False)
    try:
        for attempt in range(5):
            print(f"===== 检查 #{attempt+1} =====")
            # 1. get-auth-status
            cmd = (
                f"curl -s -H 'Authorization: Bearer {MANAGEMENT_KEY}' "
                f"'http://127.0.0.1:8317/v0/management/get-auth-status?state={STATE}'"
            )
            out, err, code = run(client, cmd, timeout=30)
            print("[auth-status]", out.strip())
            if err.strip():
                print("[stderr]", err.strip()[:200])

            # 2. 认证列表
            cmd = (
                f"curl -s -H 'Authorization: Bearer {MANAGEMENT_KEY}' "
                f"'http://127.0.0.1:8317/v0/management/auth-files' | "
                f"python3 -c \"import sys,json; d=json.load(sys.stdin); "
                f"[print(f\\\"{{f['name']}} | {{f['provider']}} | {{f['status']}}\\\") for f in d.get('files',[])]\" 2>&1"
            )
            out, err, code = run(client, cmd, timeout=30)
            print("[认证列表]", out.strip() or "(空)")
            if err.strip():
                print("[stderr]", err.strip()[:200])

            # 3. .oauth 是否被消费
            cmd = "ls /opt/cliproxy/auths/.oauth* 2>/dev/null; echo '---'; cat /opt/cliproxy/auths/*gemini* 2>/dev/null | head -c 300"
            out, err, code = run(client, cmd, timeout=30)
            print("[oauth文件]", out.strip() or "(无)")
            if err.strip():
                print("[stderr]", err.strip()[:200])

            if attempt < 4:
                print("...等待 10s...")
                time.sleep(10)
    finally:
        client.close()


if __name__ == "__main__":
    main()
