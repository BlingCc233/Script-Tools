
# 使用指南：
# 注册好https://wispbyte.com/后Create server，选择free plan，选择python。
# 之后在这个server的控制台找到files选项卡，我们只需要上传这个python脚本。
# 上传后找到startup.py后面的三个点，选择它Use on startup。
# 然后回到console运行，输出结果会给出v2ray、shadowrocket、clash、sing-box的单项节点配置，复制下来直接可用。

import os
import sys
import json
import uuid
import shutil
import subprocess
import time
import base64
from urllib.parse import quote
import urllib.request
import tarfile

# --- 节点配置信息 (在console可以看到ip和端口) ---
# 服务器公网 IP
SERVER_IP = ""
# 监听端口
SERVER_PORT = ""
# Reality Private Key (用于服务器配置) ，你可以从https://onecompiler.com/bash/444jeteut使用下面这行的命令生成密钥对，然后站贴在下方对应位置
# pkey=$(openssl genpkey -algorithm X25519); priv_key=$(echo "$pkey" | openssl pkey -inform PEM -outform DER | tail -c 32 | base64 | tr '+/' '-_' | tr -d '='); pub_key=$(echo "$pkey" | openssl pkey -inform PEM -pubout -outform DER | tail -c 32 | base64 | tr '+/' '-_' | tr -d '='); echo "Private key: $priv_key"; echo "Public key: $pub_key"
PRIVATE_KEY = ""
# Reality Public Key (用于客户端配置)
PUBLIC_KEY = ""
# 偷取的域名 (Server Name Indication)
DEST_SERVER_NAME = "edge-173.hkhkg2.icloud-content.com"
# Reality Short ID
SHORT_ID = "1234daef"
# UUID (如果留空，脚本会自动生成一个)
USER_UUID = "" 

# --- 脚本内部设置 (下面的不用改) ---
# sing-box 下载信息
SINGBOX_VERSION = "1.12.12"
SINGBOX_DOWNLOAD_URL = f"https://github.com/SagerNet/sing-box/releases/download/v{SINGBOX_VERSION}/sing-box-{SINGBOX_VERSION}-linux-amd64.tar.gz"
SINGBOX_ARCHIVE_NAME = f"sing-box-{SINGBOX_VERSION}-linux-amd64.tar.gz"
SINGBOX_EXTRACTED_DIR = f"sing-box-{SINGBOX_VERSION}-linux-amd64"
# sing-box 二进制文件名 
SINGBOX_BINARY_NAME = "sing-box"
# 生成的服务器配置文件名
CONFIG_FILE_NAME = "config.json"
# 目标 /tmp 目录下的二进制文件名
TMP_SINGBOX_PATH = f"/tmp/{SINGBOX_BINARY_NAME}"


def check_and_download_singbox():
    """检查 sing-box 文件是否存在，如果不存在则自动下载并解压。"""
    if os.path.exists(SINGBOX_BINARY_NAME):
        print(f"✅ '{SINGBOX_BINARY_NAME}' 文件已存在，跳过下载。")
        return True

    print(f"ℹ️ '{SINGBOX_BINARY_NAME}' 文件未找到，开始自动下载...")
    try:
        # 1. 下载文件
        print(f"📥 正在从 {SINGBOX_DOWNLOAD_URL} 下载...")
        urllib.request.urlretrieve(SINGBOX_DOWNLOAD_URL, SINGBOX_ARCHIVE_NAME)
        print("✅ 下载完成。")

        # 2. 解压 .tar.gz 文件
        print(f"📦 正在解压 '{SINGBOX_ARCHIVE_NAME}'...")
        with tarfile.open(SINGBOX_ARCHIVE_NAME, 'r:gz') as tar:
            tar.extractall()
        print("✅ 解压完成。")

        # 3. 将可执行文件移动到当前目录
        source_path = os.path.join(SINGBOX_EXTRACTED_DIR, SINGBOX_BINARY_NAME)
        if os.path.exists(source_path):
            shutil.move(source_path, SINGBOX_BINARY_NAME)
            print(f"✅ 已将 '{SINGBOX_BINARY_NAME}' 移动到当前目录。")
        else:
            raise FileNotFoundError(f"在解压目录中未找到 '{SINGBOX_BINARY_NAME}'")
      
        return True

    except Exception as e:
        print(f"❌ 下载或解压 sing-box 时发生错误: {e}")
        return False
  
    finally:
        # 4. 清理下载的压缩包和解压后的文件夹
        print("🧹 正在进行清理...")
        if os.path.exists(SINGBOX_ARCHIVE_NAME):
            os.remove(SINGBOX_ARCHIVE_NAME)
        if os.path.exists(SINGBOX_EXTRACTED_DIR):
            shutil.rmtree(SINGBOX_EXTRACTED_DIR)
        print("✅ 清理完成。")


