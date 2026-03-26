/**
 * ST 创意工坊酒馆助手脚本桥接
 *
 * 运行方式：
 * 1. 运行在酒馆助手脚本 iframe 中
 * 2. 通过父页面 DOM 注入右上角悬浮圆球与工坊浮层
 * 3. 用 postMessage 与创意工坊前端握手，并桥接 TavernHelper 能力
 */

const WS_BRIDGE_KEY = '__stCreativeWorkshopScriptBridge__';
const WS_FLOAT_BUTTON_ID = 'stcw-script-float-button';
const WS_OVERLAY_ID = 'stcw-script-overlay';
const WS_MODAL_ID = 'stcw-script-modal';
const WS_IFRAME_ID = 'stcw-script-iframe';
const WS_STATUS_ID = 'stcw-script-status';
const WS_STYLE_ID = 'stcw-script-style';
const WS_WORKSHOP_BASE_URL = 'https://st.alyce.uno/';
const WS_DEFAULT_WORKSHOP_SLUG = '';
const WS_CACHE_BUST_PARAM = '_stcw';
const WS_TITLE = 'ST创意工坊';

const hostWindow = window.parent && window.parent !== window ? window.parent : window;
const hostDocument = hostWindow.document;
const bridgeState = hostWindow[WS_BRIDGE_KEY] || {
  initialized: false,
  connected: false,
  overlayVisible: false,
  buttonVisible: false,
  workshopWindow: null,
  handshakeTimer: null,
  handshakeAttempts: 0,
  initTimer: null,
  oauthCleanup: null,
  cacheBustToken: null,
};

hostWindow[WS_BRIDGE_KEY] = bridgeState;

function wsGetStoredUrl() {
  const baseUrl = WS_WORKSHOP_BASE_URL;
  const workshopSlug = (WS_DEFAULT_WORKSHOP_SLUG || '').trim();

  if (!workshopSlug) {
    return baseUrl;
  }

  try {
    const url = new URL('workshop', baseUrl);
    url.searchParams.set('workshop', workshopSlug);
    return url.toString();
  } catch (err) {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${normalizedBase}workshop?workshop=${encodeURIComponent(workshopSlug)}`;
  }
}

function wsNormalizeUrl(url) {
  const finalUrl = (url || '').trim();
  if (!finalUrl) return wsGetStoredUrl();

  try {
    return new URL(finalUrl, hostWindow.location.href).toString();
  } catch (err) {
    return finalUrl;
  }
}

function wsGetWorkshopUrl() {
  return wsNormalizeUrl(wsGetStoredUrl());
}

function wsGetCacheBustToken() {
  if (!bridgeState.cacheBustToken) {
    bridgeState.cacheBustToken = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  return bridgeState.cacheBustToken;
}

function wsBuildIframeUrl() {
  const baseUrl = wsGetWorkshopUrl();
  const cacheBustToken = wsGetCacheBustToken();

  try {
    const url = new URL(baseUrl, hostWindow.location.href);
    url.searchParams.set(WS_CACHE_BUST_PARAM, cacheBustToken);
    return url.toString();
  } catch (err) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${WS_CACHE_BUST_PARAM}=${encodeURIComponent(cacheBustToken)}`;
  }
}

function wsSetWorkshopUrl(url) {
  const normalized = wsNormalizeUrl(url);
  return normalized;
}

function wsGetWorkshopOrigin() {
  try {
    return new URL(wsGetWorkshopUrl()).origin;
  } catch (err) {
    return '';
  }
}

function wsGetOverlayElement() {
  return hostDocument.getElementById(WS_OVERLAY_ID);
}

function wsGetIframeElement() {
  return hostDocument.getElementById(WS_IFRAME_ID);
}

function wsGetCurrentIframeWindow() {
  const iframe = wsGetIframeElement();
  return iframe ? iframe.contentWindow : null;
}

function wsToast(type, message, title) {
  const safeTitle = title || WS_TITLE;
  if (hostWindow.toastr && typeof hostWindow.toastr[type] === 'function') {
    hostWindow.toastr[type](message, safeTitle);
    return;
  }

  const prefix = `[${safeTitle}]`;
  if (type === 'error') {
    console.error(prefix, message);
  } else if (type === 'warning') {
    console.warn(prefix, message);
  } else {
    console.log(prefix, message);
  }
}

function wsGetTavernHelper() {
  if (hostWindow.TavernHelper) return hostWindow.TavernHelper;
  if (window.TavernHelper) return window.TavernHelper;
  if (typeof TavernHelper !== 'undefined') return TavernHelper;
  return null;
}

function wsEnsureApi(methods) {
  const helper = wsGetTavernHelper();
  if (!helper) {
    throw new Error('未检测到 TavernHelper，请先安装并启用酒馆助手');
  }

  for (const method of methods) {
    if (typeof helper[method] !== 'function') {
      throw new Error(`酒馆助手缺少 ${method} 接口`);
    }
  }

  return helper;
}

function wsGetCharacterInfo() {
  let chId = hostWindow.this_chid;
  let characters = hostWindow.characters;

  if ((chId === undefined || !characters) && hostWindow.SillyTavern && typeof hostWindow.SillyTavern.getContext === 'function') {
    try {
      const context = hostWindow.SillyTavern.getContext();
      if (chId === undefined) chId = context.characterId;
      if (!characters) characters = context.characters;
    } catch (err) {
      console.warn('[ST创意工坊脚本] 读取 SillyTavern 上下文失败:', err);
    }
  }

  if ((chId === undefined || !characters) && typeof getContext === 'function') {
    try {
      const context = getContext();
      if (chId === undefined) chId = context.characterId;
      if (!characters) characters = context.characters;
    } catch (err) {
      console.warn('[ST创意工坊脚本] 读取脚本上下文失败:', err);
    }
  }

  const hasCharacter = !!(chId !== undefined && chId !== null && characters && characters[chId]);
  return { hasCharacter, chId, characters };
}

