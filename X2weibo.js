// ==UserScript==
// @name         X → 微博 皮肤 (Weibo Skin)
// @namespace    local.x2weibo
// @version      4.8.1
// @description  把 x.com / twitter.com 的界面改造成新浪微博：官方 logo 与 favicon（取自 weibo.com 原始文件）、微博字体栈与实测配色、中文词表、可用的微博式顶栏，右栏拉取微博真实热搜（点击跳哔哩哔哩搜索）。纯前端 CSS + DOM 层改造。
// @author       local
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      weibo.com
// @noframes
// ==/UserScript==

/*
 * ─────────────────────────────────────────────────────────────
 *  安装：Tampermonkey → 新建脚本 → 全选粘贴 → Ctrl+S
 *
 *  热键
 *    Alt+W        整体开关（微博皮肤 / X 原版）
 *    Alt+Shift+W  单独开关微博式顶栏
 *
 *  控制台工具
 *    __wbMissing()   列出界面骨架中尚未汉化的英文串
 *    __wbCarousel()  导出轮播切换键的候选元素与结构
 *    __wbHot()       导出热搜卡的注入状态与祖先链
 *    __wbHeader()    导出中栏 sticky / fixed 元素及其滚动容器
 *
 *  右栏热搜取自 weibo.com 公开接口，5 分钟缓存；点击条目在新标签
 *  打开哔哩哔哩搜索该词。接口不可用时回退到内置词条。
 *
 *  配置见下方 CFG。
 *
 *  ── 生效范围 ──
 *  本脚本只改变渲染结果（CSS 与 DOM）。DNS 查询、TLS SNI、目标 IP
 *  仍为 x.com，链路侧可见的信息不变。
 * ─────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* 用了 @grant 之后脚本跑在 Tampermonkey 沙箱里，window 是代理对象。
     凡是要动【真实】window / history、或要让页面控制台能访问到的东西
     （比如 __wbMissing），一律走 W。没加 grant 时 W 就是 window。 */
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  /* ============================================================
   * 0. 配置
   * ============================================================ */
  const CFG = {
    topBar:        true,   // 微博式固定顶栏（logo + 搜索框 + 消息/收藏/发现/通知）
    hotSearch:     true,   // 右栏注入仿微博「热搜榜」卡片
    navWhiteBg:    true,   // 左导航只铺一层白底；其余样式一律保持 X 原版
    weiboRightColumn: true, // 隐藏 X 专属右栏卡片（今日要闻 / X 自己的热搜），
                            // 让右栏只剩「微博热搜 + 推荐关注」＝ 微博的样子
    weiboLogo:     true,   // 左上角 X Logo → 微博官方 mark
    translate:     true,   // 中文文案替换
    spoofTitle:    true,   // 标签页标题 → 微博
    spoofFavicon:  true,   // 标签页图标 → 微博橙
    title:         '微博 - 随时随地发现新鲜事',
    searchHint:    '福泰',  // 顶栏搜索框的占位文字（显示为「大家都在搜：福泰」）
  };

  /* 以下数值全部来自「Electron 打开 weibo.com 后读到的 getComputedStyle」，
     不是估计值。注释里的 rgb() 就是实测原值。 */
  const C = {
    orange:     '#ff8200',   // rgb(255,130,0)   品牌橙 / 主按钮 / 选中态
    orangeDark: '#e87400',
    link:       '#eb7350',   // rgb(235,115,80)  正文里的 #话题# 和 @
    bg:         '#f1f2f5',   // rgb(241,242,245) 页面底色
    card:       '#ffffff',
    line:       '#f0f0f0',   // 分隔线
    line2:      '#e6e6e6',   // 卡片描边
    text:       '#333333',   // rgb(51,51,51)    正文 / 昵称
    sub:        '#808080',   // rgb(128,128,128) 互动计数
    time:       '#939393',   // rgb(147,147,147) 时间
    hover:      '#f7f7f7',
    radius:     '4px',       // 微博卡片实测圆角就是 4px，不是 8px
  };

  const state = { on: true, topBar: CFG.topBar };

  /* ============================================================
   * 1. 图形资源 —— 全部取自 weibo.com 自己的文件，不是重画的近似图形
   * ============================================================ */
  const WB_MARK = [
    { fill: '#fefefe', d: 'M29.136 219.44c0 45.849 59.707 83.045 133.364 83.045 73.657 0 133.363-37.197 133.363-83.045 0-45.859-59.707-83.045-133.364-83.045-73.656 0-133.363 37.186-133.363 83.045' },
    { fill: '#d52c2b', d: 'M165.616 295.712c-65.199 6.433-121.469-23.032-125.714-65.833-4.234-42.791 45.204-82.708 110.383-89.151 65.209-6.453 121.469 23.011 125.714 65.802 4.213 42.812-45.195 82.729-110.383 89.182m130.387-142.077c-5.553-1.657-9.358-2.782-6.443-10.084 6.29-15.811 6.934-29.465.123-39.191-12.794-18.276-47.772-17.284-87.862-.501 0-.01-12.59 5.512-9.368-4.469 6.177-19.831 5.236-36.44-4.357-46.023-21.743-21.764-79.599.818-129.201 50.4C21.75 140.933.18 180.308.18 214.344c0 65.117 83.516 104.707 165.211 104.707 107.1 0 178.343-62.213 178.343-111.62 0-29.854-25.139-46.79-47.731-53.796' },
    { fill: '#e79115', d: 'M367.124 34.465c-25.865-28.677-64.023-39.61-99.235-32.124h-.01c-8.141 1.749-13.336 9.757-11.598 17.888 1.728 8.151 9.747 13.357 17.898 11.608 25.057-5.318 52.159 2.465 70.558 22.827 18.348 20.373 23.349 48.16 15.484 72.511v.01c-2.567 7.926 1.769 16.415 9.716 18.982 7.916 2.557 16.425-1.78 18.992-9.695v-.051c11.045-34.262 4.05-73.31-21.805-101.956' },
    { fill: '#e79115', d: 'M327.396 70.305c-12.59-13.96-31.162-19.268-48.324-15.617-7.016 1.493-11.495 8.397-9.972 15.412 1.483 6.985 8.386 11.485 15.372 9.961v.02c8.407-1.78 17.489.808 23.645 7.609 6.167 6.832 7.814 16.139 5.165 24.3h.02c-2.199 6.811 1.534 14.144 8.345 16.353 6.832 2.178 14.144-1.544 16.343-8.366 5.392-16.689 2.017-35.711-10.594-49.672' },
    { fill: '#060101', d: 'M169.206 218.197c-2.27 3.897-7.312 5.768-11.27 4.142-3.886-1.595-5.103-5.942-2.884-9.788 2.27-3.805 7.108-5.666 10.984-4.122 3.937 1.433 5.349 5.841 3.17 9.768m-20.761 26.672c-6.32 10.043-19.82 14.451-29.986 9.818-10.023-4.561-12.978-16.251-6.678-26.059 6.218-9.777 19.278-14.124 29.373-9.89 10.216 4.358 13.468 15.955 7.291 26.131m23.676-71.202c-31.019-8.08-66.089 7.384-79.558 34.732-13.725 27.869-.45 58.817 30.897 68.942 32.451 10.462 70.722-5.584 84.037-35.663 13.112-29.423-3.273-59.716-35.376-68.011' },
  ];

  const svgMark = (w) => {
    const h = Math.round((w * 323) / 404);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 404 323" ` +
           `width="${w}" height="${h}">` +
           WB_MARK.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join('') +
           '</svg>';
  };

  const FAVICON_ICO_B64 = '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';

  const dataUri = (svg) =>
    `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;

  /* ============================================================
   * 2. 主样式表
   * ============================================================ */
  const CSS = `
