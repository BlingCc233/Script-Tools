// ==UserScript==
// @name         Bilibili自动宽屏脚本
// @namespace    bilibili-auto-fullscreen-script
// @version      1.5.1
// @icon         https://www.bilibili.com/favicon.ico
// @description  在Bilibili网站自动宽屏播放视频，按T键切换全屏,包括直播间。
// @author       BlingCc
// @match        https://www.bilibili.com/*
// @match        https://live.bilibili.com/*
// @license      MIT
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 核心修复：仅向直播间注入带有严格生效条件的 CSS
    function injectHideCSS() {
        const oldStyle = document.getElementById('bili-clean-fullscreen-style');
        if (oldStyle) oldStyle.remove();

        const style = document.createElement('style');
        style.id = 'bili-clean-fullscreen-style';
        style.type = 'text/css';
        style.innerHTML = `
            /* 1. 恢复非全屏显示：只在 网页全屏(.player-full-win) 或 真实全屏(:fullscreen) 状态下隐藏礼物栏 */
            :fullscreen .gift-control-section,
            :fullscreen #gift-control-vm,
            :fullscreen #web-player__bottom-bar__container,
            body.player-full-win .gift-control-section,
            body.player-full-win #gift-control-vm,
            body.player-full-win #web-player__bottom-bar__container {
                display: none !important;
                height: 0 !important;
                opacity: 0 !important;
                pointer-events: none !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            /* 2. 修复全屏黑边且防止视频拉伸越界：去除之前破坏B站比例的100vh，仅修改底层的 Grid 网格划分 */
            #fullscreen-container:fullscreen,
            body:fullscreen #fullscreen-container,
            body.player-full-win #fullscreen-container {
                /* 让上方视频自然占满 1fr(剩余空间)，将原本分配给下方礼物栏的高度强制压缩为 0px */
                grid-template-rows: 1fr 0px !important;
                padding-bottom: 0 !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Utility function to wait for elements
    function waitForElement(selector, callback, maxTries = 10, interval = 1000) {
        let tries = 0;
        function check() {
            const element = document.querySelector(selector);
            if (element) {
                callback(element);
                return;
            }
            tries++;
            if (tries < maxTries) {
                setTimeout(check, interval);
            }
        }
        check();
    }

    // Mouse event simulation
    function simulateMouseEvent(element, eventType, x, y) {
        const event = new MouseEvent(eventType, {
            view: window, bubbles: true, cancelable: true, clientX: x, clientY: y
        });
        element.dispatchEvent(event);
    }

    // Double click simulation
    function triggerDoubleClick(element) {
        const event = new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window });
        element.dispatchEvent(event);
    }

    // Video page fullscreen handler
    function triggerVideoFullscreen() {
        const fullscreenButton = document.querySelector('[aria-label="网页全屏"]');
        if (!fullscreenButton) return;
        try {
            fullscreenButton.click();
        } catch (e) {
            const rect = fullscreenButton.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            simulateMouseEvent(fullscreenButton, 'mouseenter', x, y);
            simulateMouseEvent(fullscreenButton, 'click', x, y);
            simulateMouseEvent(fullscreenButton, 'mouseleave', x, y);
        }
    }

    // Live stream fullscreen handler
    function toggleLiveFullscreen() {
        const player = document.getElementById('live-player');
        if (player) {
            triggerDoubleClick(player);
        }
    }

    // Initialize video page
    function initializeVideo() {
        waitForElement('.bpx-player-video-area', () => {
            waitForElement('[aria-label="网页全屏"]', () => {
                triggerVideoFullscreen();
            });
        });
    }

    // Initialize live stream page
    async function initializeLive() {
        // 先行注入直播间专用 CSS
        injectHideCSS();

        await new Promise((resolve) => {
            const observer = new MutationObserver((mutations, obs) => {
                const scripts = document.getElementsByTagName('script');
                for (let script of scripts) {
                    if (script.src.includes('room-player.prod.min.js')) {
                        setTimeout(() => { obs.disconnect(); resolve(); }, 1000);
                        return;
                    }
                }
            });
            observer.observe(document, { childList: true, subtree: true });
        });

        const player = await new Promise((resolve) => {
            const checkElement = () => {
                const player = document.getElementById('live-player');
                if (player) resolve(player);
                else requestAnimationFrame(checkElement);
            };
            checkElement();
        });

        triggerDoubleClick(player);
        document.body.classList.add('hide-aside-area');
    }

    // Main initialization
    function initialize() {
        const isLivePage = window.location.hostname === 'live.bilibili.com';
        if (isLivePage) {
            initializeLive();
        } else {
            initializeVideo();
        }

        document.addEventListener('keydown', (e) => {
            const activeEl = document.activeElement;
            const isTyping = activeEl && (
                activeEl.tagName.toLowerCase() === 'input' ||
                activeEl.tagName.toLowerCase() === 'textarea' ||
                activeEl.isContentEditable
            );

            if (isTyping) return;

            if (e.key.toLowerCase() === 't') {
                if (isLivePage) toggleLiveFullscreen();
                else triggerVideoFullscreen();
            }
            if (e.key === 'Escape') {
                if (isLivePage) toggleLiveFullscreen();
            }
        });
    }

    if (document.readyState === 'complete') {
        initialize();
    } else {
        window.addEventListener('load', initialize);
    }
})();