function wsEnsureStyle() {
  if (hostDocument.getElementById(WS_STYLE_ID)) return;

  const style = hostDocument.createElement('style');
  style.id = WS_STYLE_ID;
  style.textContent = `
    #${WS_FLOAT_BUTTON_ID} {
      position: fixed;
      top: 18px;
      right: 18px;
      width: 60px;
      height: 60px;
      border: 2px solid #ea580c;
      border-radius: 999px;
      background: linear-gradient(135deg, #fb923c 0%, #f97316 55%, #ea580c 100%);
      box-shadow: 0 12px 28px rgba(249, 115, 22, 0.28), 3px 3px 0 #9a3412;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483640;
      transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
    }

    #${WS_FLOAT_BUTTON_ID}:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow: 0 16px 34px rgba(249, 115, 22, 0.34), 3px 3px 0 #9a3412;
    }

    #${WS_FLOAT_BUTTON_ID}:active {
      transform: translateY(1px) scale(0.98);
    }

    #${WS_FLOAT_BUTTON_ID} .stcw-ball-core {
      width: 42px;
      height: 42px;
      border-radius: 999px;
      border: 2px dashed rgba(255, 255, 255, 0.8);
      background: rgba(255, 255, 255, 0.18);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      backdrop-filter: blur(2px);
    }

    #${WS_FLOAT_BUTTON_ID} .stcw-ball-status {
      position: absolute;
      right: 1px;
      bottom: 1px;
      width: 11px;
      height: 11px;
      border-radius: 999px;
      border: 2px solid #fff7ed;
      background: #fbbf24;
      box-shadow: 0 0 0 1px rgba(154, 52, 18, 0.4);
      transition: background-color 0.18s ease, transform 0.18s ease;
    }

    #${WS_FLOAT_BUTTON_ID}[data-connected="true"] .stcw-ball-status {
      background: #22c55e;
      transform: scale(1.05);
    }

    #${WS_OVERLAY_ID} {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(15, 23, 42, 0.48);
      backdrop-filter: blur(4px);
      z-index: 2147483639;
      padding: 18px;
      box-sizing: border-box;
    }

    #${WS_OVERLAY_ID}[data-open="true"] {
      display: flex;
    }

    #${WS_MODAL_ID} {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 960px;
      height: 700px;
      max-width: 95vw;
      max-height: 90vh;
      margin: auto;
      border-radius: 12px;
      overflow: hidden;
      border: 2px solid #fdba74;
      background: #fff7ed;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28), 4px 4px 0 #9a3412;
    }

    .stcw-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      background:
        radial-gradient(circle at top left, rgba(254, 215, 170, 0.9), rgba(255, 247, 237, 0.8) 60%),
        linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
      border-bottom: 2px dashed #fb923c;
      font-family: 'Nunito', sans-serif;
    }

    .stcw-modal-title-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .stcw-modal-title-icon {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      box-shadow: 3px 3px 0 #9a3412;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .stcw-modal-title-text {
      min-width: 0;
    }

    .stcw-modal-title-text strong {
      display: block;
      font-size: 18px;
      color: #7c2d12;
      font-family: 'Fredoka', 'Nunito', sans-serif;
    }

    .stcw-modal-title-text span {
      display: block;
      margin-top: 2px;
      font-size: 12px;
      color: #9a3412;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stcw-modal-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }

    .stcw-modal-action {
      height: 38px;
      min-width: 38px;
      padding: 0 12px;
      border: 2px solid #fdba74;
      border-radius: 999px;
      background: #fff;
      color: #7c2d12;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
      box-shadow: 2px 2px 0 #fed7aa;
      font-size: 13px;
      font-family: 'Nunito', sans-serif;
      transition: transform 0.18s ease, background-color 0.18s ease;
    }

    .stcw-modal-action:hover {
      transform: translateY(-1px);
      background: #fff7ed;
    }

    .stcw-modal-action[data-kind="close"] {
      border-color: #f97316;
      background: #f97316;
      color: #fff;
      box-shadow: 2px 2px 0 #9a3412;
    }

    #${WS_IFRAME_ID} {
      width: 100%;
      flex: 1;
      border: none;
      background: #fff;
    }

    @media (max-width: 720px) {
      #${WS_FLOAT_BUTTON_ID} {
        top: 12px;
        right: 12px;
        width: 54px;
        height: 54px;
      }

      #${WS_MODAL_ID} {
        border-radius: 20px;
      }

      .stcw-modal-header {
        padding: 12px;
      }

      .stcw-modal-title-text span {
        max-width: 180px;
      }
    }
  `;

  hostDocument.head.appendChild(style);
}

