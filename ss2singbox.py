#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import sys
import json
from urllib.parse import urlparse, unquote
import io

# 用户提供的 sing-box JSON 配置模板
SINGBOX_TEMPLATE = """
{
    "log": {
      "disabled": false,
      "level": "info",
      "output": "",
      "timestamp": true
    },
    "experimental": {
      "clash_api": {
        "external_controller": "127.0.0.1:9090",
        "external_ui": "metacubexd",
        "external_ui_download_url": "https://ghfast.top/https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip",
        "external_ui_download_detour": "direct",
        "secret": "",
        "default_mode": "Rule",
        "access_control_allow_origin": [],
        "access_control_allow_private_network": true
      },
      "cache_file": {
        "enabled": true,
        "path": "cache.db",
        "cache_id": "",
        "store_fakeip": false,
        "store_rdrc": true,
        "rdrc_timeout": "7d"
      }
    },
    "dns": {
      "servers": [
        {
          "tag": "default-dns",
          "address": "https://223.5.5.5/dns-query",
          "address_resolver": "default-dns-resolver",
          "detour": "direct"
        },
        {
          "tag": "default-dns-resolver",
          "address": "223.5.5.5",
          "detour": "direct"
        },
        {
          "tag": "google-dns",
          "address": "https://8.8.8.8/dns-query",
          "strategy": "prefer_ipv4",
          "detour": "select"
        }
      ],
      "rules": [
        {
          "outbound": "any",
          "action": "route",
          "server": "default-dns"
        },
        {
          "clash_mode": "Direct",
          "action": "route",
          "server": "default-dns"
        },
        {
          "clash_mode": "Global",
          "action": "route",
          "server": "google-dns"
        },
        {
          "rule_set": "geosite-cn",
          "server": "default-dns"
        },
        {
          "type": "logical",
          "mode": "and",
          "rules": [
            {
              "rule_set": "geolocation-!cn",
              "invert": true
            },
            {
              "rule_set": "geoip-cn"
            }
          ],
          "server": "google-dns",
          "client_subnet": "114.114.114.114/24"
        }
      ],
      "final": "google-dns"
    },
    "inbounds": [
      {
        "type": "tun",
        "tag": "tun-in",
        "address": [
          "172.18.0.1/30",
          "fdfe:dcba:9876::1/126"
        ],
        "mtu": 9000,
        "auto_route": true,
        "strict_route": true,
        "stack": "system",
        "exclude_package": [
          "com.bilibili.app.in"
        ],
        "platform": {
          "http_proxy": {
            "enabled": false,
            "server": "::",
            "server_port": 2030
          }
        }
      }
    ],
    "route": {
      "rules": [
        {
          "action": "sniff"
        },
        {
          "protocol": "dns",
          "action": "hijack-dns"
        },
        {
          "ip_is_private": true,
          "outbound": "direct"
        },
        {
          "action": "route",
          "clash_mode": "Direct",
          "outbound": "direct"
        },
        {
          "action": "route",
          "clash_mode": "Global",
          "outbound": "GLOBAL"
        },
        {
          "protocol": "quic",
          "action": "reject"
        },
        {
          "rule_set": [
            "category-ads-all"
          ],
          "action": "reject"
        },
        {
          "rule_set": [
            "geosite-private"
          ],
          "action": "route",
          "outbound": "direct"
        },
        {
          "domain": [
            "aur.archlinux.org"
          ],
          "action": "route",
          "outbound": "direct"
        },
        {
          "domain": [
            "sing-box.sagernet.org"
          ],
          "action": "route",
          "outbound": "special"
        },
        {
          "rule_set": [
            "github"
          ],
          "action": "route",
          "outbound": "github"
        },
        {
          "rule_set": [
            "geosite-cn"
          ],
          "action": "route",
          "outbound": "direct"
        },
        {
          "rule_set": [
            "geoip-cn"
          ],
          "action": "route",
          "outbound": "direct"
        },
        {
          "rule_set": [
            "geolocation-!cn"
          ],
          "action": "route",
          "outbound": "select"
        }
      ],
      "rule_set": [
        {
          "tag": "category-ads-all",
          "type": "remote",
          "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/category-ads-all.srs",
          "format": "binary",
          "download_detour": "direct"
        },
        {
          "tag": "geoip-private",
          "type": "remote",
          "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/private.srs",
          "format": "binary",
          "download_detour": "direct"
        },
        {
          "tag": "geosite-private",
          "type": "remote",
          "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/private.srs",
          "format": "binary",
          "download_detour": "direct"
        },
        {
          "tag": "geoip-cn",
          "type": "remote",
          "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/cn.srs",
          "format": "binary",
          "download_detour": "direct"
        },
        {
          "tag": "geosite-cn",
          "type": "remote",
          "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/cn.srs",
          "format": "binary",
          "download_detour": "direct"
        },
        {
          "tag": "geolocation-!cn",
          "type": "remote",
          "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/geolocation-!cn.srs",
          "format": "binary",
          "download_detour": "direct"
        },
        {
          "tag": "github",
          "type": "remote",
          "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/github.srs",
          "format": "binary",
          "download_detour": "direct"
        },
        {
          "tag": "geosite-gfw",
          "type": "remote",
          "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/gfw.srs",
          "format": "binary",
          "download_detour": "direct"
        }
      ],
      "final": "fallback",
      "auto_detect_interface": true,
      "override_android_vpn": true
    },
    "outbounds": [
      {
        "type": "selector",
        "tag": "select",
        "interrupt_exist_connections": true,
        "outbounds": [
          "auto"
        ]
      },
      {
        "type": "urltest",
        "tag": "auto",
        "url": "https://www.gstatic.com/generate_204",
        "interval": "3m",
        "tolerance": 150,
        "interrupt_exist_connections": true,
        "outbounds": []
      },
      {
        "type": "direct",
        "tag": "direct"
      },
      {
        "type": "selector",
        "tag": "fallback",
        "interrupt_exist_connections": true,
        "outbounds": [
          "select",
          "direct"
        ]
      },
      {
        "type": "selector",
        "tag": "GLOBAL",
        "interrupt_exist_connections": true,
        "outbounds": [
          "select",
          "auto",
          "direct",
          "fallback"
        ]
      },
      {
        "type": "selector",
        "tag": "github",
        "interrupt_exist_connections": true,
        "outbounds": [
          "select",
          "auto",
          "direct",
          "fallback"
        ]
      },
      {
        "type": "selector",
        "tag": "special",
        "interrupt_exist_connections": true,
        "outbounds": [
          "auto"
        ]
      }
    ]
}
"""