/* ── 1. 基底：灰底 + 微博字体栈 ── */
html { color-scheme: light !important; }
html, body { background: ${C.bg} !important; }
#react-root, #react-root > div, #react-root > div > div {
  background-color: ${C.bg} !important;
}
html, body, button, input, textarea, select,
[contenteditable="true"], [role="button"] {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans",
               "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif !important;
}
::selection { background: rgba(255,130,0,.22) !important; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: #d8d8d8; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #c2c2c2; }
::-webkit-scrollbar-track { background: transparent; }

/* ── 2. 中栏 = 微博白卡 ── */
[data-testid="primaryColumn"] {
  background: ${C.card} !important;
  border: 1px solid ${C.line2} !important;
  border-radius: ${C.radius} !important;
  margin: 0 10px 24px !important;
  box-shadow: none !important;
}
[data-testid="primaryColumn"] h2[role="heading"],
[data-testid="primaryColumn"] h2[role="heading"] span {
  font-size: 16px !important; font-weight: 500 !important; color: ${C.text} !important;
}
[data-testid="primaryColumn"] [style*="backdrop-filter"] {
  backdrop-filter: none !important;
  background-color: ${C.card} !important;
}
[role="tablist"] [role="tab"] { min-height: 44px !important; }
[role="tablist"] [role="tab"] span {
  font-size: 15px !important; color: ${C.text} !important; font-weight: 400 !important;
}
[role="tablist"] [role="tab"][aria-selected="true"] span {
  color: ${C.orange} !important; font-weight: 500 !important;
}
[role="tablist"] [role="tab"] > div > div > div:last-child {
  background-color: transparent !important;
}

/* ── 3. 左导航：只铺一层白底 ── */
${CFG.navWhiteBg ? `
header[role="banner"] > div,
header[role="banner"] > div > div {
  background: ${C.card} !important;
}
` : ''}

/* ── 4. 发布按钮 ── */
[data-testid="BottomBar"] a[href="/compose/post"] { background: ${C.orange} !important; }
[data-testid="tweetButtonInline"], [data-testid="tweetButton"] {
  background: ${C.orange} !important; border-radius: 6px !important;
}
[data-testid="tweetButtonInline"]:hover, [data-testid="tweetButton"]:hover {
  background: ${C.orangeDark} !important;
}

/* ── 5. 右栏卡片 ── */
[data-testid="sidebarColumn"] { margin-top: 0 !important; }
[data-testid="sidebarColumn"] section {
  background: ${C.card} !important;
  border: 1px solid ${C.line2} !important;
  border-radius: ${C.radius} !important;
  overflow: hidden !important;
  margin-bottom: 10px !important;
}
[data-testid="sidebarColumn"] h2,
[data-testid="sidebarColumn"] h2 span {
  font-size: 17px !important; font-weight: 600 !important; color: ${C.text} !important;
}
/* 搜索框 → 微博灰药丸。
   使用 :has() 精准限制选择器，避免命中搜索下拉建议容器。如果不限制，
   在 /search 页面搜索框展开时，下拉层会被加上 999px 圆角变成巨大的白色圆形遮挡页面。 */
[role="search"] > div > div:has(> [data-testid="SearchBox_Search_Input"]),
[role="search"] > div > div:has(> form),
[data-testid="SearchBox_Search_Input"] {
  background-color: #f5f5f5 !important;
  border-radius: 999px !important;
}
[data-testid="SearchBox_Search_Input"] {
  background-color: transparent !important; color: ${C.text} !important; font-size: 14px !important;
  border-radius: 0 !important;
}
[data-testid="SearchBox_Search_Input"]::placeholder { color: ${C.time} !important; }

/* ── 6. 正文与用户信息 ── */
[data-testid="tweetText"] {
  font-size: 16px !important; line-height: 1.65 !important; color: ${C.text} !important;
}
[data-testid="tweetText"] a, a[href^="/hashtag/"] { color: ${C.link} !important; }
[data-testid="User-Name"] { color: ${C.time} !important; }
[data-testid="User-Name"] > div:first-child span {
  color: ${C.text} !important; font-weight: 700 !important; font-size: 15px !important;
}
[data-testid="User-Name"] > div:nth-child(2) span {
  color: ${C.time} !important; font-size: 13px !important;
}
[data-testid="icon-verified"], [data-testid="icon-verified"] svg,
svg[data-testid="icon-verified"] { color: ${C.orange} !important; fill: ${C.orange} !important; }
[data-testid="socialContext"] span { color: ${C.sub} !important; font-size: 13px !important; }

/* ── 7. 互动栏 ── */
[data-testid="reply"], [data-testid="retweet"], [data-testid="like"],
[data-testid="bookmark"], [data-testid="share"] { color: ${C.time} !important; }
[data-testid="reply"] svg, [data-testid="retweet"] svg, [data-testid="like"] svg,
[data-testid="bookmark"] svg, [data-testid="share"] svg { color: inherit !important; }
[data-testid="reply"] span, [data-testid="retweet"] span, [data-testid="like"] span,
[data-testid="bookmark"] span { font-size: 14px !important; color: ${C.sub} !important; }
[data-testid="like"] svg[style*="rgb(249, 24, 128)"],
[data-testid="like"] svg[style*="rgb(249,24,128)"] { color: ${C.orange} !important; }
[data-testid="retweet"] svg[style*="rgb(0, 186, 124)"],
[data-testid="retweet"] svg[style*="rgb(0,186,124)"] { color: ${C.orange} !important; }

/* ── 8. 圆角 / 分隔线 / 悬停 ── */
[data-testid="tweetPhoto"] img, [data-testid="tweetPhoto"] video,
[data-testid="card.layoutSmall.media"], [data-testid="card.wrapper"] img {
  border-radius: 6px !important;
}
[data-testid="cellInnerDiv"]:hover { background: ${C.hover} !important; }

/* ── 8.5 X 的提示气泡 ── */
[data-testid="toast"], [data-testid="toast"] > div,
[role="alert"], [role="alert"] > div {
  background-color: ${C.card} !important;
  box-shadow: 0 4px 16px rgba(0,0,0,.14) !important;
}
[data-testid="toast"] span, [data-testid="toast"] div,
[role="alert"] span, [role="alert"] div {
  color: ${C.text} !important;
}
[data-testid="toast"] svg, [role="alert"] svg {
  color: ${C.orange} !important; fill: ${C.orange} !important;
}

/* ── 8.6 X 的启动 / 加载页 ── */
svg:has(path[d^="M18.244 2.25"]) { display: none !important; }

/* ── 9. 干掉 X 专属入口 ── */
a[href="/i/grok"], a[href^="/i/grok"], a[href*="/i/grok"],
a[href="/i/premium_sign_up"], a[href^="/i/premium_sign_up"],
a[href="/i/verified-orgs-signup"], a[href="/jobs"], a[href="/i/jobs"],
a[aria-label="Grok"], a[aria-label="Premium"], a[aria-label="Verified Orgs"],
a[aria-label="Jobs"], button[aria-label="Grok"],
[data-testid="GrokDrawer"], [data-testid="grok-drawer"],
[aria-label="Subscribe to Premium"], [data-testid="premiumCard"],
aside[aria-label="Subscribe to Premium"] { display: none !important; }

/* ── 10. 左上角 Logo → 真实微博 mark ── */
${CFG.weiboLogo ? `
h1[role="heading"] a[href="/home"] svg, a[aria-label="X"] svg { display: none !important; }
h1[role="heading"] a[href="/home"] {
  display: flex !important; align-items: center !important;
  justify-content: center !important; width: 40px !important; height: 32px !important;
}
h1[role="heading"] a[href="/home"]::after {
  content: "" !important; display: block !important;
  width: 38px !important; height: 30px !important;
  background: ${dataUri(svgMark(38))} center / contain no-repeat !important;
}` : ''}

/* ── 11. 注入的微博式顶栏 ── */
#wb-topbar {
  position: fixed; top: 0; left: 0; right: 0; height: 56px;
  display: flex; align-items: center; gap: 22px;
  padding: 0 24px; box-sizing: border-box;
  background: #fff; border-bottom: 1px solid ${C.line};
  z-index: 500; user-select: none;
}
#wb-topbar .wb-brand {
  display: flex; align-items: center; gap: 7px; flex: none;
  text-decoration: none; cursor: pointer;
}
#wb-topbar .wb-brand b {
  font-size: 21px; font-weight: 700; color: ${C.orange}; letter-spacing: 1px;
}
#wb-topbar .wb-sbox {
  width: 440px; height: 36px; flex: none;
  display: flex; align-items: center; gap: 8px; padding: 0 14px;
  background: #f5f5f5; border-radius: 18px;
}
#wb-topbar .wb-sbox:focus-within { background: #fff; box-shadow: 0 0 0 1px ${C.orange}; }
#wb-topbar .wb-sbox svg { flex: none; opacity: .55; }
#wb-topbar .wb-sinput {
  flex: 1; min-width: 0; height: 100%;
  border: none; outline: none; background: transparent;
  font-family: inherit; font-size: 14px; color: ${C.text};
}
#wb-topbar .wb-sinput::placeholder { color: ${C.time}; }
#wb-topbar .wb-links {
  margin-left: auto; display: flex; align-items: center; gap: 22px;
  font-size: 14px;
}
#wb-topbar .wb-links a {
  color: ${C.text}; text-decoration: none; cursor: pointer;
}
#wb-topbar .wb-links a:hover { color: ${C.orange}; }
#wb-topbar .wb-ava {
  width: 32px; height: 32px; border-radius: 50%; flex: none;
  border: none; padding: 0; cursor: pointer;
  background: linear-gradient(135deg, #ffab00, #ff7a00);
  background-size: cover; background-position: center; background-repeat: no-repeat;
}

