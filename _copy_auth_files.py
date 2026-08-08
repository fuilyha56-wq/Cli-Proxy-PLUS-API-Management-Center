#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""复制容器内认证文件到宿主机并检查 .oauth 状态。"""
import paramiko
import time

HOST = "47.115.216.131"
PORT = 22
USER = "ikun"
PASS = "114514"
SUDO_PASS = "114514"
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
        # 1. 给宿主机 auths 目录临时开放权限
        print("== 1. 开放 auths 目录权限 ==")
        cmd = f"echo '{SUDO_PASS}' | sudo -S chmod 777 /opt/cliproxy/auths 2>&1"
        out, err, code = run(client, cmd)
        print(out.strip() or "(ok)")
        if err.strip():
            print("[stderr]", err.strip()[:200])

        # 2. 复制容器内认证文件到宿主机
        print("\n== 2. 复制容器内认证到宿主机 ==")
        cmd = "docker cp cliproxy:/opt/cliproxy/auths/. /opt/cliproxy/auths/ 2>&1; ls -la /opt/cliproxy/auths/"
        out, err, code = run(client, cmd, timeout=60)
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:200])

        # 3. 查看 .oauth 内容（确认 code 已记录）
        print("\n== 3. .oauth 文件内容 ==")
        out, err, code = run(client, "cat /opt/cliproxy/auths/.oauth-gemini-cli-BVrwHQMpa4j0mAfYahgiqeE0747MAOPc.oauth 2>/dev/null; echo; ls -la /opt/cliproxy/auths/ | grep oauth")
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:200])

        # 4. 检查容器内当前 .oauth（重启后是否还在）
        print("\n== 4. 容器内 .oauth ==")
        out, err, code = run(client, "docker exec cliproxy ls -la /opt/cliproxy/auths/ 2>&1")
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:200])

        # 5. 现在 auth-dir 已改为 /root/.cli-proxy-api（挂载宿主机 /opt/cliproxy/auths）
        #    检查当前认证列表
        print("\n== 5. 当前认证列表 ==")
        cmd = (
            f"curl -s -H 'Authorization: Bearer {MANAGEMENT_KEY}' "
            f"'http://127.0.0.1:8317/v0/management/auth-files' | "
            f"python3 -c \"import sys,json; d=json.load(sys.stdin); "
            f"[print(f\\\"{{f['name']}} | {{f['provider']}} | {{f['status']}}\\\") for f in d.get('files',[])]\" 2>&1"
        )
        out, err, code = run(client, cmd, timeout=30)
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:200])
    finally:
        client.close()


if __name__ == "__main__":
    main()