function wsIcon(name, size, stroke) {
  const iconSize = size || 20;
  const color = stroke || 'currentColor';
  const attrs = `width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"`;

  if (name === 'store') {
    return `<svg ${attrs}><path d="M4 10.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 10.5L5 5h14l2 5.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 10.5c0 1.38 1.12 2.5 2.5 2.5S8 11.88 8 10.5c0 1.38 1.12 2.5 2.5 2.5S13 11.88 13 10.5c0 1.38 1.12 2.5 2.5 2.5S18 11.88 18 10.5c0 1.38 1.12 2.5 2.5 2.5S23 11.88 23 10.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  if (name === 'open') {
    return `<svg ${attrs}><path d="M14 5h5v5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 14 19 5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  if (name === 'settings') {
    return `<svg ${attrs}><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" stroke="${color}" stroke-width="1.8"/><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 0 1 0 1.7l-.2.2a1.2 1.2 0 0 1-1.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V19a1.2 1.2 0 0 1-1.2 1.2h-.3a1.2 1.2 0 0 1-1.2-1.2v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 0 1-1.7 0l-.2-.2a1.2 1.2 0 0 1 0-1.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H5a1.2 1.2 0 0 1-1.2-1.2v-.3A1.2 1.2 0 0 1 5 12h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.2 1.2 0 0 1 0-1.7l.2-.2a1.2 1.2 0 0 1 1.7 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V5A1.2 1.2 0 0 1 10.7 3.8h.3A1.2 1.2 0 0 1 12.2 5v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 0 1 1.7 0l.2.2a1.2 1.2 0 0 1 0 1.7l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H19a1.2 1.2 0 0 1 1.2 1.2v.3A1.2 1.2 0 0 1 19 15h-.2a1 1 0 0 0-.9.6Z" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  return `<svg ${attrs}><path d="M6 6L18 18M18 6L6 18" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

function wsUpdateButtonState() {
  const button = hostDocument.getElementById(WS_FLOAT_BUTTON_ID);
  const status = hostDocument.getElementById(WS_STATUS_ID);
  if (!button || !status) return;

  button.setAttribute('data-connected', bridgeState.connected ? 'true' : 'false');
  status.setAttribute('title', bridgeState.connected ? '已连接创意工坊' : '等待连接创意工坊');
}

function wsEnsureFloatingButton() {
  wsEnsureStyle();

  let button = hostDocument.getElementById(WS_FLOAT_BUTTON_ID);
  if (!button) {
    button = hostDocument.createElement('button');
    button.id = WS_FLOAT_BUTTON_ID;
    button.type = 'button';
    button.title = '打开创意工坊';
    button.innerHTML = `
      <span class="stcw-ball-core">
        ${wsIcon('store', 20, '#ffffff')}
        <span id="${WS_STATUS_ID}" class="stcw-ball-status"></span>
      </span>
    `;

    button.addEventListener('click', () => {
      wsOpenWorkshop();
    });

    hostDocument.body.appendChild(button);
  }

  bridgeState.buttonVisible = true;
  wsUpdateButtonState();
}

function wsEnsureOverlay() {
  wsEnsureStyle();

  let overlay = hostDocument.getElementById(WS_OVERLAY_ID);
  if (overlay) return overlay;

  overlay = hostDocument.createElement('div');
  overlay.id = WS_OVERLAY_ID;
  overlay.setAttribute('data-open', 'false');
  overlay.innerHTML = `
    <div id="${WS_MODAL_ID}">
      <div class="stcw-modal-header">
        <div class="stcw-modal-title-wrap">
          <div class="stcw-modal-title-icon">${wsIcon('store', 22, '#ffffff')}</div>
          <div class="stcw-modal-title-text">
            <strong>${WS_TITLE}</strong>
            <span>已固定在酒馆中央，可直接登录并同步世界书</span>
          </div>
        </div>
        <div class="stcw-modal-actions">
          <button class="stcw-modal-action" type="button" data-kind="close" data-action="close">
            ${wsIcon('close', 16, 'currentColor')}
            <span>关闭</span>
          </button>
        </div>
      </div>
      <iframe id="${WS_IFRAME_ID}" allow="clipboard-read; clipboard-write"></iframe>
    </div>
  `;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      wsCloseWorkshop();
    }
  });

  overlay.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;

    const action = actionButton.getAttribute('data-action');
    if (action === 'close') {
      wsCloseWorkshop();
    }
  });

  const iframe = overlay.querySelector(`#${WS_IFRAME_ID}`);
  iframe.addEventListener('load', () => {
    bridgeState.workshopWindow = iframe.contentWindow;
    bridgeState.connected = false;
    wsUpdateButtonState();
    wsRefreshOverlayUrl();
    console.log('[ST创意工坊脚本] 工坊 iframe 已加载，开始握手:', {
      url: iframe.getAttribute('src') || '',
      sameAsWindow: bridgeState.workshopWindow === window,
      sameAsParent: bridgeState.workshopWindow === hostWindow,
    });
    wsStartHandshake();
  });

  hostDocument.body.appendChild(overlay);
  return overlay;
}

function wsRefreshOverlayUrl() {
  const overlay = wsEnsureOverlay();
  const titleLine = overlay.querySelector('.stcw-modal-title-text span');
  if (titleLine) {
    titleLine.textContent = bridgeState.connected
      ? '已连接酒馆，可直接同步世界书'
      : '已固定在酒馆中央，等待工坊完成握手';
  }
}

function wsSetIframeUrl(forceReload) {
  const overlay = wsEnsureOverlay();
  const iframe = overlay.querySelector(`#${WS_IFRAME_ID}`);
  const targetUrl = wsBuildIframeUrl();
  const currentUrl = iframe.getAttribute('src') || '';

  if (forceReload || !currentUrl || currentUrl !== targetUrl) {
    iframe.setAttribute('src', targetUrl);
  }
}

function wsOpenWorkshop(forceReload) {
  wsEnsureFloatingButton();
  wsRefreshOverlayUrl();
  const overlay = wsEnsureOverlay();
  overlay.setAttribute('data-open', 'true');
  bridgeState.overlayVisible = true;
  console.log('[ST创意工坊脚本] 打开工坊浮层:', {
    forceReload: !!forceReload,
    url: wsGetWorkshopUrl(),
  });
  wsSetIframeUrl(!!forceReload);
}

function wsCloseWorkshop() {
  const overlay = wsGetOverlayElement();
  if (!overlay) return;

  overlay.setAttribute('data-open', 'false');
  bridgeState.overlayVisible = false;
}

function wsStopHandshake() {
  if (bridgeState.handshakeTimer) {
    console.log('[ST创意工坊脚本] 停止握手轮询');
    hostWindow.clearInterval(bridgeState.handshakeTimer);
    bridgeState.handshakeTimer = null;
  }
  bridgeState.handshakeAttempts = 0;
}

function wsPostToWorkshop(type, payload) {
  if (!bridgeState.workshopWindow) return;
  bridgeState.workshopWindow.postMessage({ type, ...payload }, '*');
}

function wsStartHandshake() {
  wsStopHandshake();

  if (!bridgeState.workshopWindow) return;

  console.log('[ST创意工坊脚本] 开始发送 st_extension_opener');
  bridgeState.handshakeAttempts = 0;
  bridgeState.handshakeTimer = hostWindow.setInterval(() => {
    if (!bridgeState.workshopWindow) {
      wsStopHandshake();
      return;
    }

    try {
      bridgeState.workshopWindow.postMessage(
        {
          type: 'st_extension_opener',
          source: 'st_workshop_extension',
        },
        '*',
      );

      bridgeState.handshakeAttempts += 1;
      console.log(`[ST创意工坊脚本] 发送 st_extension_opener (${bridgeState.handshakeAttempts}/40)`);
      if (bridgeState.handshakeAttempts >= 40) {
        wsStopHandshake();
      }
    } catch (err) {
      console.error('[ST创意工坊脚本] 握手消息发送失败:', err);
      wsStopHandshake();
    }
  }, 500);
}

function wsSendResult(type, payload) {
  if (!bridgeState.workshopWindow) return;
  console.log('[ST创意工坊脚本] 回发消息到工坊:', {
    type,
    payload,
  });
  bridgeState.workshopWindow.postMessage({ type, ...payload }, '*');
}