/* ── 12. 注入的微博热搜榜 ── */
#wb-hotsearch {
  background: ${C.card}; border: 1px solid ${C.line2};
  border-radius: ${C.radius}; margin-bottom: 10px; overflow: hidden;
  box-sizing: border-box;
  position: static;
}
#wb-hotsearch .wb-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid ${C.line};
}
#wb-hotsearch .wb-hd b { font-size: 17px; font-weight: 600; color: ${C.text}; }
#wb-hotsearch .wb-hd span { font-size: 13px; color: ${C.time}; cursor: pointer; }
#wb-hotsearch .wb-hd span:hover { color: ${C.orange}; }
#wb-hotsearch .wb-it {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 14px; font-size: 15px; color: ${C.text};
  text-decoration: none; cursor: pointer;
}
#wb-hotsearch .wb-it:hover { background: ${C.hover}; }
#wb-hotsearch .wb-no { width: 15px; flex: none; text-align: center; font-size: 15px; }
#wb-hotsearch .wb-no.hot { color: #f26d5f; font-family: Georgia, serif; }
#wb-hotsearch .wb-no.dot { color: #cccccc; font-size: 13px; }
#wb-hotsearch .wb-title {
  flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
#wb-hotsearch .wb-heat { flex: none; font-size: 12px; color: ${C.time}; }
#wb-hotsearch .wb-tag {
  flex: none; font-size: 10px; line-height: 14px; padding: 0 3px;
  border-radius: 2px; color: #fff;
}
`;

  /* 顶栏 + 布局下推单独一张表，方便单独开关 */
  const TOPBAR_CSS = `
html { --wb-top: 56px; }
body { padding-top: var(--wb-top) !important; box-sizing: border-box !important; }

header[role="banner"] { top: var(--wb-top) !important; }
header[role="banner"] > div {
  top: var(--wb-top) !important;
  max-height: calc(100vh - var(--wb-top)) !important;
}

