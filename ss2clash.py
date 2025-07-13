#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import sys
from urllib.parse import urlparse, unquote
import yaml  # 需要安装 PyYAML: pip install PyYAML
import io

def parse_socks_link(line_number, link_string):
    """
    解析单条SOCKS链接字符串并转换为Clash代理字典。
    """
    try:
        parsed_url = urlparse(link_string)

        if parsed_url.scheme not in ['socks', 'socks5']:
            print(f"警告: 第 {line_number} 行: 无效的协议 '{parsed_url.scheme}' 于链接: {link_string}。已跳过。", file=sys.stderr)
            return None

        if not parsed_url.hostname or not parsed_url.port:
            print(f"警告: 第 {line_number} 行: 链接中缺少主机名或端口: {link_string}。已跳过。", file=sys.stderr)
            return None

        # 从 fragment 获取代理名称，如果为空则自动生成
        proxy_name = unquote(parsed_url.fragment) if parsed_url.fragment else f"SOCKS_{parsed_url.hostname}_{parsed_url.port}"

        clash_proxy = {
            'name': proxy_name,
            'type': 'socks5',  # Clash 中 SOCKS 代理统一为 socks5 类型
            'server': parsed_url.hostname,
            'port': parsed_url.port,
            'udp': True  # SOCKS5 代理通常建议开启 UDP转发
        }

        # 处理认证信息
        username = parsed_url.username
        password = parsed_url.password
        
        # 只有在用户名或密码存在时才添加到配置中
        if username:
            clash_proxy['username'] = username
        if password:
            clash_proxy['password'] = password
        
        return clash_proxy

    except Exception as e:
        print(f"警告: 第 {line_number} 行: 解析链接 '{link_string}' 时发生错误: {e}。已跳过。", file=sys.stderr)
        return None

def main():
    parser = argparse.ArgumentParser(description="将TXT文件中的SOCKS链接转换为Clash YAML配置。")
    parser.add_argument("input_file", help="包含SOCKS链接的TXT文件路径 (每行一个链接)。")
    parser.add_argument("-o", "--output-file", help="保存生成的Clash YAML文件的路径。如果未提供，则打印到标准输出。")

    args = parser.parse_args()

    proxies_list = []
    proxy_names = [] # 用于检查重名

    try:
        with open(args.input_file, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f):
                line = line.strip()
                if not line or line.startswith('#'):  # 跳过空行和注释行
                    continue
                
                proxy_config = parse_socks_link(i + 1, line)
                if proxy_config:
                    # 处理潜在的重名节点
                    original_name = proxy_config['name']
                    name_to_check = original_name
                    count = 1
                    while name_to_check in proxy_names:
                        count += 1
                        name_to_check = f"{original_name}_{count}"
                    
                    if name_to_check != original_name:
                        print(f"警告: 第 {i+1} 行: 代理名称 '{original_name}' 重复。已重命名为 '{name_to_check}'。", file=sys.stderr)
                        proxy_config['name'] = name_to_check
                    
                    proxies_list.append(proxy_config)
                    proxy_names.append(proxy_config['name'])

    except FileNotFoundError:
        print(f"错误: 输入文件 '{args.input_file}' 未找到。", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"错误: 读取或处理文件 '{args.input_file}' 时发生错误: {e}", file=sys.stderr)
        sys.exit(1)

    if not proxies_list:
        print("输入文件中未找到有效的SOCKS链接。未生成Clash配置。", file=sys.stderr)
        sys.exit(0)

    # 基础Clash配置结构
    clash_config = {
        'mixed-port': 7893,
        'allow-lan': True,
        'bind-address': '*',
        'mode': 'rule',
        'log-level': 'info',
        'external-controller': '0.0.0.0:9090',
        
        'dns': {
            'enable': True,
            'listen': '0.0.0.0:5353',
            'default-nameserver': ['223.5.5.5', '119.29.29.29', '114.114.114.114'],
            'nameserver': ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
            'fallback': ['tls://1.1.1.1:853', 'tls://8.8.4.4:853'],
            'fallback-filter': {'geoip': True, 'geoip-code': 'CN'},
            'enhanced-mode': 'fake-ip',
            'fake-ip-range': '198.18.0.1/16',
            'ipv6': False,
        },

        'proxies': proxies_list,

        # ===== 修改部分开始 =====
        'proxy-groups': [
            {
                'name': 'URL-Test',  # 自动测速组，选择延迟最低的节点
                'type': 'url-test',
                'proxies': proxy_names, # 对所有导入的代理进行测速
                'url': 'http://www.gstatic.com/generate_204', # 测速URL
                'interval': 300 # 测速间隔 (秒)
            },
            {
                'name': 'Proxy-Select',  # 手动选择代理组
                'type': 'select',        # 手动选择代理
                'proxies': ['URL-Test'] + proxy_names + ['DIRECT'] # 包含自动测速组、所有代理和直连选项
            }
        ],

        'rules': [ # 规则顺序非常重要
            'DOMAIN-SUFFIX,internal.lan,DIRECT',
            'DOMAIN-SUFFIX,localhost,DIRECT',
            'IP-CIDR,127.0.0.0/8,DIRECT',
            'IP-CIDR,10.0.0.0/8,DIRECT',
            'IP-CIDR,172.16.0.0/12,DIRECT',
            'IP-CIDR,192.168.0.0/16,DIRECT',
            'IP-CIDR,198.18.0.0/16,DIRECT',
            'GEOIP,CN,DIRECT',
            'MATCH,Proxy-Select'  # 默认规则: 其他所有流量走 URL-Test 自动测速组
        ]
        # ===== 修改部分结束 =====
    }

    try:
        yaml_output = yaml.dump(clash_config, 
                                sort_keys=False, 
                                allow_unicode=True, 
                                default_flow_style=False, 
                                indent=2,
                                width=1000)
        
        if args.output_file:
            with open(args.output_file, 'w', encoding='utf-8') as f_out:
                f_out.write(yaml_output)
            print(f"Clash 配置已成功写入到 '{args.output_file}'")
        else:
            if any(line.startswith("警告:") for line in sys.stderr.getvalue().splitlines()):
                 print("\n---\n")
            print(yaml_output)

    except Exception as e:
        print(f"错误: 生成或写入YAML时发生错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    old_stderr = sys.stderr
    sys.stderr = captured_stderr = io.StringIO()
    
    main()
    
    sys.stderr = old_stderr
    captured_output = captured_stderr.getvalue()
    if captured_output:
        print(captured_output, file=sys.stderr, end='')
    captured_stderr.close()