function wsToRegexEntry(entry, packId, scope) {
  const extraData = entry.extra_data || {};

  return {
    id: `st_workshop_${packId}_${entry.id}`,
    script_name: entry.name || '',
    enabled: !!entry.enabled,
    run_on_edit: !!extraData.run_on_edit,
    scope: scope || extraData.regex_scope || 'global',
    find_regex: extraData.find_regex || '',
    replace_string: entry.content || '',
    source: extraData.source || {
      user_input: true,
      ai_output: true,
      slash_command: true,
      world_info: false,
    },
    destination: extraData.destination || {
      display: true,
      prompt: false,
    },
    min_depth: extraData.min_depth || null,
    max_depth: extraData.max_depth || null,
  };
}

function wsRemoveGreetingMarkers(packId, entryIds, greetings) {
  if (!Array.isArray(greetings)) return [];

  return greetings.filter((greeting) => {
    for (const entryId of entryIds) {
      if (typeof greeting === 'string' && greeting.includes(`<!--st_workshop_${packId}_${entryId}-->`)) {
        return false;
      }
    }
    return true;
  });
}

function wsSaveCharacterChanges(chId) {
  if (typeof hostWindow.saveCharacterDebounced === 'function') {
    hostWindow.saveCharacterDebounced();
  } else if (typeof hostWindow.saveMetadata === 'function') {
    hostWindow.saveMetadata();
  }

  if (hostWindow.eventSource && typeof hostWindow.eventSource.emit === 'function') {
    hostWindow.eventSource.emit('characterEdited', chId);
  }
}

function wsRemovePackRegexes(regexes, packId, entryIds) {
  return regexes.filter((regex) => {
    if (!regex.id || !String(regex.id).startsWith(`st_workshop_${packId}_`)) {
      return true;
    }

    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      return false;
    }

    const entryId = Number(String(regex.id).split('_').pop());
    return !entryIds.includes(entryId);
  });
}

function wsHandleCheckCharacter() {
  const { hasCharacter } = wsGetCharacterInfo();
  wsSendResult('workshop_check_character_result', {
    success: true,
    hasCharacter,
  });
}

async function wsHandleGetWorldbookList() {
  try {
    if (!window.TavernHelper || typeof window.TavernHelper.getWorldbookNames !== 'function') {
      throw new Error('世界书 API 不可用');
    }

    const allNames = await window.TavernHelper.getWorldbookNames();
    wsSendResult('workshop_get_worldbook_list_result', {
      success: true,
      worldbooks: allNames,
    });
  } catch (err) {
    console.error('[ST创意工坊] 获取世界书列表失败:', err);
    wsSendResult('workshop_get_worldbook_list_result', { success: false, message: err.message });
  }
}

async function wsHandleGetCurrentWorldbooks(payload) {
  try {
    if (!window.TavernHelper || typeof window.TavernHelper.getCharWorldbookNames !== 'function') {
      throw new Error('世界书 API 不可用');
    }

    let primary = null;
    let additional = [];

    const result = window.TavernHelper.getCharWorldbookNames('current');
    primary = result.primary || null;
    additional = result.additional || [];
    
    wsSendResult('workshop_get_current_worldbooks_result', {
      success: true,
      primary,
      additional,
    });
  } catch (err) {
    console.error('[ST创意工坊] 获取当前角色世界书失败:', err);
    wsSendResult('workshop_get_current_worldbooks_result', {
      success: false,
      message: err.message,
    });
  }
}

async function wsHandleGetWorldbookEntries(payload) {
  const { worldbookName } = payload;
  if (!worldbookName) {
    wsSendResult('workshop_get_worldbook_entries_result', { success: false, message: '缺少世界书名称' });
    return;
  }

  try {
    if (!window.TavernHelper || 
        typeof window.TavernHelper.getWorldbookNames !== 'function' || 
        typeof window.TavernHelper.getWorldbook !== 'function') {
      throw new Error('世界书 API 不可用');
    }

    const allNames = await window.TavernHelper.getWorldbookNames();
    
    if (!allNames.includes(worldbookName)) {
      wsSendResult('workshop_get_worldbook_entries_result', {
        success: true,
        worldbookName,
        entries: [],
        exists: false,
      });
      return;
    }

    const entries = await window.TavernHelper.getWorldbook(worldbookName);
    
    wsSendResult('workshop_get_worldbook_entries_result', {
      success: true,
      worldbookName,
      entries,
      exists: true,
    });
  } catch (err) {
    console.error(`[ST创意工坊] 映射世界书「${worldbookName}」失败:`, err);
    wsSendResult('workshop_get_worldbook_entries_result', {
      success: false,
      worldbookName,
      message: err.message,
    });
  }
}

async function wsHandleOpenOAuth(payload) {
  const authUrl = payload && payload.authUrl;
  console.log('[ST创意工坊脚本] 收到 OAuth 打开请求:', {
    hasAuthUrl: !!authUrl,
    authUrl: authUrl || '',
  });
  if (!authUrl) {
    wsSendResult('workshop_oauth_result', {
      success: false,
      message: '缺少登录地址',
    });
    return;
  }

  const popupWidth = 500;
  const popupHeight = 700;
  const popupLeft = Math.max(0, (hostWindow.screen.width - popupWidth) / 2);
  const popupTop = Math.max(0, (hostWindow.screen.height - popupHeight) / 2);

  const popup = hostWindow.open(
    authUrl,
    'STCreativeWorkshopOAuth',
    `width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},resizable=yes,scrollbars=yes`,
  );

  if (!popup) {
    wsToast('error', '无法打开登录窗口，请检查浏览器弹窗设置');
    wsSendResult('workshop_oauth_result', {
      success: false,
      message: '无法打开登录窗口',
    });
    return;
  }

  console.log('[ST创意工坊脚本] 已打开 OAuth 弹窗');

  if (bridgeState.oauthCleanup) {
    bridgeState.oauthCleanup();
    bridgeState.oauthCleanup = null;
  }

  let finished = false;
  const finish = (success, message) => {
    if (finished) {
      return;
    }
    finished = true;

    if (bridgeState.oauthCleanup) {
      bridgeState.oauthCleanup();
      bridgeState.oauthCleanup = null;
    }

    try {
      popup.close();
    } catch (err) {
      console.warn('[ST创意工坊脚本] 关闭 OAuth 弹窗失败:', err);
    }

    wsSendResult('workshop_oauth_result', {
      success,
      message,
    });
  };

  const onMessage = (event) => {
    const data = event.data || {};
    console.log('[ST创意工坊脚本] OAuth 弹窗消息:', {
      type: data.type,
      sameSource: event.source === popup,
    });
    if (event.source === popup && data.type === 'oauth_login_complete') {
      finish(true, data.success === false ? '登录流程已返回，请继续等待结果' : '登录成功');
    }
  };

  const pollTimer = hostWindow.setInterval(() => {
    try {
      if (popup.closed) {
        finish(true, '登录窗口已关闭，正在确认登录状态');
      }
    } catch (err) {
      finish(true, '登录窗口已关闭，正在确认登录状态');
    }
  }, 500);

  const timeoutTimer = hostWindow.setTimeout(() => {
    if (bridgeState.oauthCleanup) {
      bridgeState.oauthCleanup();
      bridgeState.oauthCleanup = null;
    }
  }, 60000);

  bridgeState.oauthCleanup = () => {
    hostWindow.removeEventListener('message', onMessage);
    hostWindow.clearInterval(pollTimer);
    hostWindow.clearTimeout(timeoutTimer);
  };

  hostWindow.addEventListener('message', onMessage);
}

