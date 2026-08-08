#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""发起 Gemini CLI 授权并输出授权 URL。"""
import paramiko
import json

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
        print("== 发起 Gemini CLI 授权 ==")
        cmd = (
            f"curl -s -H 'Authorization: Bearer {MANAGEMENT_KEY}' "
            f"'http://127.0.0.1:8317/v0/management/gemini-cli-auth-url?is_webui=true'"
        )
        out, err, code = run(client, cmd, timeout=30)
        data = json.loads(out.split("\n")[0])
        state = data.get("state", "")
        url = data.get("url", "")
        print(f"STATE: {state}")
        print(f"\n授权 URL:\n{url}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
