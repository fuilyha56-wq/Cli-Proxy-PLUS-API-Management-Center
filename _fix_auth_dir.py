#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证 auth-dir 路径问题并修复为容器内路径。"""
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
        # 1. 查看容器内 /opt/cliproxy/auths 是否有文件（宿主机是空的）
        print("== 1. 容器内 /opt/cliproxy/auths ==")
        out, err, code = run(client, "docker exec cliproxy ls -la /opt/cliproxy/auths/ 2>&1")
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:200])

        # 2. 容器内 /root/.cli-proxy-api（挂载目标）
        print("\n== 2. 容器内 /root/.cli-proxy-api ==")
        out, err, code = run(client, "docker exec cliproxy ls -la /root/.cli-proxy-api/ 2>&1")
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:200])

        # 3. 当前 config.yaml 的 auth-dir
        print("\n== 3. config.yaml auth-dir ==")
        out, err, code = run(client, "grep 'auth-dir' /opt/cliproxy/config.yaml")
        print(out.strip() or "(空)")

        # 4. 容器挂载信息
        print("\n== 4. 容器挂载 ==")
        out, err, code = run(client, "docker inspect cliproxy --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'")
        print(out.strip() or "(空)")

        # 5. 修复 auth-dir 为容器内路径 /root/.cli-proxy-api
        print("\n== 5. 修复 auth-dir ==")
        sftp = client.open_sftp()
        with sftp.open("/opt/cliproxy/config.yaml", "r") as f:
            content = f.read().decode()
        if "auth-dir: /opt/cliproxy/auths" in content:
            content = content.replace("auth-dir: /opt/cliproxy/auths", "auth-dir: /root/.cli-proxy-api")
            with sftp.open("/opt/cliproxy/config.yaml", "w") as f:
                f.write(content)
            print("已修改 auth-dir -> /root/.cli-proxy-api")
        else:
            print("无需修改（当前值：", [l for l in content.splitlines() if 'auth-dir' in l], ")")
        sftp.close()

        # 6. 复制容器内已有认证到宿主机（保留 antigravity）
        print("\n== 6. 复制容器内认证到宿主机 ==")
        cmd = (
            f"docker cp cliproxy:/opt/cliproxy/auths/. /opt/cliproxy/auths/ 2>&1; "
            f"echo '{SUDO_PASS}' | sudo -S chown -R ikun:ikun /opt/cliproxy/auths 2>&1; "
            f"ls -la /opt/cliproxy/auths/"
        )
        out, err, code = run(client, cmd, timeout=60)
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:200])

        # 7. 重启主程序
        print("\n== 7. 重启主程序 ==")
        out, err, code = run(client, "cd /home/ikun/cliproxy && docker compose restart", timeout=300)
        print(out.strip() or "(ok)")
        if err.strip():
            print("[stderr]", err.strip()[:200])
        time.sleep(12)

        # 8. 验证认证列表
        print("\n== 8. 验证认证列表 ==")
        cmd = (
            f"curl -s -H 'Authorization: Bearer {MANAGEMENT_KEY}' "
            f"'http://127.0.0.1:8317/v0/management/auth-files' | "
            f"python3 -c \"import sys,json; d=json.load(sys.stdin); "
            f"[print(f\\\"{{f['name']}} | {{f['provider']}} | {{f['status']}} | {{f['path']}}\\\") for f in d.get('files',[])]\""
        )
        out, err, code = run(client, cmd, timeout=30)
        print(out.strip() or "(空)")
        if err.strip():
            print("[stderr]", err.strip()[:200])
    finally:
        client.close()


if __name__ == "__main__":
    main()
