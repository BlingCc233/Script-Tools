#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import sys
import json
from urllib.parse import urlparse, unquote
import io

# 用户提供的 sing-box JSON 配置模板 (已更新并允许局域网连接)
SINGBOX_TEMPLATE = """
{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "experimental": {
    "clash_api": {
      "external_controller": "127.0.0.1:9090",
      "external_ui": "ui",
      "secret": "",
      "external_ui_download_url": "https://gh-proxy.com/https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip",
      "external_ui_download_detour": "direct",
      "default_mode": "rule"
    },
    "cache_file": {
      "enabled": true,
      "store_fakeip": false
    }
  },
  "dns": {
    "servers": [
      {
        "tag": "proxyDns",
        "address": "tls://8.8.8.8",
        "detour": "Proxy"
      },
      {
        "tag": "localDns",
        "address": "https://223.5.5.5/dns-query",
        "detour": "direct"
      }
    ],
    "rules": [
      {
        "outbound": "any",
        "server": "localDns"
      },
      {
        "rule_set": "geosite-cn",
        "server": "localDns"
      },
      {
        "clash_mode": "direct",
        "server": "localDns"
      },
      {
        "clash_mode": "global",
        "server": "proxyDns"
      },
      {
        "rule_set": "geosite-geolocation-!cn",
        "server": "proxyDns"
      }
    ],
    "final": "localDns",
    "strategy": "ipv4_only"
  },
  "inbounds": [
    {
      "tag": "tun-in",
      "type": "tun",
      "address": [
        "172.19.0.0/30"
      ],
      "mtu": 9000,
      "auto_route": true,
      "strict_route": true,
      "stack": "system",
      "platform": {
        "http_proxy": {
          "enabled": true,
          "server": "127.0.0.1",
          "server_port": 2080
        }
      }
    },
        {
      "tag": "mixed-in",
      "type": "mixed",
      "listen": "0.0.0.0",
      "listen_port": 10808
    }
  ],
  "outbounds": [
    {
      "tag": "Proxy",
      "type": "selector",
      "outbounds": [
        "auto",
        "direct"
      ]
    },
    {
      "tag": "OpenAI",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "Google",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "Telegram",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "Twitter",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "Facebook",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "BiliBili",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ]
    },
    {
      "tag": "Bahamut",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "Spotify",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ]
    },
    {
      "tag": "TikTok",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "Netflix",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "Disney+",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "Apple",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ]
    },
    {
      "tag": "Microsoft",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ]
    },
    {
      "tag": "Games",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ]
    },
    {
      "tag": "Streaming",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ]
    },
    {
      "tag": "Global",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "China",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ]
    },
    {
      "tag": "Others",
      "type": "selector",
      "outbounds": [
        "direct",
        "Proxy"
      ],
      "default": "Proxy"
    },
    {
      "tag": "auto",
      "type": "urltest",
      "outbounds": [],
      "url": "http://www.gstatic.com/generate_204",
      "interval": "10m",
      "tolerance": 150
    },
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "route": {
    "auto_detect_interface": true,
    "final": "Proxy",
    "rules": [
      {
        "inbound": [
          "tun-in",
          "mixed-in"
        ],
        "action": "sniff"
      },
      {
        "type": "logical",
        "mode": "or",
        "rules": [
          {
            "port": 53
          },
          {
            "protocol": "dns"
          }
        ],
        "action": "hijack-dns"
      },
      {
        "rule_set": "geosite-category-ads-all",
        "clash_mode": "rule",
        "action": "reject"
      },
      {
        "rule_set": "geosite-category-ads-all",
        "clash_mode": "global",
        "outbound": "Proxy"
      },
      {
        "clash_mode": "direct",
        "outbound": "direct"
      },
      {
        "clash_mode": "global",
        "outbound": "Proxy"
      },
      {
        "domain": [
          "clash.razord.top",
          "yacd.metacubex.one",
          "yacd.haishan.me",
          "d.metacubex.one"
        ],
        "outbound": "direct"
      },
      {
        "ip_is_private": true,
        "outbound": "direct"
      },
      {
        "rule_set": "geosite-openai",
        "outbound": "OpenAI"
      },
      {
        "rule_set": [
          "geosite-youtube",
          "geoip-google",
          "geosite-google",
          "geosite-github"
        ],
        "outbound": "Google"
      },
      {
        "rule_set": [
          "geoip-telegram",
          "geosite-telegram"
        ],
        "outbound": "Telegram"
      },
      {
        "rule_set": [
          "geoip-twitter",
          "geosite-twitter"
        ],
        "outbound": "Twitter"
      },
      {
        "rule_set": [
          "geoip-facebook",
          "geosite-facebook"
        ],
        "outbound": "Facebook"
      },
      {
        "rule_set": "geosite-bilibili",
        "outbound": "BiliBili"
      },
      {
        "rule_set": "geosite-bahamut",
        "outbound": "Bahamut"
      },
      {
        "rule_set": "geosite-spotify",
        "outbound": "Spotify"
      },
      {
        "rule_set": "geosite-tiktok",
        "outbound": "TikTok"
      },
      {
        "rule_set": [
          "geoip-netflix",
          "geosite-netflix"
        ],
        "outbound": "Netflix"
      },
      {
        "rule_set": "geosite-disney",
        "outbound": "Disney+"
      },
      {
        "rule_set": [
          "geoip-apple",
          "geosite-apple",
          "geosite-amazon"
        ],
        "outbound": "Apple"
      },
      {
        "rule_set": "geosite-microsoft",
        "outbound": "Microsoft"
      },
      {
        "rule_set": [
          "geosite-category-games",
          "geosite-dmm"
        ],
        "outbound": "Games"
      },
      {
        "rule_set": [
          "geosite-hbo",
          "geosite-primevideo"
        ],
        "outbound": "Streaming"
      },
      {
        "rule_set": "geosite-geolocation-!cn",
        "outbound": "Global"
      },
      {
        "rule_set": [
          "geoip-cn",
          "geosite-cn"
        ],
        "outbound": "China"
      }
    ],
    "rule_set": [
      {
        "tag": "geosite-category-ads-all",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/category-ads-all.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-openai",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/Toperlock/sing-box-geosite@main/rule/OpenAI.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-youtube",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/youtube.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-google",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/google.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-google",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/google.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-github",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/github.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-telegram",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/telegram.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-telegram",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/telegram.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-twitter",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/twitter.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-twitter",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/twitter.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-facebook",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/facebook.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-facebook",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/facebook.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-bilibili",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/bilibili.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-bahamut",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/bahamut.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-spotify",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/spotify.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-tiktok",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/tiktok.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-netflix",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/netflix.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-netflix",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/netflix.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-disney",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/disney.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-apple",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geoip/apple.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-apple",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/apple.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-amazon",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/amazon.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-microsoft",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/microsoft.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-category-games",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/category-games.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-dmm",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/dmm.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-hbo",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/hbo.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-primevideo",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/primevideo.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-geolocation-!cn",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/geolocation-!cn.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-cn",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/cn.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-cn",
        "type": "remote",
        "format": "binary",
        "url": "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/cn.srs",
        "download_detour": "direct"
      }
    ]
  }
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

    # 找到 'auto' (url-test) 和 'Proxy' (selector) 组
    auto_group = next((item for item in singbox_config['outbounds'] if item.get('tag') == 'auto'), None)
    proxy_group = next((item for item in singbox_config['outbounds'] if item.get('tag') == 'Proxy'), None)

    if auto_group:
        auto_group['outbounds'].extend(outbound_tags)
    else:
        print("警告: 在模板中未找到 tag 为 'auto' 的 url-test 出站组。", file=sys.stderr)

    if proxy_group:
        proxy_group['outbounds'].extend(outbound_tags)
    else:
        print("警告: 在模板中未找到 tag 为 'Proxy' 的 selector 出站组。", file=sys.stderr)

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