def parse_socks_to_singbox_outbound(line_number, link_string):
    """
    解析单条SOCKS链接字符串并转换为sing-box出站（outbound）字典。
    """
    try:
        parsed_url = urlparse(link_string)

        if parsed_url.scheme not in ['socks', 'socks5']:
            print(f"警告: 第 {line_number} 行: 无效的协议 '{parsed_url.scheme}' 于链接: {link_string}。已跳过。", file=sys.stderr)
            return None

        if not parsed_url.hostname or not parsed_url.port:
            print(f"警告: 第 {line_number} 行: 链接中缺少主机名或端口: {link_string}。已跳过。", file=sys.stderr)
            return None

        # 从 fragment 获取代理名称(tag)，如果为空则自动生成
        proxy_tag = unquote(parsed_url.fragment) if parsed_url.fragment else f"SOCKS_{parsed_url.hostname}_{parsed_url.port}"

        singbox_outbound = {
            'type': 'socks',
            'tag': proxy_tag,
            'server': parsed_url.hostname,
            'server_port': parsed_url.port,
            'version': '5'
            # 'udp' is enabled by default in sing-box for SOCKS
        }

        # 处理认证信息
        username = parsed_url.username
        password = parsed_url.password
        
        if username:
            singbox_outbound['username'] = username
        if password:
            singbox_outbound['password'] = password
        
        return singbox_outbound

    except Exception as e:
        print(f"警告: 第 {line_number} 行: 解析链接 '{link_string}' 时发生错误: {e}。已跳过。", file=sys.stderr)
        return None