async function wsHandleScan(payload) {
  const worldbookName = payload && payload.worldbookName;
  if (!worldbookName) {
    wsSendResult('workshop_scan_result', {
      success: false,
      packIds: [],
      entryCountMap: {},
      message: '缺少世界书名称',
    });
    return;
  }

  try {
    const helper = wsEnsureApi(['getWorldbookNames', 'getWorldbook']);
    const names = await helper.getWorldbookNames();
    if (!names.includes(worldbookName)) {
      wsSendResult('workshop_scan_result', {
        success: true,
        packIds: [],
        entryCountMap: {},
      });
      return;
    }

    const entries = await helper.getWorldbook(worldbookName);
    const entryCountMap = {};

    for (const entry of entries) {
      if (entry.extra && entry.extra.source === 'storyshare_workshop' && entry.extra.pack_id != null) {
        const packId = Number(entry.extra.pack_id);
        entryCountMap[packId] = (entryCountMap[packId] || 0) + 1;
      }
    }

    wsSendResult('workshop_scan_result', {
      success: true,
      packIds: Object.keys(entryCountMap).map(Number),
      entryCountMap,
    });
  } catch (err) {
    console.error('[ST创意工坊脚本] 扫描订阅模组失败:', err);
    wsSendResult('workshop_scan_result', {
      success: false,
      packIds: [],
      entryCountMap: {},
      message: err.message,
    });
  }
}

async function wsHandleSubscribe(payload) {
  const packId = payload && payload.packId;
  const packTitle = payload && payload.packTitle;
  const worldbookName = payload && payload.worldbookName;

  let worldbookEntries = payload && payload.worldbookEntries;
  let regexEntries = payload && payload.regexEntries;
  let greetingEntries = payload && payload.greetingEntries;

  if (!worldbookEntries || !regexEntries || !greetingEntries) {
    const entries = (payload && payload.entries) || [];
    worldbookEntries = [];
    regexEntries = [];
    greetingEntries = [];

    for (const entry of entries) {
      if (entry.type === 'regex') {
        regexEntries.push(entry);
      } else if (entry.type === 'greeting') {
        greetingEntries.push(entry);
      } else {
        worldbookEntries.push(entry);
      }
    }
  }

  if (packId == null || !worldbookName) {
    wsSendResult('workshop_subscribe_result', {
      success: false,
      message: '缺少必要参数',
    });
    return;
  }

  try {
    const helper = wsEnsureApi([
      'getWorldbookNames',
      'createWorldbook',
      'deleteWorldbookEntries',
      'createWorldbookEntries',
      'updateTavernRegexesWith',
    ]);

    const globalRegexEntries = [];
    const charRegexEntries = [];
    for (const entry of regexEntries || []) {
      if (entry.extra_data && entry.extra_data.regex_scope === 'character') {
        charRegexEntries.push(entry);
      } else {
        globalRegexEntries.push(entry);
      }
    }

    const hasCharacterContent = charRegexEntries.length > 0 || (greetingEntries || []).length > 0;
    const { hasCharacter, chId, characters } = wsGetCharacterInfo();

    if (hasCharacterContent && !hasCharacter) {
      wsSendResult('workshop_subscribe_result', {
        success: false,
        message: '该模组包含角色正则或开场白，请先进入角色卡后再订阅',
      });
      return;
    }

    const names = await helper.getWorldbookNames();
    if (!names.includes(worldbookName)) {
      await helper.createWorldbook(worldbookName);
    }

    await helper.deleteWorldbookEntries(
      worldbookName,
      (entry) => entry.extra && entry.extra.source === 'storyshare_workshop' && entry.extra.pack_id === packId,
      { render: 'debounced' },
    );

    let appliedCount = 0;

    if ((worldbookEntries || []).length > 0) {
      await helper.createWorldbookEntries(worldbookName, worldbookEntries, { render: 'immediate' });
      appliedCount += worldbookEntries.length;
    }

    if (globalRegexEntries.length > 0) {
      await helper.updateTavernRegexesWith((regexes) => {
        const filtered = wsRemovePackRegexes(regexes, packId);
        for (const entry of globalRegexEntries) {
          filtered.push(wsToRegexEntry(entry, packId, 'global'));
          appliedCount += 1;
        }
        return filtered;
      }, { scope: 'all' });
    }

    if (charRegexEntries.length > 0) {
      await helper.updateTavernRegexesWith((regexes) => {
        const filtered = wsRemovePackRegexes(regexes, packId);
        for (const entry of charRegexEntries) {
          filtered.push(wsToRegexEntry(entry, packId, 'character'));
          appliedCount += 1;
        }
        return filtered;
      }, { scope: 'character' });
    }

    if ((greetingEntries || []).length > 0 && hasCharacter) {
      const character = characters[chId];
      if (!Array.isArray(character.alternate_greetings)) {
        character.alternate_greetings = [];
      }

      character.alternate_greetings = character.alternate_greetings.filter((greeting) => {
        return !(typeof greeting === 'string' && greeting.includes(`<!--st_workshop_${packId}_`));
      });

      if (character.data && Array.isArray(character.data.alternate_greetings)) {
        character.data.alternate_greetings = character.data.alternate_greetings.filter((greeting) => {
          return !(typeof greeting === 'string' && greeting.includes(`<!--st_workshop_${packId}_`));
        });
      } else if (character.data) {
        character.data.alternate_greetings = [];
      }

      for (const entry of greetingEntries) {
        if (!entry.content) continue;
        const content = `${entry.content}\n<!--st_workshop_${packId}_${entry.id}-->`;
        character.alternate_greetings.push(content);
        if (character.data) {
          character.data.alternate_greetings.push(content);
        }
        appliedCount += 1;
      }

      wsSaveCharacterChanges(chId);
    }

    const successMessage = `已同步模组「${packTitle || packId}」，共写入 ${appliedCount} 条记录`;
    wsToast('success', successMessage);
    wsSendResult('workshop_subscribe_result', {
      success: true,
      message: successMessage,
    });
  } catch (err) {
    console.error('[ST创意工坊脚本] 订阅模组失败:', err);
    const message = `订阅失败：${err.message}`;
    wsToast('error', message);
    wsSendResult('workshop_subscribe_result', {
      success: false,
      message,
    });
  }
}