/* 观看大图/视频或打开模态框时，顶栏自动收起，避免遮挡内容 */
body:has([aria-modal="true"]) #wb-topbar,
body:has([data-testid="swipe-to-dismiss"]) #wb-topbar,
body:has([data-testid="mask"]) #wb-topbar {
  display: none !important;
}
`;

  /* ============================================================
   * 3. 样式注入
   * ============================================================ */
  const styleEl = document.createElement('style');
  styleEl.id = 'wb-skin-style';
  styleEl.textContent = CSS;

  const topStyleEl = document.createElement('style');
  topStyleEl.id = 'wb-topbar-style';
  topStyleEl.textContent = TOPBAR_CSS;

  function injectStyles() {
    const host = document.head || document.documentElement;
    if (!host) return;
    if (!styleEl.isConnected) host.appendChild(styleEl);
    if (state.topBar && !topStyleEl.isConnected) host.appendChild(topStyleEl);
  }
  injectStyles();
  document.addEventListener('DOMContentLoaded', injectStyles, { once: true });

  /* ============================================================
   * 4. 汉化词表
   * ============================================================ */
  const EXACT = {
    'Home': '首页', 'Explore': '发现', 'Notifications': '消息', 'Messages': '私信',
    'Bookmarks': '收藏', 'Communities': '超话', 'Profile': '我', 'More': '更多',
    'Lists': '分组', 'Jobs': '招聘', 'Grok': '智能助手', 'Premium': '会员',
    'Verified Orgs': '认证机构', 'Articles': '文章',
    'Chat': '聊天', 'History': '历史', 'Creator Studio': '创作者中心',
    'Studio': '创作者中心', 'Monetization': '变现', 'Subscriptions': '订阅',
    'Analytics': '数据分析', 'Switch account': '切换账号',
    'Keyboard shortcuts': '键盘快捷键',
    'Home timeline': '首页', 'Notifications timeline': '消息',
    'Account menu': '账号菜单', 'Add an existing account': '添加已有账号',
    'Log out': '退出登录', 'Log out of X': '退出登录',
    'Upgrade to Premium': '升级会员', 'Upgrade': '升级',
    'Post': '发微博', 'Posts': '微博', 'New post': '发微博', 'Compose post': '发微博',
    'Post all': '全部发布', 'Post your reply': '发布你的评论', 'Reply': '回复',
    'Drafts': '草稿箱', 'Schedule post': '定时发布', 'Schedule': '定时',
    'What is happening?!': '有什么新鲜事想分享给大家？',
    "What's happening?": '有什么新鲜事想分享给大家？',
    'Add photos or video': '图片/视频', 'Add a GIF': '动图', 'Add a poll': '投票',
    'Add location': '位置', 'Tag people': '提到谁', 'Add description': '添加描述',
    'Everyone can reply': '所有人可评论', 'Who can reply?': '谁可以评论？',
    'Choose who can reply to this post.': '选择谁可以评论这条微博。',
    'Anyone can reply': '所有人', 'Accounts you follow': '我关注的人',
    'Only accounts you mention': '仅提到的人', 'Verified accounts': '认证用户',
    'Everyone': '所有人', 'Text': '正文', 'GIF': '动图',
    'Poll': '投票', 'Alt': '图片描述', 'Content disclosure': '内容声明',
    'Remove': '移除', 'Remove media': '移除媒体', 'Save': '保存', 'Cancel': '取消',
    'Delete': '删除', 'Edit': '编辑', 'Discard': '放弃', 'Unsaved changes': '未保存的修改',
    'Delete post?': '删除这条微博？',
    "This can't be undone and it will be removed from your profile, the timeline of any accounts that follow you, and from search results.":
      '删除后不可恢复，将从你的主页、关注者的时间线和搜索结果中移除。',
    'For you': '推荐', 'Subscribe': '订阅',
    'Show less': '收起', 'Discover more': '发现更多',
    'Sourced from across X': '来自全网', 'Load more': '加载更多',
    'Retry': '重试', 'Try again': '重试', 'Something went wrong': '出错了',
    'Something went wrong. Try reloading.': '出错了，请刷新重试。',
    'Learn more': '了解更多', 'Dismiss': '忽略', 'Got it': '知道了',
    'Loading': '加载中', 'No results': '没有结果', 'No results for': '没有找到',
    'Pinned': '置顶', 'Promoted': '推广', 'You reposted': '你转发了',
    'Follows you': '关注了你', 'Replying to': '回复', 'Show this thread': '展开全文',
    'See new posts': '查看新微博', 'New posts': '新微博', 'Translate post': '翻译微博',
    'Show original': '查看原文', 'Trending': '热搜', 'Live': '直播',
    'Views': '阅读', 'View': '查看', 'View post analytics': '查看数据',
    'View post engagements': '查看互动', 'Copy link': '复制链接',
    'Copy link to post': '复制微博链接', 'Embed post': '嵌入微博',
    'Send via Direct Message': '私信发送', 'Share via': '分享到',
    'Share post': '分享微博', 'Share': '分享', 'Bookmark': '收藏',
    'Remove bookmark': '取消收藏', 'Not interested in this post': '不感兴趣',
    'Report post': '举报', 'Report': '举报', 'Block': '拉黑', 'Unblock': '取消拉黑',
    'Mute': '屏蔽', 'Unmute': '取消屏蔽', 'Follow': '关注', 'Unfollow': '取消关注',
    'Follow back': '回关', 'Like': '赞', 'Unlike': '取消赞', 'Repost': '转发',
    'Undo repost': '取消转发', 'Quote': '引用', 'Add/remove from Lists': '加入/移出分组',
    'Pin to profile': '在主页置顶', 'Change who can reply': '修改评论权限',
    'Highlight': '精选', 'Highlights': '精选',
    "What's happening": '热搜', 'Trends': '热搜', 'Who to follow': '推荐关注',
    'Relevant people': '相关用户', "Today's News": '今日要闻', 'Ad': '广告',
    'Ads': '广告', 'Advertise': '广告投放', 'Live on X': '正在直播',
    'Only on X': '仅限 X', 'Suggested for you': '为你推荐', 'Trending now': '热搜',
    "What's happening now": '正在发生', 'View all': '查看全部', 'Show more': '查看更多',
    'Terms of Service': '服务条款', 'Privacy Policy': '隐私政策',
    'Cookie Policy': 'Cookie 政策', 'Accessibility': '无障碍', 'Ads info': '广告信息',
    'Help Center': '帮助中心', 'About': '关于', 'Settings and privacy': '设置与隐私',
    'Search': '搜索', 'Search X': '搜索微博', 'Search and explore': '搜索',
    'Try searching for people, lists, or keywords': '搜索用户、分组或关键词',
    'Search settings': '搜索设置', 'Save search': '保存搜索',
    'Recent': '最近', 'Clear': '清除', 'Clear all': '全部清除',
    'Welcome to your inbox!': '欢迎来到私信',
    'Drop a line to say hello and start a conversation.': '发条消息，开始聊天吧。',
    'Write a message...': '发消息…', 'Search Direct Messages': '搜索私信',
    'Delete conversation': '删除会话', 'New message': '新建私信',
    'Start a new message': '发起新对话', 'Unsent': '未发送', 'Sent': '已发送',
    'Seen': '已读', 'Sending': '发送中', 'Failed': '发送失败',
    'Edit profile': '编辑资料', 'Followers': '粉丝', 'Following': '关注',
    'Joined': '加入于', 'Not followed by anyone you\'re following': '你关注的人都没有关注他',
    'Media': '媒体', 'Likes': '赞', 'Replies': '评论', 'Verified': '认证',
    'Verification': '认证', 'Change your password': '修改密码',
    'Account information': '账号信息', 'Deactivate your account': '注销账号',
    'Download an archive of your data': '下载你的数据存档',
    'Security and account access': '安全与账号访问', 'Privacy and safety': '隐私与安全',
    'Accessibility, display, and languages': '无障碍、显示与语言',
    'Additional resources': '更多资源', 'Display': '显示', 'Font size': '字号',
    'Color': '颜色', 'Background': '背景', 'Dim': '暗色', 'Lights out': '纯黑',
    'Default': '默认', 'Motion': '动效', 'Reduce motion': '减少动效',
    'Data usage': '流量与数据', 'Autoplay': '自动播放', 'Your account': '我的账号',
    'Timeline': '时间线', 'Content you see': '内容偏好', 'Muted': '已屏蔽',
    'Blocked': '已拉黑', 'Muted accounts': '已屏蔽账号', 'Blocked accounts': '已拉黑账号',
    'Back': '返回', 'Close': '关闭', 'Next': '下一步', 'Previous': '上一步',
    'Done': '完成', 'OK': '确定', 'Yes': '是', 'No': '否', 'Apply': '应用',
    'Menu': '菜单', 'More items': '更多', 'Add': '添加', 'Create': '创建',
    'Create a new List': '创建分组', 'Pinned Lists': '置顶分组', 'Your Lists': '我的分组',
    'Discover new Lists': '发现分组', 'Member of': '已加入',
    'Discover new Communities': '发现超话', 'Your Communities': '我的超话',
    'Create a Community': '创建超话', 'Save posts for later': '收藏起来稍后再看',
    "You haven't added any posts to your Bookmarks yet": '你还没有收藏任何微博',
    'Sign in': '登录', 'Sign up': '注册', 'Log in': '登录', 'Create account': '创建账号',
    'New to X?': '还没账号？', 'Sign up now to get your own personalized timeline!':
      '立即注册，获得属于你的个性化时间线！',
    'By signing up, you agree to the Terms of Service and Privacy Policy, including Cookie Use.':
      '注册即表示你同意服务条款和隐私政策，包括 Cookie 使用。',
    'News': '要闻', 'Sports': '体育', 'Entertainment': '娱乐',
    'Fun': '搞笑', 'Lifestyle': '生活', 'Technology': '科技', 'Business': '财经',
    'Science': '科学', 'Travel': '旅游', 'Food': '美食', 'Music': '音乐',
    'Gaming': '游戏', 'Movies': '电影', 'Fashion': '时尚', 'Health': '健康',
  };

  const PHRASES = [
    [/\bShow (\d+) more repl(?:y|ies)\b/gi, '展开 $1 条评论'],
    [/\bRead (\d+) repl(?:y|ies)\b/gi, '查看 $1 条评论'],
    [/\b(\d+) more repl(?:y|ies)\b/gi, '还有 $1 条评论'],
    [/\bShow more replies\b/gi, '展开更多评论'],
    [/\bShow (\d+) more\b/gi, '再显示 $1 条'],
    [/\bShow more\b/gi, '查看更多'],
    [/\bShow less\b/gi, '收起'],
    [/\bPromoted by\b/gi, '推广自'],
    [/\bPromoted\b/gi, '推广'],
    [/\bSuggested for you\b/gi, '为你推荐'],
    [/\bBecause you follow @(\w+)\b/gi, '因为你关注了 @$1'],
    [/\bShow this thread\b/gi, '展开全文'],
    [/\bReplying to\b/gi, '回复'],
    [/\bFollows you\b/gi, '关注了你'],
    [/\bYou reposted\b/gi, '你转发了'],
    [/\bYou liked\b/gi, '你赞了'],
    [/^(.{0,40}?) reposted$/i, '$1 转发'],
    [/\bJoined ([A-Z][a-z]+ \d{4})\b/g, '$1 加入'],
    [/\bTranslated from (\w+)\b/gi, '由$1翻译'],
    [/\bAuto-translated from (\w+)\b/gi, '自动翻译自$1'],
    [/^reposted$/i, '转发了'],
    [/^liked$/i, '赞了'],
    [/^posted$/i, '发表了'],
    [/^replied$/i, '回复了'],
    [/^followed you$/i, '关注了你'],
    [/^mentioned you$/i, '提到了你'],
    [/\bTrending in (.+)$/i, '$1 热搜'],
    [/\bTrending with (.+)$/i, '热搜：$1'],
    [/\b(\d[\d,.]*\s*[KMB]?)\s+posts?\b/gi, '$1 微博'],
    [/\b(\d[\d,.]*\s*[KMB]?)\s+Followers?\b/gi, '$1 粉丝'],
    [/\b(\d[\d,.]*\s*[KMB]?)\s+Following\b/gi, '$1 关注'],
    [/\b(\d[\d,.]*\s*[KMB]?)\s+Likes?\b/gi, '$1 赞'],
    [/\b(\d[\d,.]*\s*[KMB]?)\s+Reposts?\b/gi, '$1 转发'],
    [/\b(\d[\d,.]*\s*[KMB]?)\s+Repl(?:y|ies)\b/gi, '$1 评论'],
    [/\b(\d[\d,.]*\s*[KMB]?)\s+Quotes?\b/gi, '$1 引用'],
    [/\b(\d[\d,.]*\s*[KMB]?)\s+Bookmarks?\b/gi, '$1 收藏'],
    [/\b(\d[\d,.]*\s*[KMB]?)\s+Views?\b/gi, '$1 阅读'],
    [/\b(\d+)\s+people are posting\b/gi, '$1 人正在讨论'],
    [/\b(\d+)\s+people are talking about this\b/gi, '$1 人正在讨论'],
    [/\b(\d+) (?:seconds?|secs?|sec) ago\b/gi, '$1秒前'],
    [/\b(\d+) (?:minutes?|mins?|min) ago\b/gi, '$1分钟前'],
    [/\b(\d+) (?:hours?|hrs?|hr) ago\b/gi, '$1小时前'],
    [/\b(\d+) days? ago\b/gi, '$1天前'],
    [/\b(\d+) (?:weeks?|wks?) ago\b/gi, '$1周前'],
    [/\b(\d+) months? ago\b/gi, '$1个月前'],
    [/\b(\d+) years? ago\b/gi, '$1年前'],
    [/\bFollow @(\w+)\b/g, '关注 @$1'],
    [/\bUnfollow @(\w+)\b/g, '取消关注 @$1'],
    [/\bReply to @(\w+)\b/g, '回复 @$1'],
    [/\bPost to @(\w+)\b/g, '发布到 @$1'],
    [/\bfrom @(\w+)\b/g, '来自 @$1'],
  ];

  const TIME = [
    [/^(\d+)\s*s$/i, '$1秒前'],
    [/^(\d+)\s*m$/i, '$1分钟前'],
    [/^(\d+)\s*h$/i, '$1小时前'],
    [/^(\d+)\s*d$/i, '$1天前'],
    [/^(\d+)\s*w$/i, '$1周前'],
    [/^now$/i, '刚刚'],
  ];

  const SCOPE_FULL = [
    '[data-testid="BottomBar"]',
    '[data-testid="sidebarColumn"]',
    '[data-testid="toolBar"]',
    '[data-testid="Dropdown"]',
    '[data-testid="SheetDialog"]',
    '[data-testid="toast"]',
    '[role="alert"]',
    '[data-testid="socialContext"]',
    '[data-testid="tweetTextarea_0_label"]',
    '[role="tablist"]',
    '[role="tab"]',
    '[role="menu"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="dialog"]',
    '[role="tooltip"]',
    'button',
    '[role="button"]',
    'h1[role="heading"]',
    'h2[role="heading"]',
  ].join(',');

  const NAME_SCOPE = '[data-testid="User-Name"]';
  const ATTRS = ['aria-label', 'title', 'placeholder'];

  const PLACEHOLDER = {
    "What's happening?": '有什么新鲜事想分享给大家？',
    'What is happening?!': '有什么新鲜事想分享给大家？',
    'Post your reply': '发布你的评论',
    'Add another post': '添加一条',
    'Search': '搜索',
    'Search Direct Messages': '搜索私信',
    'Write a message...': '发消息…',
    'Start a new message': '发起新对话',
    'Add a comment': '添加评论',
    'Add description': '添加图片描述',
    'Describe the image': '描述这张图片',
    'Say something about this image': '说说这张图片',
    'Search for a location': '搜索地点',
    'Search people': '搜索用户',
    'Add a location': '添加地点',
    'Add alt text': '添加图片描述',
  };

  const normQ = (s) => s
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”]/g, '"');

  function applyExact(s) {
    return Object.prototype.hasOwnProperty.call(EXACT, s) ? EXACT[s] : null;
  }

  function applyPhrases(s) {
    let out = s;
    for (const [re, to] of PHRASES) {
      re.lastIndex = 0;
      if (re.test(out)) { re.lastIndex = 0; out = out.replace(re, to); }
    }
    return out === s ? null : out;
  }

  function applyTime(s) {
    for (const [re, to] of TIME) {
      if (re.test(s)) return s.replace(re, to);
    }
    return null;
  }

  function applyComposite(s) {
    if (!/[·|]/.test(s)) return null;
    const parts = s.split(/(\s*[·|]\s*)/);
    if (parts.length < 3) return null;
    let changed = false;
    const out = parts.map((seg) => {
      if (/^\s*[·|]\s*$/.test(seg)) return seg;
      const t = seg.trim();
      if (!t) return seg;
      const r = applyExact(t) || applyPhrases(t);
      if (r && r !== t) { changed = true; return seg.replace(t, r); }
      return seg;
    }).join('');
    return changed ? out : null;
  }

  function textAction(node) {
    const p = node.parentElement;
    if (!p) return 'skip';
    const tag = p.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'NOSCRIPT') {
      return 'skip';
    }
    if (p.closest('#wb-hotsearch,#wb-topbar')) return 'skip';
    if (p.closest('header[role="banner"]')) return 'skip';

    const v = (node.nodeValue || '').trim();
    if (!v) return 'skip';

    if (p.closest('[data-testid="tweetText"],[data-testid="DMComposerTextInput"],' +
                  '[data-testid="messageEntry"]')) return 'skip';

    const ce = p.closest('[contenteditable="true"]');
    if (ce) {
      return (PLACEHOLDER[normQ(v)] && ce.textContent.trim() === v) ? 'placeholder' : 'skip';
    }

    if (p.closest(NAME_SCOPE)) return 'time';
    if (p.closest(SCOPE_FULL)) return 'full';
    return 'skip';
  }

  function rewriteTextNode(node) {
    const mode = textAction(node);
    if (mode === 'skip') return;
    const raw = node.nodeValue;
    const key = raw.trim();
    if (!key || key.length > 140) return;
    const norm = normQ(key);

    let out = null;
    if (mode === 'time') {
      out = applyTime(norm);
    } else if (mode === 'placeholder') {
      out = PLACEHOLDER[norm];
    } else {
      out = applyTime(norm);
      if (out == null) out = applyExact(norm);
      if (out == null) out = applyComposite(norm);
      if (out == null) out = applyPhrases(key) || applyPhrases(norm);
    }

    if (out == null || out === key || out === norm) return;
    node.nodeValue = raw.replace(key, out);
  }

  function rewriteAttrs(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a);
      if (!v || v.length > 140) continue;
      const norm = normQ(v);
      const out = applyExact(norm) || applyComposite(norm) || applyPhrases(v) || applyPhrases(norm);
      if (out && out !== v) el.setAttribute(a, out);
    }
  }

  function translateTree(root) {
    if (!CFG.translate || !state.on || !root || root.nodeType !== 1) return;
    if (root.closest && root.closest('#wb-hotsearch,#wb-topbar')) return;

    rewriteAttrs(root);
    for (const el of root.querySelectorAll('[aria-label],[title],[placeholder]')) {
      rewriteAttrs(el);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const batch = [];
    while (walker.nextNode()) batch.push(walker.currentNode);
    for (const n of batch) rewriteTextNode(n);
  }

  /* ============================================================
   * 5. 标签页伪装：标题 + favicon
   * ============================================================ */
  let faviconEl = null;

  function spoofTitle() {
    if (!state.on || !CFG.spoofTitle) return;
    if (document.title !== CFG.title) document.title = CFG.title;
  }

  function spoofFavicon() {
    if (!state.on || !CFG.spoofFavicon || !document.head) return;
    if (!faviconEl || !faviconEl.isConnected) {
      faviconEl = document.createElement('link');
      faviconEl.id = 'wb-favicon';
      faviconEl.rel = 'icon';
      faviconEl.type = 'image/x-icon';
      faviconEl.href = 'data:image/x-icon;base64,' + FAVICON_ICO_B64;
      document.head.appendChild(faviconEl);
    }
    for (const l of document.head.querySelectorAll('link[rel*="icon"]')) {
      if (l !== faviconEl && l.parentNode) l.parentNode.removeChild(l);
    }
  }

  /* ============================================================
   * 6. 微博式顶栏（logo + 搜索框 + 消息/收藏/历史 + 头像）
   * ============================================================ */
  const MAG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
    'stroke="#808080" stroke-width="2.2"><circle cx="10.5" cy="10.5" r="7"/>' +
    '<path d="M15.8 15.8 21 21" stroke-linecap="round"/></svg>';

  function injectTopBar() {
    if (!state.on || !state.topBar || !document.body) return;
    if (document.getElementById('wb-topbar')) return;

    const bar = document.createElement('div');
    bar.id = 'wb-topbar';
    bar.innerHTML =
      `<a class="wb-brand" href="/home" title="首页">${svgMark(30)}<b>微博</b></a>` +
      `<form class="wb-sbox">${MAG}` +
        `<input class="wb-sinput" type="text" autocomplete="off" spellcheck="false" ` +
        `placeholder="大家都在搜：${esc(CFG.searchHint)}"></form>` +
      `<div class="wb-links">` +
        `<a href="/messages">消息</a>` +
        `<a href="/i/bookmarks">收藏</a>` +
        `<a href="/explore">发现</a>` +
        `<a href="/notifications">通知</a>` +
      `</div>` +
      `<button class="wb-ava" type="button" title="账号"></button>`;
    document.body.appendChild(bar);

    const form = bar.querySelector('.wb-sbox');
    const sInput = form.querySelector('.wb-sinput');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = sInput.value.trim();
      if (!q) return;
      goTo('/search?q=' + encodeURIComponent(q) + '&src=typed_query');
      sInput.blur();
    });
    for (const ev of ['keydown', 'keypress', 'keyup']) {
      sInput.addEventListener(ev, (e) => e.stopPropagation());
    }

    bar.querySelector('.wb-ava').addEventListener('click', () => {
      const btn = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') ||
                  document.querySelector('[aria-label="Account menu"]');
      if (btn) btn.click(); else goTo('/home');
    });
  }

  function syncAvatar() {
    const btn = document.querySelector('#wb-topbar .wb-ava');
    if (!btn) return;
    const img = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] img') ||
                document.querySelector('header[role="banner"] img[src*="profile_images"]');
    const src = img && (img.getAttribute('src') || img.src);
    if (src && src !== btn.dataset.src) {
      btn.dataset.src = src;
      btn.style.backgroundImage = `url("${src}")`;
    }
  }

  const HEADER_MAX_H = 160;
  let lastStickyFix = 0;

  function fixStickyHeaders() {
    if (!state.on || !state.topBar) return;
    const now = Date.now();
    if (now - lastStickyFix < 400) return;
    lastStickyFix = now;

    const col = document.querySelector('[data-testid="primaryColumn"]');
    if (!col) return;

    const sticky = [];
    (function scan(root, depth) {
      for (const el of root.children) {
        if (getComputedStyle(el).position === 'sticky') sticky.push(el);
        else if (depth > 0) scan(el, depth - 1);
      }
    })(col, 3);

    for (const el of sticky) {
      const h = el.getBoundingClientRect().height;
      if (h === 0 || h > HEADER_MAX_H) continue;

      let sc = el.parentElement, scrollBox = null;
      while (sc && sc !== document.body && sc !== document.documentElement) {
        const oy = getComputedStyle(sc).overflowY;
        if (oy === 'auto' || oy === 'scroll') { scrollBox = sc; break; }
        sc = sc.parentElement;
      }
      el.style.setProperty('top', scrollBox ? '0px' : 'var(--wb-top)', 'important');
    }
  }

  function hideSplash() {
    if (!state.on) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!vw || !vh) return;

    for (const el of document.querySelectorAll('div')) {
      const s = getComputedStyle(el);
      if (s.backgroundColor !== 'rgb(0, 0, 0)') continue;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.9 || r.height < vh * 0.8) continue;
      if (el.dataset.wbSplash) continue;

      el.dataset.wbSplash = '1';
      el.style.setProperty('background-color', '#f1f2f5', 'important');
      for (const svg of el.querySelectorAll('svg')) {
        svg.style.setProperty('display', 'none', 'important');
      }
      return;
    }
  }

  function fixCarouselArrows() {
    const rgb = (c) => {
      const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
      return m ? [+m[1], +m[2], +m[3]] : null;
    };
    const isLight = (c) => { const v = rgb(c); return !!v && v[0] > 225 && v[1] > 225 && v[2] > 225; };
    const isDark = (c) => { const v = rgb(c); return !!v && v[0] < 45 && v[1] < 45 && v[2] < 45; };

    for (const svg of document.querySelectorAll('button svg, [role="button"] svg')) {
      const fill = getComputedStyle(svg).fill;

      let p = svg.parentElement, bg = '', hasBg = false, depth = 0;
      while (p && p !== document.body && depth++ < 8) {
        const b = getComputedStyle(p).backgroundColor;
        if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') { bg = b; hasBg = true; break; }
        p = p.parentElement;
      }

      const isArrow = [...svg.querySelectorAll('path')].some((pa) =>
        ARROW_PATH_PREFIX.some((pre) => (pa.getAttribute('d') || '').startsWith(pre)));

      let want = null;
      if (isArrow) {
        want = (hasBg && isDark(bg)) ? '#ffffff' : '#0f1419';
      } else {
        if (!svg.dataset.wbOrig) svg.dataset.wbOrig = fill;
        const orig = svg.dataset.wbOrig;
        if (isLight(orig) && hasBg && isLight(bg)) want = '#0f1419';
        else if (isDark(orig) && hasBg && isDark(bg)) want = '#ffffff';
      }
      if (!want || svg.dataset.wbArrow === want) continue;

      svg.dataset.wbArrow = want;
      svg.style.setProperty('fill', want, 'important');
      svg.style.setProperty('color', want, 'important');
    }
  }

  const ARROW_PATH_PREFIX = ['M12.957 4.54', 'M7.414 13'];

  const PILL_TEXT = /^(posted|reposted|liked|replied|followed you|mentioned you|发表了|转发了|赞了|回复了|关注了你|提到了你|发布了)$/i;
  let lastPillScan = 0;

  function styleNotifPills() {
    const now = Date.now();
    if (now - lastPillScan < 800) return;
    lastPillScan = now;

    for (const el of document.querySelectorAll('span, div')) {
      if (el.children.length) continue;
      if (!PILL_TEXT.test(el.textContent.trim())) continue;

      let p = el, pill = null;
      for (let i = 0; i < 7 && p && p !== document.body; i++, p = p.parentElement) {
        const s = getComputedStyle(p);
        const r = p.getBoundingClientRect();
        const solid = s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)';
        if (solid && r.height >= 26 && r.height <= 76 && r.width >= 120) { pill = p; break; }
      }
      if (!pill || pill.dataset.wbPill) continue;
      pill.dataset.wbPill = '1';
      pill.style.setProperty('background-color', '#ffffff', 'important');
      pill.style.setProperty('box-shadow', '0 4px 16px rgba(0,0,0,.14)', 'important');
      for (const kid of pill.querySelectorAll('span, div')) {
        if (!kid.children.length) kid.style.setProperty('color', '#333333', 'important');
      }
    }
  }

  function goTo(path) {
    const a = document.createElement('a');
    a.href = path;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function removeTopBar() {
    document.getElementById('wb-topbar')?.remove();
  }

  /* ============================================================
   * 7. 右栏注入微博热搜榜
   * ============================================================ */
  const HOT_API = 'https://weibo.com/ajax/side/hotSearch';
  const BILI_SEARCH = 'https://search.bilibili.com/all?keyword=';
  const HOT_TTL = 5 * 60 * 1000;
  const HOT_KEY = 'wb-hotsearch-v1';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const HOT_FALLBACK = [
    '今天也要好好吃饭', '秋天的第一杯奶茶', '周末去哪儿玩', '城市马拉松今日开跑',
    '打工人早八生存指南', '猫咪的迷惑行为大赏', '新手做菜翻车现场', '这家食堂新菜上新了',
    '每天坚持早起一小时', '老电影重映值得一看',
  ].map((w) => ({ word: w, num: 0, label: '', color: C.orange }));

  function hotCacheRead() {
    try {
      const c = JSON.parse(sessionStorage.getItem(HOT_KEY) || 'null');
      if (c && Date.now() - c.t < HOT_TTL && Array.isArray(c.list) && c.list.length) {
        return c.list;
      }
    } catch (_) { }
    return null;
  }

  function hotCacheWrite(list) {
    try { sessionStorage.setItem(HOT_KEY, JSON.stringify({ t: Date.now(), list })); } catch (_) {}
  }

  function parseHot(txt) {
    let j;
    try { j = JSON.parse(txt); } catch (_) { return null; }
    const d = j && j.data;
    if (!d || !Array.isArray(d.realtime)) return null;

    const list = [];
    if (d.hotgov && d.hotgov.word) {
      list.push({
        word: d.hotgov.word,
        num: d.hotgov.num || 0,
        label: d.hotgov.label_name || d.hotgov.small_icon_desc || '',
        color: d.hotgov.small_icon_desc_color || C.orange,
      });
    }
    for (const it of d.realtime) {
      if (!it || !it.word) continue;
      list.push({
        word: it.word,
        num: it.num || 0,
        label: it.label_name || '',
        color: it.small_icon_desc_color || C.orange,
      });
      if (list.length >= 10) break;
    }
    return list.length ? list : null;
  }

  function loadHotSearch(cb, force) {
    if (!force) {
      const cached = hotCacheRead();
      if (cached) { cb(cached); return; }
    }
    if (typeof GM_xmlhttpRequest !== 'function') return;
    GM_xmlhttpRequest({
      method: 'GET',
      url: HOT_API,
      timeout: 8000,
      headers: { Referer: 'https://weibo.com/' },
      onload(r) {
        const list = parseHot(r.responseText);
        if (list) { hotCacheWrite(list); cb(list); }
      },
      onerror() {}, ontimeout() {},
    });
  }

  function renderHotCard(list) {
    const rows = list.map((it, i) => {
      const no = i < 3 ? `<span class="wb-no hot">${i + 1}</span>`
                       : '<span class="wb-no dot">•</span>';
      const tag = it.label
        ? `<i class="wb-tag" style="background:${esc(it.color)}">${esc(it.label)}</i>` : '';
      const heat = it.num ? `<span class="wb-heat">${it.num}</span>` : '';
      return `<a class="wb-it" target="_blank" rel="noopener noreferrer" ` +
             `title="在哔哩哔哩搜索：${esc(it.word)}" ` +
             `href="${BILI_SEARCH + encodeURIComponent(it.word)}">` +
             `${no}<span class="wb-title">${esc(it.word)}</span>${tag}${heat}</a>`;
    }).join('');
    return `<div class="wb-hd"><b>微博热搜</b><span class="wb-refresh">点击刷新</span></div>${rows}`;
  }

  function swapHotCard(list) {
    const b = document.getElementById('wb-hotsearch');
    if (b) b.innerHTML = renderHotCard(list);
  }

  function injectHotSearch() {
    if (!state.on || !CFG.hotSearch) return;
    const col = document.querySelector('[data-testid="sidebarColumn"]');
    if (!col) return;

    let box = document.getElementById('wb-hotsearch');

    if (box && (!box.isConnected || box.offsetParent === null)) {
      box.remove();
      box = null;
    }
    if (box) return;

    box = document.createElement('div');
    box.id = 'wb-hotsearch';
    box.innerHTML = renderHotCard(HOT_FALLBACK);
    box.addEventListener('click', (e) => {
      if (!e.target.closest('.wb-refresh')) return;
      e.preventDefault();
      loadHotSearch(swapHotCard, true);
    });

    const firstCard = col.querySelector('section');
    const host = (firstCard && firstCard.parentElement) || col;
    try {
      if (firstCard) host.insertBefore(box, firstCard);
      else host.insertBefore(box, host.firstChild);
    } catch (_) {
      col.insertBefore(box, col.firstChild);
    }

    if (box.offsetParent === null) col.appendChild(box);

    loadHotSearch(swapHotCard);
  }

  /* ============================================================
   * 7.5 右栏只留微博该有的卡片
   * ============================================================ */
  const X_ONLY_CARD = /^(今日要闻|Today's News|热搜|What's happening|正在发生)$/i;

  function hideXOnlyCards() {
    if (!state.on || !CFG.weiboRightColumn) return;
    const col = document.querySelector('[data-testid="sidebarColumn"]');
    if (!col) return;
    const done = new Set();

    for (const el of col.querySelectorAll('h1, h2, h3, span, div')) {
      if (el.children.length) continue;
      if (!X_ONLY_CARD.test(el.textContent.trim())) continue;

      let card = el.closest('section');
      if (!card) {
        let p = el.parentElement;
        while (p && p !== col) {
          if (p.getAttribute && p.getAttribute('data-testid')) { card = p; break; }
          p = p.parentElement;
        }
      }
      if (!card || card === col || card.id === 'wb-hotsearch' || done.has(card)) continue;
      if (card.contains && card.contains(document.getElementById('wb-hotsearch'))) continue;
      done.add(card);
      card.style.display = 'none';
    }
  }

  /* ============================================================
   * 8. DOM 观察
   * ============================================================ */
  const pending = new Set();
  let rafId = 0;

  function flush() {
    rafId = 0;
    if (!state.on) { pending.clear(); return; }
    const nodes = [...pending];
    pending.clear();
    for (const n of nodes) {
      try {
        if (n.nodeType === 1) {
          if (n.id === 'wb-hotsearch' || n.id === 'wb-topbar') continue;
          translateTree(n);
        } else if (n.nodeType === 3) {
          rewriteTextNode(n);
        }
      } catch (_) { }
    }
    for (const step of [injectTopBar, syncAvatar, fixStickyHeaders, fixCarouselArrows, hideSplash,
                        styleNotifPills, injectHotSearch, hideXOnlyCards,
                        spoofTitle, spoofFavicon]) {
      try { step(); } catch (e) {
        if (!flush.__warned) flush.__warned = new Set();
        if (!flush.__warned.has(step.name)) {
          flush.__warned.add(step.name);
          console.warn('[微博皮肤] 步骤失败:', step.name, e && e.message);
        }
      }
    }
  }

  function schedule(node) {
    if (!state.on || !node) return;
    pending.add(node);
    if (pending.size > 500) pending.clear();
    if (!rafId) rafId = requestAnimationFrame(flush);
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') {
        for (const n of r.addedNodes) schedule(n);
      } else {
        schedule(r.target);
      }
    }
  });

  function start() {
    injectStyles();
    spoofTitle();
    spoofFavicon();
    injectTopBar();
    if (!document.body) return;
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ATTRS,
      characterData: true,
    });
    translateTree(document.body);
    injectHotSearch();
    flush();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  for (const m of ['pushState', 'replaceState']) {
    const orig = W.history[m];
    W.history[m] = function () {
      const r = orig.apply(this, arguments);
      setTimeout(flush, 60);
      setTimeout(flush, 400);
      return r;
    };
  }
  W.addEventListener('popstate', () => setTimeout(flush, 80));

  setInterval(() => {
    if (!state.on) return;
    try { flush(); } catch (_) { }
  }, 1500);

  /* ============================================================
   * 9. 热键
   * ============================================================ */
  function setSkin(on) {
    state.on = on;
    styleEl.disabled = !on;
    topStyleEl.disabled = !on || !state.topBar;
    if (on) {
      faviconEl = null;
      spoofTitle(); spoofFavicon(); injectTopBar(); injectHotSearch(); flush();
    } else {
      removeTopBar();
      document.getElementById('wb-hotsearch')?.remove();
      faviconEl?.remove();
      faviconEl = null;
    }
  }

  function setTopBar(on) {
    state.topBar = on;
    topStyleEl.disabled = !state.on || !on;
    if (on && state.on) injectTopBar(); else removeTopBar();
  }

  W.addEventListener('keydown', (e) => {
    if (!e.altKey || e.code !== 'KeyW') return;
    e.preventDefault();
    if (e.shiftKey) {
      setTopBar(!state.topBar);
      console.log('[微博皮肤] 顶栏', state.topBar ? '开' : '关');
    } else {
      setSkin(!state.on);
      console.log('[微博皮肤]', state.on ? '已开启' : '已关闭（X 原版）');
    }
  }, true);

  /* ============================================================
   * 10. 自检工具
   * ============================================================ */
  W.__wbMissing = function () {
    const hits = new Map();
    const looksUI = (s) =>
      /^[A-Za-z][A-Za-z0-9 ,.'’!?@#&%()\-/:+]{1,60}$/.test(s) && /[A-Za-z]{2}/.test(s);

    for (const el of document.querySelectorAll(SCOPE_FULL)) {
      if (el.closest('#wb-hotsearch,#wb-topbar')) continue;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3) continue;
        const s = n.nodeValue.trim();
        if (!s || !looksUI(s)) continue;
        if (applyExact(s) || applyPhrases(s) || applyTime(s)) continue;
        hits.set(s, (hits.get(s) || 0) + 1);
      }
      for (const a of ATTRS) {
        const v = el.getAttribute && el.getAttribute(a);
        if (!v || !looksUI(v)) continue;
        if (applyExact(v) || applyPhrases(v)) continue;
        hits.set(a + '="' + v + '"', (hits.get(a + '="' + v + '"') || 0) + 1);
      }
    }

    const rows = [...hits.entries()].sort((a, b) => b[1] - a[1]);
    if (!rows.length) { console.log('%c[微博皮肤] 界面骨架已全部汉化 ✓', 'color:#ff8200'); return; }
    console.log(`%c[微博皮肤] 待汉化 ${rows.length} 条`, 'color:#ff8200;font-weight:700');
    console.table(rows.map(([s, n]) => ({ 原文: s, 出现次数: n })));
    return rows;
  };

  W.__wbCarousel = function () {
    const cands = new Set();
    const add = (sel) => { try { for (const el of document.querySelectorAll(sel)) cands.add(el); } catch (_) {} };
    add('[data-testid*="carousel" i]');
    add('[data-testid*="swipe" i]');
    add('button[aria-label*="image" i]');
    add('[role="button"][aria-label*="image" i]');
    add('button[aria-label*="slide" i]');
    add('[role="button"][aria-label*="slide" i]');
    for (const photo of document.querySelectorAll('[data-testid="tweetPhoto"]')) {
      const wrap = photo.parentElement;
      if (!wrap) continue;
      for (const b of wrap.querySelectorAll('button,[role="button"]')) cands.add(b);
    }
    for (const b of document.querySelectorAll('button,[role="button"]')) {
      const r = b.getBoundingClientRect();
      if (r.width < 18 || r.width > 76) continue;
      if (Math.abs(r.width - r.height) > 10) continue;
      if (getComputedStyle(b).position !== 'absolute') continue;
      if (!b.querySelector('svg,img')) continue;
      cands.add(b);
    }
    [...cands].forEach((el) => {
      el.style.setProperty('outline', '2px solid red', 'important');
      el.style.setProperty('outline-offset', '2px', 'important');
    });

    const rows = [...cands].map((el) => {
      const s = getComputedStyle(el);
      const svg = el.querySelector('svg');
      const inner = el.querySelector('div,span');
      const is = inner ? getComputedStyle(inner) : null;
      const r = el.getBoundingClientRect();
      return {
        testid: el.getAttribute('data-testid') || '',
        label: el.getAttribute('aria-label') || '',
        cls: String(el.className).slice(0, 30),
        尺寸: Math.round(r.width) + 'x' + Math.round(r.height),
        自色: s.color,
        自底: s.backgroundColor,
        自边框: s.borderTopWidth + ' ' + s.borderTopColor,
        内容: el.querySelectorAll('svg').length + 'svg/' +
              el.querySelectorAll('img').length + 'img',
        内层边框: is ? is.borderTopWidth + ' ' + is.borderTopColor : '',
        svg色: svg ? getComputedStyle(svg).color : '-',
        svg填充: svg ? getComputedStyle(svg).fill : '-',
        svg滤镜: svg ? getComputedStyle(svg).filter : '-',
      };
    });

    console.log('%c[微博皮肤] 轮播候选 ' + rows.length + ' 个 —— 屏幕上已用【红框】标出',
      'color:#ff8200;font-weight:700');
    if (!rows.length) {
      console.log('一个候选都没找到。那就直接右键那个白圆框 → 检查，看它到底是什么标签。');
      return rows;
    }
    console.table(rows);
    console.log(cands.size + ' 个候选的 outerHTML ↓（右键本行 → Copy string contents）');
    console.log([...cands].map((el, i) => '### ' + i + ' ### ' + el.outerHTML).join('  ||  '));
    return rows;
  };

  W.__wbHeader = function () {
    const col = document.querySelector('[data-testid="primaryColumn"]');
    if (!col) { console.log('[微博皮肤] 页面上没有 primaryColumn'); return []; }
    const rows = [];
    (function scan(root, depth, path) {
      for (const el of root.children) {
        const s = getComputedStyle(el);
        if (s.position === 'sticky' || s.position === 'fixed') {
          let sc = el.parentElement, scrollBox = 'window';
          while (sc && sc !== document.body && sc !== document.documentElement) {
            const oy = getComputedStyle(sc).overflowY;
            if (oy === 'auto' || oy === 'scroll') {
              scrollBox = sc.tagName + '.' + String(sc.className).slice(0, 28);
              break;
            }
            sc = sc.parentElement;
          }
          rows.push({
            路径: path, position: s.position, top: s.top,
            滚动容器: scrollBox,
            testid: el.getAttribute('data-testid') || '',
            cls: String(el.className).slice(0, 36),
          });
        }
        if (depth > 0) scan(el, depth - 1, path + '>' + el.tagName);
      }
    })(col, 3, 'primaryColumn');
    console.log('%c[微博皮肤] 中栏 sticky/fixed 元素 ' + rows.length + ' 个', 'color:#ff8200;font-weight:700');
    console.table(rows);
    return rows;
  };

  W.__wbHot = function () {
    const col = document.querySelector('[data-testid="sidebarColumn"]');
    const box = document.getElementById('wb-hotsearch');
    const info = {
      有sidebarColumn: !!col,
      里面section数: col ? col.querySelectorAll('section').length : 0,
      热搜卡存在: !!box,
      热搜卡display: box ? getComputedStyle(box).display : '-',
      条目数: box ? box.querySelectorAll('.wb-it').length : 0,
      GM_xmlhttpRequest: typeof GM_xmlhttpRequest,
      有缓存: (() => { try { return !!sessionStorage.getItem(HOT_KEY); } catch (_) { return 'n/a'; } })(),
      当前URL: location.pathname,
    };
    console.log('%c[微博皮肤] 热搜诊断', 'color:#ff8200;font-weight:700');
    console.table([info]);
    if (box) {
      const chain = [];
      let p = box.parentElement;
      while (p && p !== document.documentElement) {
        chain.push({
          层级: chain.length,
          标签: p.tagName,
          testid: p.getAttribute('data-testid') || '',
          computed显示: getComputedStyle(p).display,
          内联样式: p.getAttribute('style') || '',
          cls: String(p.className).slice(0, 30),
        });
        p = p.parentElement;
      }
      console.log('祖先链（看哪一层 computed显示 = none）:');
      console.table(chain);
    } else {
      console.log('卡压根没注入 —— 那问题在 injectHotSearch()，看上面那张表。');
    }
    return info;
  };

  console.log('%c微博皮肤 4.8.1 %c已加载 · Alt+W 总开关 · Alt+Shift+W 顶栏 · __wbMissing() 查汉化缺口',
    'background:#ff8200;color:#fff;padding:2px 6px;border-radius:3px',
    'color:#888;margin-left:6px');
})();