def generate_server_config():
    """根据配置信息生成 sing-box 服务器的 config.json 文件"""
    global USER_UUID # 声明使用全局变量以便修改
    if not USER_UUID:
        USER_UUID = str(uuid.uuid4())
        print(f"ℹ️ UUID 为空，已自动生成: {USER_UUID}")

    if not all([SERVER_IP, SERVER_PORT, PRIVATE_KEY, PUBLIC_KEY]):
        print("❌ 错误: SERVER_IP, SERVER_PORT, PRIVATE_KEY, PUBLIC_KEY 必须全部填写。")
        print("Wispbyte 平台会自动设置 SERVER_IP 和 SERVER_PORT 环境变量。")
        print("请确保你已经生成并填写了密钥对 (PRIVATE_KEY, PUBLIC_KEY)。")
        return False
  
    config = {
        "log": {
            "level": "info",
            "timestamp": True
        },
        "inbounds": [
            {
                "type": "vless",
                "tag": "vless-in",
                "listen": "::",
                "listen_port": int(SERVER_PORT),
                "users": [
                    {
                        "uuid": USER_UUID,
                        "flow": "xtls-rprx-vision"
                    }
                ],
                "tls": {
                    "enabled": True,
                    "server_name": DEST_SERVER_NAME,
                    "reality": {
                        "enabled": True,
                        "handshake": {
                            "server": DEST_SERVER_NAME,
                            "server_port": 443
                        },
                        "private_key": PRIVATE_KEY,
                        "short_id": [
                            SHORT_ID
                        ]
                    }
                }
            }
        ],
        "outbounds": [
            {
                "type": "direct",
                "tag": "direct"
            }
        ]
    }

    try:
        with open(CONFIG_FILE_NAME, 'w') as f:
            json.dump(config, f, indent=4)
        print(f"✅ 服务器配置文件 '{CONFIG_FILE_NAME}' 生成成功。")
        return True
    except IOError as e:
        print(f"❌ 错误: 无法写入服务器配置文件 '{CONFIG_FILE_NAME}': {e}")
        return False