def main():
    parser = argparse.ArgumentParser(description="将TXT文件中的SOCKS链接转换为sing-box JSON配置。")
    parser.add_argument("input_file", help="包含SOCKS链接的TXT文件路径 (每行一个链接)。")
    parser.add_argument("-o", "--output-file", help="保存生成的sing-box JSON文件的路径。如果未提供，则打印到标准输出。")

    args = parser.parse_args()

    outbounds_list = []
    outbound_tags = [] # 用于检查重名和添加到策略组

    try:
        with open(args.input_file, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f):
                line = line.strip()
                if not line or line.startswith('#'):  # 跳过空行和注释行
                    continue
                
                proxy_config = parse_socks_to_singbox_outbound(i + 1, line)
                if proxy_config:
                    # 处理潜在的重名节点
                    original_tag = proxy_config['tag']
                    tag_to_check = original_tag
                    count = 1
                    while tag_to_check in outbound_tags:
                        count += 1
                        tag_to_check = f"{original_tag}_{count}"
                    
                    if tag_to_check != original_tag:
                        print(f"警告: 第 {i+1} 行: 代理标签(tag) '{original_tag}' 重复。已重命名为 '{tag_to_check}'。", file=sys.stderr)
                        proxy_config['tag'] = tag_to_check
                    
                    outbounds_list.append(proxy_config)
                    outbound_tags.append(proxy_config['tag'])

    except FileNotFoundError:
        print(f"错误: 输入文件 '{args.input_file}' 未找到。", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"错误: 读取或处理文件 '{args.input_file}' 时发生错误: {e}", file=sys.stderr)
        sys.exit(1)

    if not outbounds_list:
        print("输入文件中未找到有效的SOCKS链接。未生成sing-box配置。", file=sys.stderr)
        sys.exit(0)

    # 加载基础sing-box配置模板
    singbox_config = json.loads(SINGBOX_TEMPLATE)

    # 找到 'auto' (url-test) 和 'select' (selector) 组
    auto_group = next((item for item in singbox_config['outbounds'] if item.get('tag') == 'auto'), None)
    select_group = next((item for item in singbox_config['outbounds'] if item.get('tag') == 'select'), None)

    if auto_group:
        auto_group['outbounds'].extend(outbound_tags)
    else:
        print("警告: 在模板中未找到 tag 为 'auto' 的 url-test 出站组。", file=sys.stderr)

    if select_group:
        select_group['outbounds'].extend(outbound_tags)
    else:
        print("警告: 在模板中未找到 tag 为 'select' 的 selector 出站组。", file=sys.stderr)

    # 将所有解析出的代理添加到主出站列表中
    singbox_config['outbounds'].extend(outbounds_list)

    try:
        # 生成JSON输出
        json_output = json.dumps(singbox_config, indent=2, ensure_ascii=False)
        
        if args.output_file:
            with open(args.output_file, 'w', encoding='utf-8') as f_out:
                f_out.write(json_output)
            print(f"sing-box 配置已成功写入到 '{args.output_file}'")
        else:
            # 如果有警告信息，先打印一个分隔符
            if any(line.startswith("警告:") for line in sys.stderr.getvalue().splitlines()):
                 print("\n---\n", file=sys.stdout)
            print(json_output)

    except Exception as e:
        print(f"错误: 生成或写入JSON时发生错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    # 捕获标准错误输出，以便在打印最终配置之前先显示所有警告
    old_stderr = sys.stderr
    sys.stderr = captured_stderr = io.StringIO()
    
    main()
    
    sys.stderr = old_stderr
    captured_output = captured_stderr.getvalue()
    if captured_output:
        print(captured_output, file=sys.stderr, end='')
    captured_stderr.close()
