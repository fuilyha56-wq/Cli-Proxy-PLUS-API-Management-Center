#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""提交 OAuth 回调完成 Gemini CLI 登录。"""
import paramiko
import json
import time

HOST = "47.115.216.131"
PORT = 22
USER = "ikun"
PASS = "114514"
MANAGEMENT_KEY = "lycoris-radaita-qazxcwed112"

REDIRECT_URL = "http://127.0.0.1:8317/v0/management/oauth-callback?state=BVrwHQMpa4j0mAfYahgiqeE0747MAOPc&iss=https://accounts.google.com&code=4/0AXEQxIBIOEADdXQoqdlEGoTZBywc2XeUNrzwhdmuVkbGN9xHwVDF5Is-wp0SJ7UA68k6Og&scope=email%20profile%20https://www.googleapis.com/auth/cloud-platform%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile%20openid&authuser=0&prompt=consent"


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 120) -> tuple[str, str, int]:
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
        # 1. 提交回调
        print("== 1. 提交回调 URL ==")
        payload = json.dumps({"provider": "gemini-cli", "redirect_url": REDIRECT_URL})
        cmd = (
            f"curl -s -w '\\nHTTP %{{http_code}}' -X POST "
            f"http://127.0.0.1:8317/v0/management/oauth-callback "
            f"-H 'Content-Type: application/json' "
            f"-H 'Authorization: Bearer {MANAGEMENT_KEY}' "
            f"-d '{payload}'"
        )
        out, err, code = run(client, cmd, timeout=30)
        print(out.strip())
        if err.strip():
            print("[stderr]", err.strip()[:300])

        # 2. 等待 token 交换
        print("\n== 2. 等待 token 交换 (20s) ==")
        time.sleep(20)

        # 3. 检查认证文件
        print("== 3. 检查认证文件 ==")
        out, err, code = run(client, "ls -la /opt/cliproxy/auths/ 2>/dev/null; echo '---'; cat /opt/cliproxy/auths/*.json 2>/dev/null | head -80")
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:300])

        # 4. 检查主程序日志
        print("\n== 4. 主程序日志 ==")
        out, err, code = run(client, "docker logs cliproxy 2>&1 | tail -15")
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:300])

        # 5. 查询 auth-files 列表
        print("\n== 5. 认证列表 ==")
        cmd = (
            f"curl -s -H 'Authorization: Bearer {MANAGEMENT_KEY}' "
            f"'http://127.0.0.1:8317/v0/management/auth-files' | head -c 2000"
        )
        out, err, code = run(client, cmd, timeout=30)
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:300])
    finally:
        client.close()


if __name__ == "__main__":
    main()