def generate_client_configs():
    """生成并打印所有客户端的配置信息"""
    print() 
    print( "="*50)
    print("🎉 sing-box 节点搭建成功！客户端配置如下：")
    print("="*50)
    print() 

    # --- 1. VLESS 链接 (适用于 V2RayN, NekoBox, etc.) ---
    vless_params = {
        "encryption": "none",
        "security": "reality",
        "sni": DEST_SERVER_NAME,
        "fp": "ios",  # Fingerprint, chrome is a common choice
        "pbk": PUBLIC_KEY,
        "sid": SHORT_ID,
        "type": "tcp",
        "flow": "xtls-rprx-vision"
    }
    params_str = "&".join([f"{k}={quote(str(v))}" for k, v in vless_params.items()])
    node_name = quote(f"VLESS-Reality-{SERVER_IP}")
    vless_url = f"vless://{USER_UUID}@{SERVER_IP}:{SERVER_PORT}?{params_str}#{node_name}"

    print("---------- VLESS URL (Xray-Core / v2fly-core) ----------")
    print("可用于 V2RayN, NekoBox, ShadowRocket(小火箭), PassWall 等客户端")
    print(vless_url)
    print("-" * 50)
    print() 


    # --- 2. Clash.Meta 配置 (YAML格式) ---
    clash_config = f"""
- name: "VLESS-Reality-{SERVER_IP}"
  type: vless
  server: {SERVER_IP}
  port: {SERVER_PORT}
  uuid: {USER_UUID}
  network: tcp
  tls: true
  flow: xtls-rprx-vision
  client-fingerprint: ios
  servername: {DEST_SERVER_NAME}
  reality-opts:
    public-key: {PUBLIC_KEY}
    short-id: {SHORT_ID}
"""
    print("---------- Clash.Meta (YAML) ----------")
    print("适用于 Clash Verge, NekoBox(Clash-Meta内核), Stash 等客户端")
    print(clash_config)
    print("-" * 50)
    print() 

    # --- 3. sing-box 客户端配置 (JSON格式) ---
    singbox_client_config = {
        "type": "vless",
        "tag": f"vless-out-{SERVER_IP}",
        "server": SERVER_IP,
        "server_port": int(SERVER_PORT),
        "uuid": USER_UUID,
        "flow": "xtls-rprx-vision",
        "tls": {
            "enabled": True,
            "server_name": DEST_SERVER_NAME,
            "utls": {
                "enabled": True,
                "fingerprint": "ios"
            },
            "reality": {
                "enabled": True,
                "public_key": PUBLIC_KEY,
                "short_id": SHORT_ID
            }
        }
    }
    print("---------- sing-box 客户端 (JSON Outbound) ----------")
    print("请将下面的 JSON 对象添加到客户端配置的 'outbounds' 数组中")
    print(json.dumps(singbox_client_config, indent=2))
    print("-" * 50)
    print() 


def run_and_watchdog():
    """
    处理二进制文件权限问题，并启动和守护 sing-box 进程
    """
    source_path = os.path.join(os.getcwd(), SINGBOX_BINARY_NAME)

    # 1. 检查本地 sing-box 文件是否存在(下载步骤后的二次确认)
    if not os.path.exists(source_path):
        print(f"❌ 致命错误: '{SINGBOX_BINARY_NAME}' 在当前目录下未找到。脚本已终止。")
        sys.exit(1)

    # 2. 复制文件到 /tmp
    try:
        shutil.copy(source_path, TMP_SINGBOX_PATH)
        print(f"📂 已将 '{SINGBOX_BINARY_NAME}' 复制到 '{TMP_SINGBOX_PATH}'")
    except Exception as e:
        print(f"❌ 错误: 复制文件到 /tmp 失败: {e}")
        sys.exit(1)

    # 3. 尝试为 /tmp 下的副本添加执行权限
    try:
        os.chmod(TMP_SINGBOX_PATH, 0o755)
        print(f"🔑 已为 '{TMP_SINGBOX_PATH}' 添加执行权限。")
    except Exception as e:
        print(f"⚠️ 警告: 添加执行权限失败: {e}。如果 /tmp 目录已挂载为可执行，程序仍可能正常运行。")

    # 4. 守护进程循环
    while True:
        print() 
        print("🚀 正在启动 sing-box 服务...")
        try:
            # 启动 sing-box 进程
            process = subprocess.Popen([TMP_SINGBOX_PATH, "run", "-c", CONFIG_FILE_NAME])
      
            # 等待进程结束
            process.wait()
      
            # 如果进程结束 (code != 0 表示异常退出)
            if process.returncode != 0:
                print(f"🚨 sing-box 进程异常退出，返回码: {process.returncode}。")
            else:
                print("ℹ️ sing-box 进程已正常停止。")

        except FileNotFoundError:
             print(f"❌ 致命错误: 无法执行 '{TMP_SINGBOX_PATH}'。请检查 /tmp 目录是否被挂载为 noexec。")
             sys.exit(1)
        except Exception as e:
            print(f"❌ 启动 sing-box 时发生未知错误: {e}")
  
        print("🔧 5秒后将尝试重启服务...")
        time.sleep(5)


