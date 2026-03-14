// ==UserScript==
// @name         youtube-adb
// @name:zh-CN   YouTube去广告
// @name:zh-TW   YouTube去廣告
// @name:zh-HK   YouTube去廣告
// @name:zh-MO   YouTube去廣告
// @namespace    https://github.com/iamfugui/youtube-adb
// @version      6.25
// @description         A script to remove YouTube ads, including static ads and video ads, without interfering with the network and ensuring safety.
// @description:zh-CN   脚本用于移除YouTube广告。终极修复版：彻底解决弹出反拦截提示后，网页变灰、无法滚动、菜单失效等问题。
// @description:zh-TW   腳本用於移除 YouTube 廣告，包括靜態廣告和視頻廣告。不會干擾網路，安全。
// @description:zh-HK   腳本用於移除 YouTube 廣告，包括靜態廣告和視頻廣告。不會干擾網路，安全。
// @description:zh-MO   腳本用於移除 YouTube 廣告，包括靜態廣告和視頻廣告。不會干擾網路，安全。
// @match        *://*.youtube.com/*
// @exclude      *://accounts.youtube.com/*
// @exclude      *:
// @exclude      *:
// @icon         https://www.google.com/s2/favicons?sz=64&domain=YouTube.com
// @grant        none
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/459541/YouTube%E5%8E%BB%E5%B9%BF%E5%91%8A.user.js
// @updateURL    https://update.greasyfork.org/scripts/459541/YouTube%E5%8E%BB%E5%B9%BF%E5%91%8A.meta.js
// ==/UserScript==

(function() {
    'use strict';

    let video;
    window.dev = false;

    // 静态广告选择器
    const cssSelectorArr = [
        `#masthead-ad`, //首页顶部横幅广告
        `ytd-rich-item-renderer.style-scope.ytd-rich-grid-row #content:has(.ytd-display-ad-renderer)`, //首页视频排版广告
        `.video-ads.ytp-ad-module`, //播放器底部广告
        `tp-yt-paper-dialog:has(yt-mealbar-promo-renderer)`, //播放页会员促销广告
        `ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]`, //播放页右上方推荐广告
        `#related #player-ads`, //播放页评论区右侧推广广告
        `#related ytd-ad-slot-renderer`, //播放页评论区右侧视频排版广告
        `ytd-ad-slot-renderer`, //搜索页广告
        `yt-mealbar-promo-renderer`, //播放页会员推荐广告
        `ad-slot-renderer`, //M播放页第三方推荐广告
        `ytm-companion-ad-renderer`, //M可跳过的视频广告链接处
    ];

    function log(msg) {
        if (!window.dev) return false;
        console.log(`[YouTube-ADB] ${msg}`);
    }

    /**
     * 注入基础 CSS 屏蔽规则
     */
    function injectBaseCSS() {
        if (document.getElementById('youtube-adb-css')) return;

        let style = document.createElement('style');
        style.id = 'youtube-adb-css';
        let cssText = cssSelectorArr.map(selector => `${selector}{display:none!important;}`).join(' ');

        // 双保险：CSS 级别强制解除锁定和隐藏遮罩
        cssText += `
            /* 强制网页允许滚动 */
            html, body, ytd-app {
                overflow-y: auto !important;
                pointer-events: auto !important;
            }
            /* 强制隐藏反广告弹窗及背景遮罩，并使其无法阻挡鼠标事件 */
            ytd-enforcement-message-view-model,
            tp-yt-paper-dialog:has(ytd-enforcement-message-view-model),
            tp-yt-iron-overlay-backdrop.opened {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
                opacity: 0 !important;
            }
        `;
        style.appendChild(document.createTextNode(cssText));
        (document.head || document.body).appendChild(style);
        log('CSS 屏蔽规则及防卡死样式加载成功');
    }

    /**
     * 【核心修复机制】：突破沙盒，调用 YouTube 内部框架正常关闭弹窗
     * 这样能彻底销毁 YouTube 绑定的滚轮锁定事件 (wheel event listeners)
     */
    function clearPolymerScrollLocks() {
        // 如果有原生的关闭按钮，优先点击它（最安全）
        const dismissBtn = document.querySelector('ytd-enforcement-message-view-model #dismiss-button') ||
                           document.querySelector('ytd-enforcement-message-view-model button[aria-label="Close"]');
        if (dismissBtn) {
            dismissBtn.click();
            log('已点击自带的关闭按钮');
        }

        // 注入代码到真实网页环境，调用内部 API 关闭弹窗
        const script = document.createElement('script');
        script.id = 'yt-adb-clear-locks';
        script.textContent = `
            (function() {
                try {
                    // 1. 让 Polymer 框架自动关闭广告警告弹窗
                    const dialogs = document.querySelectorAll('tp-yt-paper-dialog');
                    dialogs.forEach(dialog => {
                        if (dialog.querySelector('ytd-enforcement-message-view-model')) {
                            if (typeof dialog.close === 'function') dialog.close();
                            if (typeof dialog.cancel === 'function') dialog.cancel();
                            dialog.opened = false;
                        }
                    });

                    // 2. 强制剥夺遮罩层的状态
                    const backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop');
                    backdrops.forEach(backdrop => {
                        backdrop.opened = false;
                        backdrop.classList.remove('opened');
                    });

                    // 3. 彻底清除 HTML/BODY 上的滚动锁定 class
                    document.body.classList.remove('iron-disable-scroll');
                    document.body.style.overflow = '';
                    document.documentElement.style.overflow = '';
                } catch(err) {
                    console.error('YouTube-ADB 框架解锁失败', err);
                }
            })();
        `;
        document.documentElement.appendChild(script);
        setTimeout(() => script.remove(), 50); // 阅后即焚
    }

    /**
     * 处理贴片视频广告跳过
     */
    function skipVideoAds() {
        video = document.querySelector('.ad-showing video') || document.querySelector('video.html5-main-video');
        if (!video) return;

        const skipButton = document.querySelector('.ytp-ad-skip-button') ||
                           document.querySelector('.ytp-skip-ad-button') ||
                           document.querySelector('.ytp-ad-skip-button-modern');
        const unskippableAd = document.querySelector('.video-ads.ytp-ad-module .ytp-ad-player-overlay') ||
                              document.querySelector('.ytp-ad-button-icon');

        if (skipButton || unskippableAd) {
            video.muted = true; // 马上静音
            if (video.currentTime > 0.5) {
                video.currentTime = video.duration; // 强制结束广告进度条
            }
            if (skipButton) {
                skipButton.click(); // 点击跳过
            }
        }
    }

    /**
     * 恢复视频播放
     */
    function resumeVideo() {
        if (video && video.paused && video.currentTime < 1) {
            video.play().catch(() => log('视频自动播放可能被拦截'));
            log('自动恢复播放');
        }
    }

    /**
     * 主轮询监听器
     */
    function startObserver() {
        if (window.adbObserver) return;

        const targetNode = document.body;
        const config = { childList: true, subtree: true };

        window.adbObserver = new MutationObserver(() => {
            // 1. 跳过视频内广告
            skipVideoAds();

            // 2. 侦测到反广告弹窗时，触发高级框架解锁
            const adBlockModal = document.querySelector('ytd-enforcement-message-view-model');
            if (adBlockModal) {
                clearPolymerScrollLocks();
                resumeVideo();
            }
        });

        window.adbObserver.observe(targetNode, config);
        log('拦截监听器已启动');
    }

    function main() {
        injectBaseCSS();
        startObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

})();
