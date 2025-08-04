#!/bin/bash

#=================================================================================
# sing-box Service Manager Script
#
# 支持的系统: macOS (launchd), Linux (systemd), OpenWrt (procd)
# 功能: 安装, 卸载, 启动, 停止, 重启, 更新配置, 状态检查
#=================================================================================

#--- 用户配置区 ---
# 请根据你的情况修改以下变量

# 1. sing-box 配置文件的下载地址
CONFIG_URL="https://cdn.blingcc.eu.org/s/"

# 2. sing-box 的安装目录
# 脚本会将 sing-box 可执行文件和配置文件都放在这里
INSTALL_DIR="/usr/local/etc/sing-box"

# 3. sing-box 可执行文件的完整路径
# 脚本会假设你已经将 sing-box 可执行文件放到了 $INSTALL_DIR/sing-box
# 如果你的可执行文件名不同，请修改这里
SINGBOX_EXEC_PATH="${INSTALL_DIR}/sing-box"

# 4. 服务的名称 (用于 launchd, systemd, procd)
SERVICE_NAME="singbox.service"

# 5. 配置文件更新周期 (分钟)
# 1440 分钟 = 24 小时
UPDATE_INTERVAL_MIN=1430

#--- 脚本核心逻辑 ---
# (通常无需修改以下内容)

# 全局变量
CONFIG_PATH="${INSTALL_DIR}/config.json"
OS_TYPE=""
SUDO_CMD=""

# 日志函数
log_info() {
    echo -e "\033[32m[INFO]\033[0m $1"
}

log_error() {
    echo -e "\033[31m[ERROR]\033[0m $1"
}

# 检测操作系统
detect_os() {
    if [[ "$(uname)" == "Darwin" ]]; then
        OS_TYPE="macos"
    elif grep -q "OpenWrt" /etc/os-release 2>/dev/null; then
        OS_TYPE="openwrt"
    elif [[ -f /etc/systemd/system/ ]]; then
        OS_TYPE="linux"
    else
        log_error "不支持的操作系统: $(uname)"
        log_error "此脚本仅支持 macOS, Linux (systemd), 和 OpenWrt."
        exit 1
    fi
    log_info "检测到操作系统: $OS_TYPE"
}

# 检测并设置 sudo
setup_sudo() {
    if [[ "$(id -u)" -eq 0 ]]; then
        SUDO_CMD=""
    else
        SUDO_CMD="sudo"
    fi
}

# 检查依赖
check_deps() {
    if ! command -v curl &> /dev/null; then
        log_error "依赖 'curl' 未安装，请先安装它。"
        exit 1
    fi
    if [[ "$OS_TYPE" != "openwrt" ]] && [[ "$(id -u)" -ne 0 ]] && ! command -v sudo &> /dev/null; then
        log_error "依赖 'sudo' 未安装，或者当前用户无法执行 sudo。"
        exit 1
    fi
}

# 更新配置文件并重启服务
update_config_and_restart() {
    log_info "正在从 ${CONFIG_URL} 下载新的配置文件..."
    if ! $SUDO_CMD curl -L -s -A "sing-box" -o "${CONFIG_PATH}.tmp" "$CONFIG_URL"; then
        log_error "下载配置文件失败。"
        $SUDO_CMD rm -f "${CONFIG_PATH}.tmp"
        return 1
    fi

    if ! $SUDO_CMD "${SINGBOX_EXEC_PATH}" check -c "${CONFIG_PATH}.tmp"; then
        log_error "新的配置文件语法检查失败，已放弃更新。"
        $SUDO_CMD rm -f "${CONFIG_PATH}.tmp"
        return 1
    fi

    $SUDO_CMD mv "${CONFIG_PATH}.tmp" "${CONFIG_PATH}"
    log_info "配置文件更新成功。"
    
    log_info "正在重启 sing-box 服务..."
    manage_service "restart"
}

# 创建服务文件并安装
install_service() {
    log_info "开始安装 sing-box 服务..."
    
    if [[ ! -f "$SINGBOX_EXEC_PATH" ]]; then
        log_error "sing-box可执行文件未找到: ${SINGBOX_EXEC_PATH}"
        log_info "请先将 sing-box 可执行文件复制到该路径下再运行安装。"
        exit 1
    fi

    $SUDO_CMD mkdir -p "$INSTALL_DIR"
    $SUDO_CMD chmod +x "$SINGBOX_EXEC_PATH"
    log_info "已设置 ${SINGBOX_EXEC_PATH} 为可执行。"

    log_info "正在下载初始配置文件..."
    if ! $SUDO_CMD curl -L -s -A "sing-box" -o "$CONFIG_PATH" "$CONFIG_URL"; then
        log_error "下载初始配置文件失败，请检查 URL: ${CONFIG_URL}"
        exit 1
    fi
    log_info "初始配置文件下载成功。"

    case "$OS_TYPE" in
        macos)
            PLIST_PATH="/Library/LaunchDaemons/${SERVICE_NAME}.plist"
            log_info "正在创建 macOS launchd 服务文件: ${PLIST_PATH}"
            $SUDO_CMD bash -c "cat > ${PLIST_PATH}" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${SERVICE_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${SINGBOX_EXEC_PATH}</string>
        <string>run</string>
        <string>-c</string>
        <string>${CONFIG_PATH}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>
</dict>
</plist>
EOF
            $SUDO_CMD launchctl load -w "$PLIST_PATH"
            ;;
        linux)
            SYSTEMD_PATH="/etc/systemd/system/${SERVICE_NAME}"
            log_info "正在创建 Linux systemd 服务文件: ${SYSTEMD_PATH}"
            $SUDO_CMD bash -c "cat > ${SYSTEMD_PATH}" << EOF