async function wsHandleUnsubscribe(payload) {
  const packId = payload && payload.packId;
  const worldbookName = payload && payload.worldbookName;
  const requestedCharacterCleanup = !!(payload && payload.hasCharacter);

  if (packId == null || !worldbookName) {
    wsSendResult('workshop_unsubscribe_result', {
      success: false,
      message: '缺少必要参数',
    });
    return;
  }

  try {
    const helper = wsEnsureApi([
      'getWorldbookNames',
      'deleteWorldbookEntries',
      'updateTavernRegexesWith',
    ]);

    const { hasCharacter, chId, characters } = wsGetCharacterInfo();
    const shouldDeleteCharacterContent = requestedCharacterCleanup && hasCharacter;
    let removedCount = 0;

    const names = await helper.getWorldbookNames();
    if (names.includes(worldbookName)) {
      const deletedResult = await helper.deleteWorldbookEntries(
        worldbookName,
        (entry) => entry.extra && entry.extra.source === 'storyshare_workshop' && entry.extra.pack_id === packId,
        { render: 'immediate' },
      );

      if (deletedResult && Array.isArray(deletedResult.deleted_entries)) {
        removedCount += deletedResult.deleted_entries.length;
      }
    }

    try {
      await helper.updateTavernRegexesWith((regexes) => {
        const beforeCount = regexes.length;
        const filtered = wsRemovePackRegexes(regexes, packId);
        removedCount += beforeCount - filtered.length;
        return filtered;
      }, { scope: 'all' });
    } catch (err) {
      console.warn('[ST创意工坊脚本] 删除全局正则失败:', err);
    }

    if (shouldDeleteCharacterContent) {
      try {
        await helper.updateTavernRegexesWith((regexes) => {
          const beforeCount = regexes.length;
          const filtered = wsRemovePackRegexes(regexes, packId);
          removedCount += beforeCount - filtered.length;
          return filtered;
        }, { scope: 'character' });
      } catch (err) {
        console.warn('[ST创意工坊脚本] 删除角色正则失败:', err);
      }

      const character = characters[chId];
      if (character) {
        if (Array.isArray(character.alternate_greetings)) {
          const beforeCount = character.alternate_greetings.length;
          character.alternate_greetings = character.alternate_greetings.filter((greeting) => {
            return !(typeof greeting === 'string' && greeting.includes(`<!--st_workshop_${packId}_`));
          });
          removedCount += beforeCount - character.alternate_greetings.length;
        }

        if (character.data && Array.isArray(character.data.alternate_greetings)) {
          character.data.alternate_greetings = character.data.alternate_greetings.filter((greeting) => {
            return !(typeof greeting === 'string' && greeting.includes(`<!--st_workshop_${packId}_`));
          });
        }

        wsSaveCharacterChanges(chId);
      }
    }

    const successMessage = `已取消订阅，清理了 ${removedCount} 条记录`;
    wsToast('success', successMessage);
    wsSendResult('workshop_unsubscribe_result', {
      success: true,
      message: successMessage,
    });
  } catch (err) {
    console.error('[ST创意工坊脚本] 取消订阅失败:', err);
    const message = `取消订阅失败：${err.message}`;
    wsToast('error', message);
    wsSendResult('workshop_unsubscribe_result', {
      success: false,
      message,
    });
  }
}

