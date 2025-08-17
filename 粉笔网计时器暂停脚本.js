// ==UserScript==
// @name         粉笔网计时器暂停脚本
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  暂停/继续计时器。拦截并修改HTTP(学习时间/题目提交)和WebSocket(直播弹幕)请求数据。
// @author       BlingCc & AI Assistant
// @match        https://*.fenbi.com/*
// @license      MIT
// @grant        none
// @run-at       document-start
// @icon         https://www.fenbi.com/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    console.log('粉笔网计时器增强脚本 v2.3 已加载。');

    /**
     * 生成指定长度的随机十六进制字符串
     * @param {number} length - 字符串长度
     * @returns {string} - 大写的十六进制字符串
     */
    function generateRandomHex(length) {
        let result = '';
        const characters = '0123456789ABCDEF';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    // ------------------ 新功能：劫持 WebSocket ------------------
    const OriginalWebSocket = window.WebSocket;

    window.WebSocket = class PatchedWebSocket extends OriginalWebSocket {
        constructor(url, protocols) {
            let newUrl = url;
            // 规则1: 修改连接URL中的userId
            if (url.includes('live-proxy.fenbi.com/rsp-g2')) {
                try {
                    const urlObject = new URL(url);
                    const originalUserId = urlObject.searchParams.get('userId');
                    if (originalUserId) {
                        const maxId = parseInt(originalUserId, 10);
                        if (!isNaN(maxId)) {
                            // 生成一个1到原始ID之间的随机数
                            const newUserId = Math.floor(Math.random() * maxId) + 1;
                            urlObject.searchParams.set('userId', newUserId);
                            newUrl = urlObject.href;
                            console.log(`粉笔脚本(WS): WebSocket URL已修改. 原始userId: ${originalUserId}, 新userId: ${newUserId}`);
                        }
                    }
                } catch (e) {
                    console.error('粉笔脚本(WS): 修改WebSocket URL失败', e);
                }
            }

            // 使用（可能已修改的）URL调用原始的构造函数
            super(newUrl, protocols);

            // 规则2: 劫持此实例的send方法
            this.originalSend = this.send;
            this.send = async (data) => {
                let modifiedData = data;
                try {
                    // 检查数据是否为二进制(Blob或ArrayBuffer)
                    if (data instanceof Blob || data instanceof ArrayBuffer) {
                        let text;
                        if (data instanceof Blob) {
                            text = await data.text();
                        } else { // ArrayBuffer
                            text = new TextDecoder('utf-8').decode(data);
                        }

                        if (text.includes('Bling的Cc')) {
                            const randomHexName = `用户${generateRandomHex(4)}`;
                            const newText = text.replace(/Bling的Cc/g, randomHexName);
                            console.log(`粉笔脚本(WS): WebSocket二进制消息已修改. 原内容包含 "Bling的Cc", 已替换为 "${randomHexName}"`);

                            // 重新编码回原始类型
                            if (data instanceof Blob) {
                                modifiedData = new Blob([newText]);
                            } else { // ArrayBuffer
                                modifiedData = new TextEncoder().encode(newText);
                            }
                        }
                    } else if (typeof data === 'string' && data.includes('Bling的Cc')) {
                         const randomHexName = `用户${generateRandomHex(4)}`;
                         modifiedData = data.replace(/Bling的Cc/g, randomHexName);
                         console.log(`粉笔脚本(WS): WebSocket文本消息已修改. 原内容包含 "Bling的Cc", 已替换为 "${randomHexName}"`);
                    }
                } catch(e) {
                    console.error('粉笔脚本(WS): 修改WebSocket消息失败', e);
                }
                // 使用原始的send方法发送（可能已修改的）数据
                return this.originalSend.call(this, modifiedData);
            };
        }
    };


    // ------------------ 核心功能：劫持并修改HTTP请求 ------------------
    const originalFetch = window.fetch;
    const originalXhrSend = XMLHttpRequest.prototype.send;
    const originalXhrOpen = XMLHttpRequest.prototype.open;

    function modifyRequestBody(bodyString, url) {
        try {
            const data = JSON.parse(bodyString);
            let modified = false;

            if (url.includes('/activity/report/studyTime')) {
                console.log('粉笔脚本(HTTP): 拦截到【学习时间上报】请求', JSON.parse(JSON.stringify(data)));
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        if (item && typeof item.startTime === 'number') {
                            const originalStartTime = item.startTime;
                            item.startTime = (originalStartTime - (originalStartTime % 1000000)) + Math.round((originalStartTime % 1000000) * 0.8);
                            modified = true;
                            console.log(`粉笔脚本(HTTP): startTime已修改. 原始值: ${originalStartTime}, 新值: ${item.startTime}`);
                        }
                    });
                }
            } else if (url.includes('/api/xingce/async/exercises')) {
                console.log('粉笔脚本(HTTP): 拦截到【题目提交】请求', JSON.parse(JSON.stringify(data)));
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        if (item && typeof item.time !== 'undefined') {
                            const originalTime = item.time;
                            item.time = 1;
                            modified = true;
                            console.log(`粉笔脚本(HTTP): time已修改. 原始值: ${originalTime}, 新值: ${item.time}`);
                        }
                    });
                }
            }
            return modified ? JSON.stringify(data) : bodyString;
        } catch (e) {
            console.error('粉笔脚本(HTTP): 解析或修改请求体失败', e);
            return null;
        }
    }

    window.fetch = function(input, init) {
        const url = (typeof input === 'string') ? input : input.url;
        const method = (init && init.method) ? init.method.toUpperCase() : (input && input.method) ? input.method.toUpperCase() : 'GET';
        if (method === 'POST' && (url.includes('/activity/report/studyTime') || url.includes('/api/xingce/async/exercises'))) {
            return new Promise(resolve => {
                if (!init.body) { resolve(originalFetch(input, init)); return; }
                (new Response(init.body)).text().then(bodyText => {
                    const newBody = modifyRequestBody(bodyText, url);
                    const finalBody = newBody !== null ? newBody : bodyText;
                    const newInit = { ...init, body: finalBody };
                    resolve(originalFetch(input, newInit));
                });
            });
        }
        return originalFetch(input, init);
    };

    XMLHttpRequest.prototype.open = function(method, url) {
        this._hooked_method = method; this._hooked_url = url;
        return originalXhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
        const url = this._hooked_url; const method = this._hooked_method;
        if (method && method.toUpperCase() === 'POST' && url && (url.includes('/activity/report/studyTime') || url.includes('/api/xingce/async/exercises'))) {
            const newBody = modifyRequestBody(body, url);
            const finalBody = newBody !== null ? newBody : body;
            return originalXhrSend.call(this, finalBody);
        }
        return originalXhrSend.apply(this, arguments);
    };


    // ------------------ 核心逻辑：劫持时间和计时器函数 (原脚本功能) ------------------
    // (这部分代码保持不变)
    let isPaused = false; let timeOffset = 0; let pauseStartTime = 0;
    const originalDateNow = Date.now; const OriginalDate = Date; const originalSetInterval = window.setInterval; const originalRequestAnimationFrame = window.requestAnimationFrame;
    Date.now = function() { if (isPaused) { return pauseStartTime; } return originalDateNow() - timeOffset; };
    window.Date = class extends OriginalDate { constructor(...args) { if (args.length === 0) { super(Date.now()); } else { super(...args); } } };
    Object.assign(window.Date, OriginalDate); window.Date.now = Date.now;
    window.setInterval = function(callback, delay, ...args) { const newCallback = () => { if (!isPaused) { callback(...args); } }; return originalSetInterval(newCallback, delay); };
    window.requestAnimationFrame = function(callback) { const newCallback = (timestamp) => { if (!isPaused) { callback(timestamp); } else { originalRequestAnimationFrame(newCallback); } }; return originalRequestAnimationFrame(newCallback); };

    // ------------------ UI部分：创建控制按钮 ------------------
    // (这部分代码保持不变)
    function createToggleButton() {
        const button = document.createElement('button'); button.id = 'timer-pause-toggle-button'; button.textContent = '⏸️ 暂停计时';
        Object.assign(button.style, { position: 'fixed', bottom: '20px', right: '20px', zIndex: '99999', padding: '10px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '14px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' });
        button.addEventListener('click', () => {
            isPaused = !isPaused;
            if (isPaused) { pauseStartTime = originalDateNow(); button.textContent = '▶️ 继续计时'; button.style.backgroundColor = '#28a745'; console.log(`计时器已暂停于: ${new OriginalDate(pauseStartTime).toLocaleString()}`); }
            else { const pauseDuration = originalDateNow() - pauseStartTime; timeOffset += pauseDuration; button.textContent = '⏸️ 暂停计时'; button.style.backgroundColor = '#007bff'; console.log(`计时器已恢复，本次暂停 ${pauseDuration / 1000} 秒。总暂停时长: ${timeOffset / 1000} 秒。`); }
        });
        document.body.appendChild(button);
    }
    if (document.readyState === 'loading') { window.addEventListener('DOMContentLoaded', createToggleButton); } else { createToggleButton(); }

})();
