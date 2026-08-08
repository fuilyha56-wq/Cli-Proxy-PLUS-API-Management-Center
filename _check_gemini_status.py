#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""等待后再次检查 Gemini CLI 认证状态。"""
import paramiko
import time

HOST = "47.115.216.131"
PORT = 22
USER = "ikun"
PASS = "114514"
MANAGEMENT_KEY = "lycoris-radaita-qazxcwed112"


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
        for attempt in range(3):
            print(f"===== 检查 #{attempt+1} =====")
            out, err, code = run(client, "ls -la /opt/cliproxy/auths/ 2>/dev/null")
            print("[目录]", out.strip())
            # 检查 gemini 相关认证
            cmd = (
                f"curl -s -H 'Authorization: Bearer {MANAGEMENT_KEY}' "
                f"'http://127.0.0.1:8317/v0/management/auth-files' | "
                f"python3 -c \"import sys,json; d=json.load(sys.stdin); "
                f"[print(f\\\"{{f['name']}} | {{f['provider']}} | {{f['status']}}\\\") for f in d.get('files',[])]\""
            )
            out, err, code = run(client, cmd, timeout=30)
            print("[认证列表]", out.strip() or "(空)")
            if err.strip():
                print("[stderr]", err.strip()[:200])
            # 检查日志中的 gemini 相关
            out, err, code = run(client, "docker logs cliproxy 2>&1 | grep -iE 'gemini|oauth' | tail -10")
            print("[日志]", out.strip() or "(无)")
            if attempt < 2:
                print("...等待 15s...")
                time.sleep(15)
    finally:
        client.close()


if __name__ == "__main__":
    main()