if __name__ == "__main__":
    if not check_and_download_singbox():
        sys.exit(1)

    if not generate_server_config():
        sys.exit(1)
  
    generate_client_configs()
  
    run_and_watchdog()





# ===========================

# 使用指南：
# 1. (可选) Wispbyte 平台: 注册 https://wispbyte.com/ 后 Create server，选择 free plan (Python)。
#    在 server 的 'files' 选项卡上传此 python 脚本。
#    找到 'startup.py' 旁边的三个点，选择 'Use on startup'。
# 2. 回到 'console' 选项卡运行脚本。
# 3. 脚本会自动下载 sing-box、生成配置并启动服务。
# 4. 控制台会输出 TUIC 的配置链接，复制后导入客户端即可使用。

import os
import sys
import json
import uuid
import shutil
import subprocess
import time
import urllib.request
import tarfile
import random

# --- 节点配置信息 ---
# 偷取的域名 (Server Name Indication)，保持默认即可
DEST_SERVER_NAME = "assets-xbxweb.xbox.com"
# 监听端口 (如果留空或为0，脚本会自动生成一个20000到60000之间的随机端口)
# 在 Wispbyte 平台，通常由环境变量 $SERVER_PORT 指定
SERVER_PORT = os.getenv("SERVER_PORT") or 9405
# UUID (如果留空，脚本会自动生成一个)
USER_UUID = ""
# 密码 (如果留空，脚本会自动生成一个)
PASSWORD = ""


# --- 脚本内部设置 (通常无需修改) ---
# sing-box 下载信息
SINGBOX_VERSION = "1.12.12" # 可以根据需要更新为最新稳定版
SINGBOX_DOWNLOAD_URL = f"https://github.com/SagerNet/sing-box/releases/download/v{SINGBOX_VERSION}/sing-box-{SINGBOX_VERSION}-linux-amd64.tar.gz"
SINGBOX_ARCHIVE_NAME = f"sing-box-{SINGBOX_VERSION}-linux-amd64.tar.gz"
SINGBOX_EXTRACTED_DIR = f"sing-box-{SINGBOX_VERSION}-linux-amd64"
# 二进制文件名
SINGBOX_BINARY_NAME = "sing-box"
# 配置文件名
CONFIG_FILE_NAME = "config.json"
# 证书和私钥文件名
CERT_PEM_NAME = "cert.pem"
KEY_PEM_NAME = "key.pem"
# /tmp 目录下的二进制文件路径
TMP_SINGBOX_PATH = f"/tmp/{SINGBOX_BINARY_NAME}"


def get_server_ip():
    """获取服务器的公网 IP 地址"""
    print("🌐 正在获取公网 IP...")
    try:
        with urllib.request.urlopen("https://api64.ipify.org", timeout=5) as response:
            ip = response.read().decode('utf-8')
            print(f"✅ 公网 IP: {ip}")
            return ip
    except Exception as e:
        print(f"⚠️ 警告: 获取公网 IP 失败: {e}。将使用 '127.0.0.1' 作为备用。")
        return "127.0.0.1"

