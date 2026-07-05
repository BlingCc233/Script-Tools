// ==UserScript==
// @name         党校系统自动评教助手
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  利用Vue实例穿透+精确物理事件模拟，一键全自动评教。
// @author       BlingCc
// @match        *://zhxy.qhswdx.org.cn/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=qhswdx.org.cn
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const feedbackList = [
        "课程政治站位高，理论阐释深入浅出，让我对党的最新理论成果有了更深刻的认识，受益匪浅。",
        "老师授课生动形象，能够将深奥的政治理论与当前社会热点、工作实际紧密结合，针对性极强。",
        "讲授逻辑严密、条理清晰，具有很强的思想性和指导性，极大地拓宽了我的工作视野。",
        "课程内容丰富充实，紧扣时代脉搏，学理框架搭建科学，对实际工作有极大的启发作用。",
        "教学态度严谨认真，教态得体大方，语言富有感染力，充分展现了党校教师的优秀风采。",
        "能准确把握中央和省委的决策部署，分析问题透彻，帮助我们理清了思想认识上的迷雾。",
        "问题导向明确，真正做到了理论联系实际。课堂氛围好，能引发深刻思考，是一堂不可多得的好课。",
        "政治立场坚定，旗帜鲜明讲政治，教学效果极佳，既有理论高度，又有实践深度，非常满意。",
        "老师备课充分，素材丰富。不仅传授了理论知识，更教授了分析问题、解决问题的方法，收获满满。",
        "完美实现了政治与学术的无缝衔接，用创新的学术理论阐释党的重大决策，极具说服力和吸引力。"
    ];

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function autoEvaluate() {
        // ==========================================
        // 1. 处理所有滑块打分 (85 ~ 97)
        // ==========================================
        const sliderRunways = document.querySelectorAll('.el-slider__runway');
        if (sliderRunways.length === 0) {
            alert('未检测到滑块，请等待页面加载完毕或确认页面是否正确！');
            return;
        }

        sliderRunways.forEach(runway => {
            const score = getRandomInt(85, 97);
            const sliderComponent = runway.parentElement; // 获取最外层的 .el-slider 元素

            if (sliderComponent && sliderComponent.__vue__) {
                try {
                    sliderComponent.__vue__.value = score;
                    if (typeof sliderComponent.__vue__.setPosition === 'function') {
                        sliderComponent.__vue__.setPosition(score);
                    }
                    sliderComponent.__vue__.$emit('input', score);
                    sliderComponent.__vue__.$emit('change', score);
                } catch (e) {
                    console.log("Vue 实例修改失败，尝试备选方案", e);
                }
            }

            const rect = runway.getBoundingClientRect();
            const targetX = rect.left + (rect.width * (score / 100)); 
            const targetY = rect.top + (rect.height / 2);

            const eventConfig = {
                bubbles: true, cancelable: true, view: window,
                clientX: targetX, clientY: targetY, button: 0
            };

            // 模拟按下、移动、抬起完整动作
            runway.dispatchEvent(new MouseEvent('mousedown', eventConfig));
            window.dispatchEvent(new MouseEvent('mousemove', eventConfig));
            window.dispatchEvent(new MouseEvent('mouseup', eventConfig));
        });

        // ==========================================
        // 2. 填写意见建议 (防止 Vue 拦截)
        // ==========================================
        const textarea = document.querySelector('textarea.el-textarea__inner');
        if (textarea) {
            const comment = feedbackList[Math.floor(Math.random() * feedbackList.length)];

            // 绕过 Vue 的 v-model 劫持，强制走原生原型链设值
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(textarea, comment);
            } else {
                textarea.value = comment;
            }

            // 触发双重事件，确保字被成功写入 Vue 的状态机
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // ==========================================
        // 3. 自动点击提交
        // ==========================================
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
        if (!location.hash.includes('/teas/appraise/taught_evel')) return;

        const barWrap = document.querySelector('.bar-wrap');
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