async function wsHandleSyncChanges(payload) {
  const packId = payload && payload.packId;
  const worldbookName = payload && payload.worldbookName;
  const changes = payload && payload.changes;

  if (packId == null || !worldbookName || !changes) {
    wsSendResult('workshop_sync_changes_result', {
      success: false,
      message: '缺少必要参数',
    });
    return;
  }

  try {
    const helper = wsEnsureApi([
      'getWorldbookNames',
      'createWorldbook',
      'deleteWorldbookEntries',
      'createWorldbookEntries',
      'updateTavernRegexesWith',
    ]);

    const names = await helper.getWorldbookNames();
    if (!names.includes(worldbookName)) {
      await helper.createWorldbook(worldbookName);
    }

    let appliedCount = 0;

    if (Array.isArray(changes.deleted) && changes.deleted.length > 0) {
      try {
        const deletedEntryIds = changes.deleted.map((entry) => entry.id);

        const deletedWorldbookEntries = await helper.deleteWorldbookEntries(
          worldbookName,
          (entry) => {
            return entry.extra
              && entry.extra.source === 'storyshare_workshop'
              && entry.extra.pack_id === packId
              && deletedEntryIds.includes(entry.extra.workshop_entry_id);
          },
          { render: 'debounced' },
        );

        if (deletedWorldbookEntries && Array.isArray(deletedWorldbookEntries.deleted_entries)) {
          appliedCount += deletedWorldbookEntries.deleted_entries.length;
        }

        const deletedRegexIds = changes.deleted
          .filter((entry) => entry.entry_type === 'regex')
          .map((entry) => entry.id);

        if (deletedRegexIds.length > 0) {
          await helper.updateTavernRegexesWith((regexes) => {
            const beforeCount = regexes.length;
            const filtered = wsRemovePackRegexes(regexes, packId, deletedRegexIds);
            appliedCount += beforeCount - filtered.length;
            return filtered;
          }, { scope: 'all' });

          await helper.updateTavernRegexesWith((regexes) => {
            const beforeCount = regexes.length;
            const filtered = wsRemovePackRegexes(regexes, packId, deletedRegexIds);
            appliedCount += beforeCount - filtered.length;
            return filtered;
          }, { scope: 'character' });
        }

        const deletedGreetingEntries = changes.deleted.filter((entry) => entry.entry_type === 'greeting');
        if (deletedGreetingEntries.length > 0) {
          const { hasCharacter, chId, characters } = wsGetCharacterInfo();
          if (hasCharacter) {
            const character = characters[chId];
            const deletedGreetingIds = deletedGreetingEntries.map((entry) => entry.id);

            if (Array.isArray(character.alternate_greetings)) {
              const beforeCount = character.alternate_greetings.length;
              character.alternate_greetings = wsRemoveGreetingMarkers(packId, deletedGreetingIds, character.alternate_greetings);
              appliedCount += beforeCount - character.alternate_greetings.length;
            }

            if (character.data && Array.isArray(character.data.alternate_greetings)) {
              character.data.alternate_greetings = wsRemoveGreetingMarkers(packId, deletedGreetingIds, character.data.alternate_greetings);
            }

            wsSaveCharacterChanges(chId);
          }
        }
      } catch (err) {
        console.error('[ST创意工坊脚本] 删除变更项失败:', err);
      }
    }

    const entriesToUpdate = [
      ...((Array.isArray(changes.new) ? changes.new : [])),
      ...((Array.isArray(changes.modified) ? changes.modified : [])),
    ];

    if (entriesToUpdate.length > 0) {
      const worldbookEntries = [];
      const regexEntries = [];
      const greetingEntries = [];

      for (const entry of entriesToUpdate) {
        if (entry.entry_type === 'regex') {
          regexEntries.push(entry);
        } else if (entry.entry_type === 'greeting') {
          greetingEntries.push(entry);
        } else {
          worldbookEntries.push(entry);
        }
      }

      try {
        if (worldbookEntries.length > 0) {
          const targetIds = worldbookEntries.map((entry) => entry.id);
          await helper.deleteWorldbookEntries(
            worldbookName,
            (entry) => {
              return entry.extra
                && entry.extra.source === 'storyshare_workshop'
                && entry.extra.pack_id === packId
                && targetIds.includes(entry.extra.workshop_entry_id);
            },
            { render: 'debounced' },
          );

          const stWorldbookEntries = worldbookEntries.map((entry) => ({
            type: 'worldbook',
            name: entry.name,
            enabled: !!entry.enabled,
            strategy: {
              type: entry.strategy_type || 'selective',
              keys: entry.keys || [],
              keys_secondary: {
                logic: entry.keys_secondary_logic || 'and_any',
                keys: entry.keys_secondary || [],
              },
              scan_depth: entry.scan_depth === 'same_as_global' || entry.scan_depth == null
                ? 'same_as_global'
                : Number(entry.scan_depth),
            },
            position: {
              type: entry.position_type || 'after_character_definition',
              role: entry.position_role || 'system',
              depth: entry.position_depth != null ? Number(entry.position_depth) : 4,
              order: entry.position_order != null ? Number(entry.position_order) : 100,
            },
            content: entry.content || '',
            probability: entry.probability != null ? Number(entry.probability) : 100,
            recursion: {
              prevent_incoming: !!entry.recursion_prevent_incoming,
              prevent_outgoing: !!entry.recursion_prevent_outgoing,
              delay_until: entry.recursion_delay_until != null ? Number(entry.recursion_delay_until) : null,
            },
            effect: {
              sticky: entry.effect_sticky != null ? Number(entry.effect_sticky) : null,
              cooldown: entry.effect_cooldown != null ? Number(entry.effect_cooldown) : null,
              delay: entry.effect_delay != null ? Number(entry.effect_delay) : null,
            },
            extra: {
              workshop_entry_id: entry.id,
              pack_id: packId,
              source: 'storyshare_workshop',
            },
          }));

          await helper.createWorldbookEntries(worldbookName, stWorldbookEntries, { render: 'immediate' });
          appliedCount += stWorldbookEntries.length;
        }

        if (regexEntries.length > 0) {
          const globalRegexEntries = [];
          const charRegexEntries = [];

          for (const entry of regexEntries) {
            if (entry.extra_data && entry.extra_data.regex_scope === 'character') {
              charRegexEntries.push(entry);
            } else {
              globalRegexEntries.push(entry);
            }
          }

          if (globalRegexEntries.length > 0) {
            const targetIds = globalRegexEntries.map((entry) => entry.id);
            await helper.updateTavernRegexesWith((regexes) => {
              const filtered = wsRemovePackRegexes(regexes, packId, targetIds);
              for (const entry of globalRegexEntries) {
                filtered.push(wsToRegexEntry(entry, packId, 'global'));
                appliedCount += 1;
              }
              return filtered;
            }, { scope: 'all' });
          }

          if (charRegexEntries.length > 0) {
            const targetIds = charRegexEntries.map((entry) => entry.id);
            await helper.updateTavernRegexesWith((regexes) => {
              const filtered = wsRemovePackRegexes(regexes, packId, targetIds);
              for (const entry of charRegexEntries) {
                filtered.push(wsToRegexEntry(entry, packId, 'character'));
                appliedCount += 1;
              }
              return filtered;
            }, { scope: 'character' });
          }
        }

        if (greetingEntries.length > 0) {
          const { hasCharacter, chId, characters } = wsGetCharacterInfo();
          if (hasCharacter) {
            const character = characters[chId];
            const targetIds = greetingEntries.map((entry) => entry.id);

            if (!Array.isArray(character.alternate_greetings)) {
              character.alternate_greetings = [];
            }

            character.alternate_greetings = wsRemoveGreetingMarkers(packId, targetIds, character.alternate_greetings);

            if (character.data && Array.isArray(character.data.alternate_greetings)) {
              character.data.alternate_greetings = wsRemoveGreetingMarkers(packId, targetIds, character.data.alternate_greetings);
            } else if (character.data) {
              character.data.alternate_greetings = [];
            }

            for (const entry of greetingEntries) {
              if (!entry.content) continue;
              const content = `${entry.content}\n<!--st_workshop_${packId}_${entry.id}-->`;
              character.alternate_greetings.push(content);
              if (character.data) {
                character.data.alternate_greetings.push(content);
              }
              appliedCount += 1;
            }

            wsSaveCharacterChanges(chId);
          }
        }
      } catch (err) {
        console.error('[ST创意工坊脚本] 应用新增或修改失败:', err);
      }
    }

    const successMessage = `已应用 ${appliedCount} 处变更`;
    wsToast('success', successMessage);
    wsSendResult('workshop_sync_changes_result', {
      success: true,
      message: successMessage,
    });
  } catch (err) {
    console.error('[ST创意工坊脚本] 增量同步失败:', err);
    const message = `同步失败：${err.message}`;
    wsToast('error', message);
    wsSendResult('workshop_sync_changes_result', {
      success: false,
      message,
    });
  }
}