def check_and_download_singbox():
    """检查 sing-box 是否存在，如果不存在则下载并解压。"""
    if os.path.exists(SINGBOX_BINARY_NAME):
        print(f"✅ '{SINGBOX_BINARY_NAME}' 已存在, 跳过下载。")
        return True

    print(f"ℹ️ '{SINGBOX_BINARY_NAME}' 未找到，开始下载...")
    try:
        print(f"📥 正在从 {SINGBOX_DOWNLOAD_URL} 下载...")
        urllib.request.urlretrieve(SINGBOX_DOWNLOAD_URL, SINGBOX_ARCHIVE_NAME)
        print("✅ 下载完成。")

        print(f"📦 正在解压 '{SINGBOX_ARCHIVE_NAME}'...")
        with tarfile.open(SINGBOX_ARCHIVE_NAME, 'r:gz') as tar:
            tar.extractall()
        print("✅ 解压完成。")

        source_path = os.path.join(SINGBOX_EXTRACTED_DIR, SINGBOX_BINARY_NAME)
        if os.path.exists(source_path):
            shutil.move(source_path, SINGBOX_BINARY_NAME)
            print(f"✅ 已将 '{SINGBOX_BINARY_NAME}' 移动到当前目录。")
        else:
            raise FileNotFoundError(f"在解压目录中未找到 '{SINGBOX_BINARY_NAME}'")
        return True
    except Exception as e:
        print(f"❌ 下载或解压 sing-box 时发生错误: {e}")
        return False
    finally:
        print("🧹 正在清理...")
        if os.path.exists(SINGBOX_ARCHIVE_NAME):
            os.remove(SINGBOX_ARCHIVE_NAME)
        if os.path.exists(SINGBOX_EXTRACTED_DIR):
            shutil.rmtree(SINGBOX_EXTRACTED_DIR)
        print("✅ 清理完成。")

def generate_certificate():
    """如果证书和私钥不存在，则生成自签名证书。"""
    if os.path.exists(CERT_PEM_NAME) and os.path.exists(KEY_PEM_NAME):
        print("🔐 证书和私钥已存在，跳过生成。")
        return True
    
    print("🔐 正在为 {} 生成自签名证书...".format(DEST_SERVER_NAME))
    try:
        # 使用 openssl 生成 ec akey
        cmd = [
            'openssl', 'req', '-x509', '-newkey', 'ec',
            '-pkeyopt', 'ec_paramgen_curve:prime256v1',
            '-keyout', KEY_PEM_NAME,
            '-out', CERT_PEM_NAME,
            '-subj', f'/CN={DEST_SERVER_NAME}',
            '-days', '3650', '-nodes'
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("✅ 证书生成成功。")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"❌ 错误: 生成证书失败。请确保 'openssl' 已安装并位于系统的 PATH 中。错误: {e}")
        return False
    except Exception as e:
        print(f"❌ 生成证书时发生未知错误: {e}")
        return False

def generate_server_config():
    """生成 sing-box TUIC 服务器的 config.json 文件。"""
    global SERVER_PORT, USER_UUID, PASSWORD

    # 如果配置文件存在，尝试加载现有配置
    if os.path.exists(CONFIG_FILE_NAME):
        try:
            with open(CONFIG_FILE_NAME, 'r') as f:
                config = json.load(f)
            inbound = config['inbounds'][0]
            SERVER_PORT = inbound['listen_port']
            USER_UUID = inbound['users'][0]['uuid']
            PASSWORD = inbound['users'][0]['password']
            print("📂 检测到现有配置文件，已加载配置。")
            return True
        except (IOError, json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"⚠️ 警告: 无法加载现有配置文件 ({e})，将生成新配置。")

    # 如果配置不存在或加载失败，生成新配置
    if not USER_UUID:
        USER_UUID = str(uuid.uuid4())
        print(f"ℹ️ UUID 为空，已自动生成: {USER_UUID}")
    if not PASSWORD:
        PASSWORD = ''.join(random.choices('0123456789abcdef', k=16))
        print(f"ℹ️ 密码为空，已自动生成: {PASSWORD}")
    if not SERVER_PORT or int(SERVER_PORT) == 0:
        SERVER_PORT = random.randint(20000, 60000)
        print(f"ℹ️ 端口为空，已自动选择随机端口: {SERVER_PORT}")
    
    SERVER_PORT = int(SERVER_PORT)

    config = {
        "log": {"level": "info", "timestamp": True},
        "inbounds": [{
            "type": "tuic",
            "tag": "tuic-in",
            "listen": "::",
            "listen_port": SERVER_PORT,
            "users": [{"uuid": USER_UUID, "password": PASSWORD}],
            "tls": {
                "enabled": True,
                "server_name": DEST_SERVER_NAME,
                "certificate_path": CERT_PEM_NAME,
                "key_path": KEY_PEM_NAME
            },
            "congestion_control": "bbr",
            "udp_relay_mode": "native"
        }],
        "outbounds": [{"type": "direct", "tag": "direct"}]
    }

    try:
        with open(CONFIG_FILE_NAME, 'w') as f:
            json.dump(config, f, indent=4)
        print(f"✅ 服务器配置文件 '{CONFIG_FILE_NAME}' 生成成功。")
        return True
    except IOError as e:
        print(f"❌ 错误: 无法写入服务器配置文件 '{CONFIG_FILE_NAME}': {e}")
        return False