[Unit]
Description=sing-box service
After=network.target

[Service]
Type=simple
ExecStart=${SINGBOX_EXEC_PATH} run -c ${CONFIG_PATH}
WorkingDirectory=${INSTALL_DIR}
User=root
Group=root
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
            $SUDO_CMD systemctl daemon-reload
            $SUDO_CMD systemctl enable "$SERVICE_NAME"
            $SUDO_CMD systemctl start "$SERVICE_NAME"
            ;;
        openwrt)
            PROCD_PATH="/etc/init.d/singbox"
            log_info "正在创建 OpenWrt procd 服务文件: ${PROCD_PATH}"
            $SUDO_CMD bash -c "cat > ${PROCD_PATH}" << EOF
#!/bin/sh /etc/rc.common

START=99
USE_PROCD=1

start_service() {
    procd_open_instance
    procd_set_param command ${SINGBOX_EXEC_PATH} run -c ${CONFIG_PATH}
    procd_set_param respawn
    procd_close_instance
}
EOF
            $SUDO_CMD chmod +x "$PROCD_PATH"
            $SUDO_CMD "$PROCD_PATH" enable
            $SUDO_CMD "$PROCD_PATH" start
            ;;
    esac

    log_info "服务安装并启动成功。"
    
    log_info "正在设置 cron 定时更新任务..."
    CRON_JOB="0 */$(($UPDATE_INTERVAL_MIN / 60)) * * * $(readlink -f "$0") update-config"
    (crontab -l 2>/dev/null | grep -v "singbox-manager.sh update-config"; echo "$CRON_JOB") | crontab -
    log_info "Cron 任务设置完成。"
    
    log_info "安装完成！"
}

# 卸载服务
uninstall_service() {
    log_info "开始卸载 sing-box 服务..."
    manage_service "stop"

    case "$OS_TYPE" in
        macos)
            PLIST_PATH="/Library/LaunchDaemons/${SERVICE_NAME}.plist"
            if [[ -f "$PLIST_PATH" ]]; then
                $SUDO_CMD launchctl unload -w "$PLIST_PATH"
                $SUDO_CMD rm "$PLIST_PATH"
                log_info "已删除 launchd 服务文件。"
            fi
            ;;
        linux)
            SYSTEMD_PATH="/etc/systemd/system/${SERVICE_NAME}"
            if [[ -f "$SYSTEMD_PATH" ]]; then
                $SUDO_CMD systemctl disable "$SERVICE_NAME"
                $SUDO_CMD rm "$SYSTEMD_PATH"
                $SUDO_CMD systemctl daemon-reload
                log_info "已删除 systemd 服务文件。"
            fi
            ;;
        openwrt)
            PROCD_PATH="/etc/init.d/singbox"
            if [[ -f "$PROCD_PATH" ]]; then
                $SUDO_CMD "$PROCD_PATH" disable
                $SUDO_CMD rm "$PROCD_PATH"
                log_info "已删除 procd 服务文件。"
            fi
            ;;
    esac

    log_info "正在移除 cron 定时任务..."
    (crontab -l 2>/dev/null | grep -v "singbox-manager.sh update-config") | crontab -


    log_info "卸载完成！"
}

# 管理服务 (start, stop, restart, status)
manage_service() {
    ACTION=$1
    case "$OS_TYPE" in
        macos)
            PLIST_PATH="/Library/LaunchDaemons/${SERVICE_NAME}.plist"
            if [[ "$ACTION" == "stop" ]]; then
                $SUDO_CMD launchctl unload -w "$PLIST_PATH"
            elif [[ "$ACTION" == "start" ]]; then
                $SUDO_CMD launchctl load -w "$PLIST_PATH"
            elif [[ "$ACTION" == "restart" ]]; then
                $SUDO_CMD launchctl unload -w "$PLIST_PATH"
                sleep 1
                $SUDO_CMD kill -9 $(lsof -t -i :9095)
                $SUDO_CMD launchctl load -w "$PLIST_PATH"
            elif [[ "$ACTION" == "status" ]]; then
                $SUDO_CMD launchctl list | grep "${SERVICE_NAME}" || echo "服务未运行或未加载"
            fi
            ;;
        linux)
            $SUDO_CMD systemctl "$ACTION" "$SERVICE_NAME"
            ;;
        openwrt)
            PROCD_PATH="/etc/init.d/singbox"
            $SUDO_CMD "$PROCD_PATH" "$ACTION"
            ;;
    esac
}

# 使用说明
usage() {
    echo "sing-box 服务管理脚本"
    echo
    echo "用法: $0 [命令]"
    echo
    echo "命令:"
    echo "  install          安装并启动 sing-box 服务"
    echo "  uninstall        停止并卸载 sing-box 服务"
    echo "  start            启动服务"
    echo "  stop             停止服务"
    echo "  restart          重启服务"
    echo "  status           查看服务状态"
    echo "  update-config    手动更新配置文件并重启服务 (此项主要由 cron 调用)"
    echo
}

# 主函数
main() {
    detect_os
    setup_sudo
    check_deps

    case "$1" in
        install)
            install_service
            ;;
        uninstall)
            uninstall_service
            ;;
        start|stop|restart|status)
            manage_service "$1"
            ;;
        update-config)
            update_config_and_restart
            ;;
        *)
            usage
            ;;
    esac
}

main "$@"
