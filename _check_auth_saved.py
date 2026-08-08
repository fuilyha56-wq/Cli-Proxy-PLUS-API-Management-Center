#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检查认证是否已保存。"""
import paramiko

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
        checks = [
            ("auths 目录", "ls -la /opt/cliproxy/auths/ 2>/dev/null"),
            ("认证文件内容", "cat /opt/cliproxy/auths/*.json 2>/dev/null | head -60"),
            ("主程序日志(最近)", "docker logs cliproxy 2>&1 | tail -20"),
        ]
        for title, cmd in checks:
            out, err, code = run(client, cmd, timeout=30)
            print(f"===== {title} =====")
            print(out.strip() or "(空)")
            if err.strip():
                print("[stderr]", err.strip()[:300])
            print()
    finally:
        client.close()


if __name__ == "__main__":
    main()