def generate_client_link(ip):
    """生成并打印 TUIC 客户端的配置链接。"""
    params = {
        "congestion_control": "bbr",
        "alpn": "h3",
        "sni": DEST_SERVER_NAME,
        "allow_insecure": "1",
        "udp_relay_mode": "native"
    }
    param_str = "&".join([f"{k}={v}" for k, v in params.items()])
    tuic_link = f"tuic://{USER_UUID}:{PASSWORD}@{ip}:{SERVER_PORT}?{param_str}#TUIC-{ip}"
    
    print("\n" + "="*50)
    print("🎉 sing-box (TUIC) 节点搭建成功！")
    print("="*50 + "\n")
    print("---------- TUIC 配置链接 ----------")
    print("适用于 NekoBox, Stash, AnXray, V2rayNG 等客户端")
    print(tuic_link)
    print("\n" + "-"*50 + "\n")


def run_and_watchdog():
    """处理二进制文件权限，并启动和守护 sing-box 进程。"""
    source_path = os.path.join(os.getcwd(), SINGBOX_BINARY_NAME)

    if not os.path.exists(source_path):
        print(f"❌ 致命错误: '{SINGBOX_BINARY_NAME}' 未找到。脚本终止。")
        sys.exit(1)

    try:
        shutil.copy(source_path, TMP_SINGBOX_PATH)
        print(f"📂 已将 '{SINGBOX_BINARY_NAME}' 复制到 '{TMP_SINGBOX_PATH}'")
    except Exception as e:
        print(f"❌ 错误: 复制文件到 /tmp 失败: {e}")
        sys.exit(1)

    try:
        os.chmod(TMP_SINGBOX_PATH, 0o755)
        print(f"🔑 已为 '{TMP_SINGBOX_PATH}' 添加执行权限。")
    except Exception as e:
        print(f"⚠️ 警告: 添加执行权限失败: {e}。程序仍可能正常运行。")

    while True:
        print("\n🚀 正在启动 sing-box 服务...")
        try:
            process = subprocess.Popen([TMP_SINGBOX_PATH, "run", "-c", CONFIG_FILE_NAME])
            process.wait()
            
            if process.returncode != 0:
                print(f"🚨 sing-box 进程异常退出，返回码: {process.returncode}。")
            else:
                print("ℹ️ sing-box 进程已正常停止。")

        except FileNotFoundError:
             print(f"❌ 致命错误: 无法执行 '{TMP_SINGBOX_PATH}'。请检查 /tmp 目录是否被挂载为 noexec。")
             sys.exit(1)
        except Exception as e:
            print(f"❌ 启动 sing-box 时发生未知错误: {e}")
        
        print("🔧 5秒后将尝试重启服务...")
        time.sleep(5)


if __name__ == "__main__":
    if not check_and_download_singbox():
        sys.exit(1)
        
    if not generate_certificate():
        sys.exit(1)

    if not generate_server_config():
        sys.exit(1)
    
    server_ip = get_server_ip()
    generate_client_link(server_ip)
    
    run_and_watchdog()



#