async function wsHandleMessage(event) {
  if (!bridgeState.workshopWindow || event.source !== bridgeState.workshopWindow) {
    return;
  }

  const data = event.data || {};
  const rawType = data.type;
  if (!rawType) {
    return;
  }

  const payload = data.payload || {};
  const type = String(rawType).trim();
  console.log('[ST创意工坊脚本] 收到工坊消息:', {
    type,
    payload,
  });

  if (type === 'workshop_ping') {
    const wasConnected = bridgeState.connected;
    bridgeState.connected = true;
    wsStopHandshake();
    wsUpdateButtonState();
    wsRefreshOverlayUrl();
    console.log('[ST创意工坊脚本] 收到 workshop_ping，准备回发 workshop_pong');
    wsPostToWorkshop('workshop_pong', { connected: true });
    if (!wasConnected) {
      wsToast('success', '工坊已连接');
    }
    return;
  }

  if (type === 'workshop_open_oauth') {
    await wsHandleOpenOAuth(payload);
    return;
  }

  if (type === 'workshop_scan') {
    await wsHandleScan(payload);
    return;
  }

  if (type === 'workshop_subscribe') {
    await wsHandleSubscribe(payload);
    return;
  }

  if (type === 'workshop_unsubscribe') {
    await wsHandleUnsubscribe(payload);
    return;
  }

  if (type === 'workshop_check_character') {
    wsHandleCheckCharacter();
    return;
  }

  if (type === 'workshop_sync_changes') {
    await wsHandleSyncChanges(payload);
    return;
  }

  if (type === 'workshop_get_current_worldbooks') {
    await wsHandleGetCurrentWorldbooks(payload);
    return;
  }

  if (type === 'workshop_get_worldbook_list') {
    await wsHandleGetWorldbookList();
    return;
  }

  if (type === 'workshop_get_worldbook_entries') {
    await wsHandleGetWorldbookEntries(payload);
  }
}

function wsBindHostMessageListener() {
  if (bridgeState.hostMessageHandler) {
    window.removeEventListener('message', bridgeState.hostMessageHandler);
    if (hostWindow !== window) {
      hostWindow.removeEventListener('message', bridgeState.hostMessageHandler);
    }
  }

  bridgeState.hostMessageHandler = (event) => {
    wsHandleMessage(event);
  };

  window.addEventListener('message', bridgeState.hostMessageHandler);
  if (hostWindow !== window) {
    hostWindow.addEventListener('message', bridgeState.hostMessageHandler);
  }
  console.log('[ST创意工坊脚本] 已注册消息监听器:', {
    listenWindow: true,
    listenHostWindow: hostWindow !== window,
  });
}

function wsBindScriptButton() {
  if (typeof appendInexistentScriptButtons === 'function') {
    appendInexistentScriptButtons([{ name: '创意工坊', visible: true }]);
  }

  if (typeof eventOn === 'function' && typeof getButtonEvent === 'function') {
    if (!bridgeState.scriptButtonHandler) {
      bridgeState.scriptButtonHandler = () => {
        wsOpenWorkshop();
      };
    }

    eventOn(getButtonEvent('创意工坊'), bridgeState.scriptButtonHandler);
  }
}

function wsInitialize() {
  if (bridgeState.initialized) {
    return;
  }

  if (bridgeState.initTimer) {
    hostWindow.clearTimeout(bridgeState.initTimer);
    bridgeState.initTimer = null;
  }

  bridgeState.initialized = true;
  wsEnsureFloatingButton();
  wsEnsureOverlay();
  wsBindHostMessageListener();
  wsBindScriptButton();
  console.log('[ST创意工坊脚本] 初始化完成');
}

function wsCleanup() {
  if (bridgeState.initTimer) {
    hostWindow.clearTimeout(bridgeState.initTimer);
    bridgeState.initTimer = null;
  }

  wsStopHandshake();

  if (bridgeState.oauthCleanup) {
    bridgeState.oauthCleanup();
    bridgeState.oauthCleanup = null;
  }

  if (bridgeState.hostMessageHandler) {
    window.removeEventListener('message', bridgeState.hostMessageHandler);
    if (hostWindow !== window) {
      hostWindow.removeEventListener('message', bridgeState.hostMessageHandler);
    }
    bridgeState.hostMessageHandler = null;
  }

  const overlay = hostDocument.getElementById(WS_OVERLAY_ID);
  if (overlay) overlay.remove();

  const button = hostDocument.getElementById(WS_FLOAT_BUTTON_ID);
  if (button) button.remove();

  const style = hostDocument.getElementById(WS_STYLE_ID);
  if (style) style.remove();

  bridgeState.connected = false;
  bridgeState.workshopWindow = null;
  bridgeState.initialized = false;
}

function wsScheduleInitialize(delay) {
  if (bridgeState.initialized) {
    return;
  }

  if (bridgeState.initTimer) {
    hostWindow.clearTimeout(bridgeState.initTimer);
  }

  bridgeState.initTimer = hostWindow.setTimeout(() => {
    bridgeState.initTimer = null;
    wsInitialize();
  }, delay);
}

if (typeof $ === 'function') {
  $(function onWorkshopBridgeReady() {
    wsScheduleInitialize(500);
  });
} else {
  wsScheduleInitialize(800);
}

if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
  eventOn(tavern_events.APP_READY, () => {
    wsScheduleInitialize(300);
  });
}

if (typeof $ === 'function') {
  $(window).on('pagehide', wsCleanup);
} else {
  window.addEventListener('pagehide', wsCleanup);
}
