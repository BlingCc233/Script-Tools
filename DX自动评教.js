// ==UserScript==
// @name         党校系统自动评教助手
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  兼容讲授式、互动式等多种评教页面，利用Vue实例穿透+精确物理事件模拟，一键全自动评教。
// @author       BlingCc
// @match        *://zhxy.qhswdx.org.cn/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=qhswdx.org.cn
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 综合评语库（包含了讲授式和互动式的通用好评）
    const feedbackList = [
        "课程政治站位高，理论阐释深入浅出，让我对党的最新理论成果有了更深刻的认识，受益匪浅。",
        "老师授课生动形象，能够将深奥的政治理论与当前社会热点、工作实际紧密结合，针对性极强。",
        "课堂互动频繁，讨论热烈，极大地调动了学员的学习积极性和主动性，教学效果极佳。",
        "互动式教学模式新颖，学员参与度高，在交流与思维碰撞中深化了对理论的认识，收获满满。",
        "讲授逻辑严密、条理清晰，具有很强的思想性和指导性，极大地拓宽了我的工作视野。",
        "课程内容丰富充实，紧扣时代脉搏，学理框架搭建科学，对实际工作有极大的启发作用。",
        "教学态度严谨认真，教态得体大方，引导互动非常自然，充分展现了党校教师的优秀风采。",
        "能准确把握中央和省委的决策部署，分析问题透彻，帮助我们理清了思想认识上的迷雾。",
        "问题导向明确，真正做到了理论联系实际。课堂氛围活跃，能引发深刻思考，是一堂不可多得的好课。",
        "政治立场坚定，旗帜鲜明讲政治，既有理论高度，又有实践深度，非常满意。"
    ];

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function autoEvaluate() {
        // 1. 处理所有滑块打分 (85 ~ 97)
        const sliderRunways = document.querySelectorAll('.el-slider__runway');
        if (sliderRunways.length === 0) {
            alert('未检测到滑块，请等待页面加载完毕或确认页面是否正确！');
            return;
        }

        sliderRunways.forEach(runway => {
            const score = getRandomInt(85, 97);
            const sliderComponent = runway.parentElement;

            // 方案A：Vue 实例穿透
            if (sliderComponent && sliderComponent.__vue__) {
                try {
                    sliderComponent.__vue__.value = score;
                    if (typeof sliderComponent.__vue__.setPosition === 'function') {
                        sliderComponent.__vue__.setPosition(score);
                    }
                    sliderComponent.__vue__.$emit('input', score);
                    sliderComponent.__vue__.$emit('change', score);
                } catch (e) {
                    console.log("Vue 实例穿透失败", e);
                }
            }

            // 方案B：物理级鼠标事件模拟
            const rect = runway.getBoundingClientRect();
            const targetX = rect.left + (rect.width * (score / 100));
            const targetY = rect.top + (rect.height / 2);

            const eventConfig = {
                bubbles: true, cancelable: true, view: window,
                clientX: targetX, clientY: targetY, button: 0 // button:0 代表左键
            };

            runway.dispatchEvent(new MouseEvent('mousedown', eventConfig));
            window.dispatchEvent(new MouseEvent('mousemove', eventConfig));
            window.dispatchEvent(new MouseEvent('mouseup', eventConfig));
        });

        // 2. 填写意见建议
        const textarea = document.querySelector('textarea.el-textarea__inner');
        if (textarea) {
            const comment = feedbackList[Math.floor(Math.random() * feedbackList.length)];

            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(textarea, comment);
            } else {
                textarea.value = comment;
            }

            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // 3. 自动点击提交
        setTimeout(() => {
            const buttons = Array.from(document.querySelectorAll('.bar-wrap .ds-button'));
            const submitBtn = buttons.find(btn => btn.textContent.includes('提交') && !btn.id.includes('auto-eval-btn'));

            if (submitBtn) {
                submitBtn.click();
            } else {
                alert('滑块已拖动，评语已填写，但未找到原生提交按钮，请手动提交。');
                document.getElementById('auto-eval-btn').querySelector('span').innerText = '请手动提交';
            }
        }, 1000);
    }

    // 监听页面变化，注入自定义按钮
    function injectButton() {
        // 【核心修改点】：放宽 URL 匹配条件，只要网址中包含 /teas/appraise/ 且包含 _evel，就认为是评教页面
        if (!location.hash.includes('/teas/appraise/') || !location.hash.includes('_evel')) {
            return;
        }

        const barWrap = document.querySelector('.bar-wrap');
        // 确保找到了底部栏，并且我们的按钮还没被添加过
        if (barWrap && !document.getElementById('auto-eval-btn')) {
            const btnHtml = `<a id="auto-eval-btn" title="一键完美打分与评语并提交" class="ds-button normal" style="background-color: #4CAF50; border-color: #4CAF50; color: #fff; margin-right: 12px; cursor: pointer;">
                                <i class="iconfont icon-tijiao"></i><span> 打分并提交 </span>
                             </a>`;

            barWrap.insertAdjacentHTML('afterbegin', btnHtml);

            document.getElementById('auto-eval-btn').addEventListener('click', function() {
                this.style.opacity = '0.5';
                this.style.pointerEvents = 'none';
                this.querySelector('span').innerText = '正在自动处理...';
                autoEvaluate();
            });
        }
    }

    // 定时器持续检测 (针对单页应用路由切换)
    setInterval(injectButton, 1500);

})();
