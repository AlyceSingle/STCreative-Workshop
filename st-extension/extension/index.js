/**
 * ST创意工坊 SillyTavern 扩展
 *
 * 在 SillyTavern 内嵌 iframe 加载创意工坊，通过 postMessage 双向通信
 * 使用 iframe 而非 popup 以避免跨域 COOP（Cross-Origin-Opener-Policy）限制
 */

import { getContext } from '../../../extensions.js';

// ← 部署后将此处替换为你的工坊完整 URL
const WORKSHOP_URL = 'http://localhost:5173/';

let workshopOverlay = null;
let workshopIframe = null;
let workshopWindow = null; // iframe.contentWindow
let handshakeInterval = null;

// ═══════════════════════════════════════════════════════════════════════════
// 扩展初始化
// ═══════════════════════════════════════════════════════════════════════════

jQuery(async () => {
  // 注入设置 UI（仅一个按钮，无需用户配置）
  const settingsHtml = `
    <div class="st-workshop-settings">
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>ST创意工坊</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <button id="st_open_workshop" class="menu_button">
            <i class="fa-solid fa-store"></i>
            <span>打开创意工坊</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // 优先注入到 extensions_settings2，回退到 extensions_settings
  const container = $('#extensions_settings2').length
    ? $('#extensions_settings2')
    : $('#extensions_settings');
  container.append(settingsHtml);

  // 绑定打开按钮
  $('#st_open_workshop').on('click', openWorkshop);

  // 监听 window message 事件（接收来自 iframe 的消息）
  window.addEventListener('message', handleWorkshopMessage, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// 打开工坊（iframe 覆盖层）
// ═══════════════════════════════════════════════════════════════════════════

function openWorkshop() {
  // 如果覆盖层已存在，直接显示
  if (workshopOverlay) {
    workshopOverlay.style.display = 'flex';
    return;
  }

  // 创建覆盖层
  workshopOverlay = document.createElement('div');
  workshopOverlay.id = 'st-workshop-overlay';
  workshopOverlay.innerHTML = `
    <div id="st-workshop-modal">
      <div id="st-workshop-header">
        <span class="st-workshop-title">ST创意工坊</span>
        <button id="st-workshop-close" title="关闭">&times;</button>
      </div>
      <iframe id="st-workshop-iframe" src="${WORKSHOP_URL}" allow="clipboard-write"></iframe>
    </div>
  `;
  document.body.appendChild(workshopOverlay);

  workshopIframe = document.getElementById('st-workshop-iframe');

  // 点击关闭按钮隐藏
  document.getElementById('st-workshop-close').addEventListener('click', closeWorkshop);

  // 点击遮罩层（背景）隐藏
  workshopOverlay.addEventListener('click', (e) => {
    if (e.target === workshopOverlay) closeWorkshop();
  });

  // iframe 加载完成后开始握手
  workshopIframe.addEventListener('load', () => {
    workshopWindow = workshopIframe.contentWindow;
    startHandshake();
  });
}

function closeWorkshop() {
  if (workshopOverlay) {
    workshopOverlay.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// postMessage 握手（持续发送 opener 引用直到工坊回应）
// ═══════════════════════════════════════════════════════════════════════════

function startHandshake() {
  // 清除之前的握手定时器
  if (handshakeInterval) clearInterval(handshakeInterval);

  let attempts = 0;
  handshakeInterval = setInterval(() => {
    if (!workshopWindow) {
      clearInterval(handshakeInterval);
      handshakeInterval = null;
      return;
    }
    try {
      workshopWindow.postMessage({
        type: 'st_extension_opener',
        source: 'st_workshop_extension',
      }, '*');
      attempts++;
      if (attempts >= 40) { // 最多 20 秒
        clearInterval(handshakeInterval);
        handshakeInterval = null;
      }
    } catch (err) {
      console.error('[ST创意工坊] 发送 opener 引用失败:', err);
      clearInterval(handshakeInterval);
      handshakeInterval = null;
    }
  }, 500);
}

// ═══════════════════════════════════════════════════════════════════════════
// postMessage 通信处理
// ═══════════════════════════════════════════════════════════════════════════

async function handleWorkshopMessage(event) {
  // 安全检查：必须来自我们的 iframe
  if (!workshopWindow || event.source !== workshopWindow) return;

  const data = event.data || {};
  const rawType = data.type;
  const payload = data.payload;
  
  if (!rawType) return;
  const type = String(rawType).trim();

  if (type === 'workshop_ping') {
    if (handshakeInterval) {
      clearInterval(handshakeInterval);
      handshakeInterval = null;
    }
    workshopWindow.postMessage({ type: 'workshop_pong', connected: true }, '*');
    toastr.success('工坊已连接', 'ST创意工坊');
  } 
  else if (type === 'workshop_open_oauth') {
    await handleOpenOAuth(payload);
  } 
  else if (type === 'workshop_scan') {
    await handleScan(payload);
  } 
  else if (type === 'workshop_subscribe') {
    await handleSubscribe(payload);
  } 
  else if (type === 'workshop_unsubscribe') {
    await handleUnsubscribe(payload);
  } 
  else if (type === 'workshop_check_character') {
    handleCheckCharacter();
  } 
  else if (type === 'workshop_sync_changes') {
    await handleSyncChanges(payload);
  } 
  else if (type === 'workshop_get_current_worldbooks') {
    await handleGetCurrentWorldbooks(payload);
  } 
  else if (type === 'workshop_get_worldbook_list') {
    await handleGetWorldbookList();
  } 
  else if (type === 'workshop_get_worldbook_entries') {
    await handleGetWorldbookEntries(payload);
  } 
  else {
    // 未知消息类型静默忽略
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 检查是否在角色卡中
// ═══════════════════════════════════════════════════════════════════════════

function handleCheckCharacter() {
  const { hasCharacter } = getCharacterInfo();
  sendResult('workshop_check_character_result', {
    success: true,
    hasCharacter,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 获取所有世界书名称列表
// ═══════════════════════════════════════════════════════════════════════════

async function handleGetWorldbookList() {
  try {
    if (!window.TavernHelper || typeof window.TavernHelper.getWorldbookNames !== 'function') {
      throw new Error('世界书 API 不可用');
    }

    const allNames = await window.TavernHelper.getWorldbookNames();
    sendResult('workshop_get_worldbook_list_result', {
      success: true,
      worldbooks: allNames,
    });
  } catch (err) {
    console.error('[ST创意工坊] 获取世界书列表失败:', err);
    sendResult('workshop_get_worldbook_list_result', { success: false, message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 获取当前角色绑定的世界书（主世界书和附加世界书）
// ═══════════════════════════════════════════════════════════════════════════

async function handleGetCurrentWorldbooks(payload) {
  try {
    if (!window.TavernHelper || typeof window.TavernHelper.getCharWorldbookNames !== 'function') {
      throw new Error('世界书 API 不可用');
    }

    // 获取当前角色绑定的世界书
    let primary = null;
    let additional = [];

    // 使用全局函数获取当前角色的世界书绑定信息
    const result = window.TavernHelper.getCharWorldbookNames('current');
    primary = result.primary || null;
    additional = result.additional || [];
    
    sendResult('workshop_get_current_worldbooks_result', {
      success: true,
      primary,
      additional,
    });
  } catch (err) {
    console.error('[ST创意工坊] 获取当前角色世界书失败:', err);
    sendResult('workshop_get_current_worldbooks_result', {
      success: false,
      message: err.message,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 获取特定世界书的条目（从用户拥有的所有世界书中匹配）
// ═══════════════════════════════════════════════════════════════════════════

async function handleGetWorldbookEntries(payload) {
  const { worldbookName } = payload;
  if (!worldbookName) {
    sendResult('workshop_get_worldbook_entries_result', { success: false, message: '缺少世界书名称' });
    return;
  }

  try {
    if (!window.TavernHelper || 
        typeof window.TavernHelper.getWorldbookNames !== 'function' || 
        typeof window.TavernHelper.getWorldbook !== 'function') {
      throw new Error('世界书 API 不可用');
    }

    // 1. 获取用户拥有的所有世界书名称（不限于当前角色绑定的）
    const allNames = await window.TavernHelper.getWorldbookNames();
    
    // 2. 在全量列表中进行匹配
    if (!allNames.includes(worldbookName)) {
      sendResult('workshop_get_worldbook_entries_result', {
        success: true,
        worldbookName,
        entries: [],
        exists: false,
      });
      return;
    }

    // 3. 如果存在，获取其具体条目
    const entries = await window.TavernHelper.getWorldbook(worldbookName);
    
    sendResult('workshop_get_worldbook_entries_result', {
      success: true,
      worldbookName,
      entries,
      exists: true,
    });
  } catch (err) {
    console.error(`[ST创意工坊] 映射世界书「${worldbookName}」失败:`, err);
    sendResult('workshop_get_worldbook_entries_result', {
      success: false,
      worldbookName,
      message: err.message,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 打开 OAuth 弹窗（由扩展在主页面打开，避免 iframe 弹窗被阻止）
// ═══════════════════════════════════════════════════════════════════════════

async function handleOpenOAuth(payload) {
  const { authUrl } = payload;
  if (!authUrl) {
    console.error('[ST创意工坊] OAuth URL 缺失');
    workshopWindow.postMessage({ type: 'workshop_oauth_result', success: false }, '*');
    return;
  }

  const w = 500;
  const h = 700;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const authWindow = window.open(
    authUrl,
    'DiscordAuth',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );

  if (!authWindow) {
    console.error('[ST创意工坊] 无法打开 OAuth 弹窗');
    toastr.error('无法打开登录窗口，请检查浏览器弹窗设置', 'ST创意工坊');
    workshopWindow.postMessage({ type: 'workshop_oauth_result', success: false }, '*');
    return;
  }

  // 监听来自 OAuth 回调页面的消息
  const oauthMessageHandler = (event) => {
    const { type, success } = event.data || {};
    if (type === 'oauth_login_complete') {
      window.removeEventListener('message', oauthMessageHandler);
      clearInterval(pollTimer);
      clearTimeout(timeoutId);
      // 尝试关闭弹窗
      try {
        authWindow.close();
      } catch (e) {
        // 忽略关闭失败
      }
      // 通知 iframe 里的工坊
      workshopWindow.postMessage({ type: 'workshop_oauth_result', success: true }, '*');
    }
  };
  window.addEventListener('message', oauthMessageHandler);

  // 轮询检测弹窗关闭（备用方案）
  const pollTimer = setInterval(() => {
    try {
      if (authWindow.closed) {
        clearInterval(pollTimer);
        clearTimeout(timeoutId);
        window.removeEventListener('message', oauthMessageHandler);
        workshopWindow.postMessage({ type: 'workshop_oauth_result', success: true }, '*');
      }
    } catch (err) {
      // 跨域访问异常，假设弹窗已关闭
      clearInterval(pollTimer);
      clearTimeout(timeoutId);
      window.removeEventListener('message', oauthMessageHandler);
      workshopWindow.postMessage({ type: 'workshop_oauth_result', success: true }, '*');
    }
  }, 500);

  // 60 秒后停止轮询
  const timeoutId = setTimeout(() => {
    clearInterval(pollTimer);
    window.removeEventListener('message', oauthMessageHandler);
  }, 60000);
}

// ═══════════════════════════════════════════════════════════════════════════
// 扫描已订阅的 Pack
// ═══════════════════════════════════════════════════════════════════════════

async function handleScan(payload) {
  const { worldbookName } = payload;
  if (!worldbookName) {
    sendResult('workshop_scan_result', { success: false, packIds: [], entryCountMap: {} });
    return;
  }

  try {
    if (!window.TavernHelper || 
        typeof window.TavernHelper.getWorldbookNames !== 'function' || 
        typeof window.TavernHelper.getWorldbook !== 'function') {
      throw new Error('世界书 API 不可用');
    }

    const names = await window.TavernHelper.getWorldbookNames();
    if (!names.includes(worldbookName)) {
      const result = { success: true, packIds: [], entryCountMap: {} };
      sendResult('workshop_scan_result', result);
      return result;
    }

    const entries = await window.TavernHelper.getWorldbook(worldbookName);
    const packMap = {}; // { packId: entryCount }
    for (const entry of entries) {
      if (entry.extra && entry.extra.source === 'storyshare_workshop' && entry.extra.pack_id != null) {
        const packId = entry.extra.pack_id;
        packMap[packId] = (packMap[packId] || 0) + 1;
      }
    }

    const packIds = Object.keys(packMap).map(Number);
    const result = { success: true, packIds, entryCountMap: packMap };
    sendResult('workshop_scan_result', result);
    return result;
  } catch (err) {
    console.error('[ST创意工坊] 扫描失败:', err);
    const result = { success: false, packIds: [], entryCountMap: {} };
    sendResult('workshop_scan_result', result);
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 订阅 Pack（插入世界书）
// ═══════════════════════════════════════════════════════════════════════════

async function handleSubscribe(payload) {
  const { packId, packTitle, worldbookName } = payload;
  // 兼容新旧格式：如果有预分类的数组则直接使用，否则从 entries 中分离
  let { worldbookEntries, regexEntries, greetingEntries } = payload;

  if (!worldbookEntries || !regexEntries || !greetingEntries) {
    const entries = payload.entries;
    if (!entries) {
      const result = { success: false, message: '缺少必要参数 entries' };
      sendResult('workshop_subscribe_result', result);
      return result;
    }
    
    worldbookEntries = [];
    regexEntries = [];
    greetingEntries = [];

    for (const entry of entries) {
      if (entry.type === 'regex') regexEntries.push(entry);
      else if (entry.type === 'greeting') greetingEntries.push(entry);
      else worldbookEntries.push(entry);
    }
  }

  if (packId == null || !worldbookName) {
    const result = { success: false, message: '缺少必要参数' };
    sendResult('workshop_subscribe_result', result);
    return result;
  }

  try {
    if (!window.TavernHelper || 
        typeof window.TavernHelper.getWorldbookNames !== 'function' || 
        typeof window.TavernHelper.createWorldbook !== 'function') {
      throw new Error('世界书 API 不可用');
    }

    // 分离全局正则和角色正则
    const globalRegexEntries = [];
    const charRegexEntries = [];
    for (const entry of regexEntries) {
      if (entry.extra_data && entry.extra_data.regex_scope === 'character') {
        charRegexEntries.push(entry);
      } else {
        globalRegexEntries.push(entry);
      }
    }

    // 检测是否有角色相关内容
    const hasCharacterContent = charRegexEntries.length > 0 || greetingEntries.length > 0;

    // 如果有角色内容，必须选中角色才能订阅
    if (hasCharacterContent) {
      const { hasCharacter, chId, characters } = getCharacterInfo();
      console.log("角色卡:"+hasCharacter);
      
      if (!hasCharacter) {
        const result = { success: false, message: '此资源包含角色正则或开场白，请先进入角色卡再订阅' };
        sendResult('workshop_subscribe_result', result);
        toastr.warning('请先进入角色卡再订阅', 'ST创意工坊', { timeOut: 5000, extendedTimeOut: 2000 });
        return result;
      }
    }

    let insertedCount = 0;

    // 1. Worldbook
    if (worldbookEntries.length > 0) {
      const names = await window.TavernHelper.getWorldbookNames();
      if (!names.includes(worldbookName)) {
        await window.TavernHelper.createWorldbook(worldbookName);
      }
      // 移除此 pack 的旧条目（幂等）
      await window.TavernHelper.deleteWorldbookEntries(
        worldbookName,
        entry => entry.extra && entry.extra.source === 'storyshare_workshop' && entry.extra.pack_id === packId,
        { render: 'debounced' }
      );
      await window.TavernHelper.createWorldbookEntries(worldbookName, worldbookEntries, { render: 'immediate' });
      insertedCount += worldbookEntries.length;
    }

    // 2. 全局正则
    if (globalRegexEntries.length > 0) {
      if (!window.TavernHelper || typeof window.TavernHelper.updateTavernRegexesWith !== 'function') {
        throw new Error('正则 API 不可用');
      }
      await window.TavernHelper.updateTavernRegexesWith(regexes => {
        const newRegexes = regexes.filter(r => !(r.id && String(r.id).startsWith(`st_workshop_${packId}_`)));
        for (const entry of globalRegexEntries) {
          const ed = entry.extra_data || {};
          newRegexes.push({
            id: `st_workshop_${packId}_${entry.extra.workshop_entry_id}`,
            script_name: entry.name || '',
            enabled: !!entry.enabled,
            run_on_edit: !!ed.run_on_edit,
            scope: ed.regex_scope || 'global',
            find_regex: ed.find_regex || '',
            replace_string: entry.content || '',
            source: ed.source || { user_input: true, ai_output: true, slash_command: true, world_info: false },
            destination: ed.destination || { display: true, prompt: false },
            min_depth: ed.min_depth || null,
            max_depth: ed.max_depth || null,
          });
          insertedCount++;
        }
        return newRegexes;
      }, { scope: 'all' });
    }

    // 3. 角色正则
    if (charRegexEntries.length > 0) {
      if (!window.TavernHelper || typeof window.TavernHelper.updateTavernRegexesWith !== 'function') {
        throw new Error('正则 API 不可用');
      }
      await window.TavernHelper.updateTavernRegexesWith(regexes => {
        const newRegexes = regexes.filter(r => !(r.id && String(r.id).startsWith(`st_workshop_${packId}_`)));
        for (const entry of charRegexEntries) {
          const ed = entry.extra_data || {};
          newRegexes.push({
            id: `st_workshop_${packId}_${entry.extra.workshop_entry_id}`,
            script_name: entry.name || '',
            enabled: !!entry.enabled,
            run_on_edit: !!ed.run_on_edit,
            scope: 'character',
            find_regex: ed.find_regex || '',
            replace_string: entry.content || '',
            source: ed.source || { user_input: true, ai_output: true, slash_command: true, world_info: false },
            destination: ed.destination || { display: true, prompt: false },
            min_depth: ed.min_depth || null,
            max_depth: ed.max_depth || null,
          });
          insertedCount++;
        }
        return newRegexes;
      }, { scope: 'character' });
    }

    // 4. Greeting
    if (greetingEntries.length > 0) {
      const { chId, characters } = getCharacterInfo();
      const char = characters[chId];
      if (!char.alternate_greetings) char.alternate_greetings = [];
      
      for (const entry of greetingEntries) {
        if (entry.content) {
          // 添加隐藏标记以便后续识别和删除
          const markedContent = `${entry.content}\n<!--st_workshop_${packId}_${entry.extra.workshop_entry_id}-->`;
          
          // 检查是否已存在（通过标记识别）
          const existingIndex = char.alternate_greetings.findIndex(g => 
            g.includes(`<!--st_workshop_${packId}_${entry.extra.workshop_entry_id}-->`)
          );
          
          if (existingIndex === -1) {
            char.alternate_greetings.push(markedContent);
            insertedCount++;
            if (char.data) {
              if (!char.data.alternate_greetings) char.data.alternate_greetings = [];
              if (!char.data.alternate_greetings.find(g => 
                g.includes(`<!--st_workshop_${packId}_${entry.extra.workshop_entry_id}-->`)
              )) {
                char.data.alternate_greetings.push(markedContent);
              }
            }
          }
        }
      }
      
      if (typeof window.saveCharacterDebounced === 'function') {
        window.saveCharacterDebounced();
      } else if (typeof window.saveMetadata === 'function') {
        window.saveMetadata();
      }
      if (window.eventSource && typeof window.eventSource.emit === 'function') {
        window.eventSource.emit('characterEdited', chId);
      }
    }

    const result = { success: true, message: `已为「${packTitle}」插入 ${insertedCount} 条记录` };
    sendResult('workshop_subscribe_result', result);
    toastr.success(`已订阅「${packTitle}」`, 'ST创意工坊');
    return result;
  } catch (err) {
    console.error('[ST创意工坊] 订阅失败:', err);
    const result = { success: false, message: '订阅失败：' + err.message };
    sendResult('workshop_subscribe_result', result);
    toastr.error('订阅失败', 'ST创意工坊');
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 取消订阅 Pack（移除世界书条目）
// 注意：是否允许取消订阅的判断已在后端完成，这里只负责执行删除
// ═══════════════════════════════════════════════════════════════════════════

async function handleUnsubscribe(payload) {
  const { packId, worldbookName, hasCharacter: inCharacterCard } = payload;
  if (packId == null || !worldbookName) {
    const result = { success: false, message: '缺少必要参数' };
    sendResult('workshop_unsubscribe_result', result);
    return result;
  }

  try {
    if (!window.TavernHelper || 
        typeof window.TavernHelper.getWorldbookNames !== 'function' || 
        typeof window.TavernHelper.deleteWorldbookEntries !== 'function') {
      throw new Error('世界书 API 不可用');
    }

    // 使用前端传来的角色卡状态（后端已做过验证）
    const { hasCharacter, chId, characters } = getCharacterInfo();
    // 如果前端说在角色卡中，以实际检测为准
    const shouldDeleteCharacterContent = inCharacterCard && hasCharacter;

    let removedCount = 0;

    // 1. 删除世界书条目（始终执行）
    const names = await window.TavernHelper.getWorldbookNames();
    if (names.includes(worldbookName)) {
      const { deleted_entries } = await window.TavernHelper.deleteWorldbookEntries(
        worldbookName,
        entry => entry.extra && entry.extra.source === 'storyshare_workshop' && entry.extra.pack_id === packId,
        { render: 'immediate' }
      );
      removedCount += deleted_entries.length;
    }

    // 2. 删除全局正则（始终执行）
    if (window.TavernHelper && typeof window.TavernHelper.updateTavernRegexesWith === 'function') {
      try {
        await window.TavernHelper.updateTavernRegexesWith(regexes => {
          const beforeCount = regexes.length;
          const newRegexes = regexes.filter(r => !(r.id && String(r.id).startsWith(`st_workshop_${packId}_`)));
          removedCount += (beforeCount - newRegexes.length);
          return newRegexes;
        }, { scope: 'all' });
      } catch (err) {
        console.warn('[ST创意工坊] 删除全局正则失败:', err);
      }
    }

    // 3. 删除角色正则（仅在角色卡中执行）
    if (shouldDeleteCharacterContent) {
      if (window.TavernHelper && typeof window.TavernHelper.updateTavernRegexesWith === 'function') {
        try {
          await window.TavernHelper.updateTavernRegexesWith(regexes => {
            const beforeCount = regexes.length;
            const newRegexes = regexes.filter(r => !(r.id && String(r.id).startsWith(`st_workshop_${packId}_`)));
            removedCount += (beforeCount - newRegexes.length);
            return newRegexes;
          }, { scope: 'character' });
        } catch (err) {
          console.warn('[ST创意工坊] 删除角色正则失败:', err);
        }
      }

      // 4. 删除开场白（仅在角色卡中执行）
      try {
        const char = characters[chId];
        if (char) {
          if (Array.isArray(char.alternate_greetings)) {
            const beforeLen = char.alternate_greetings.length;
            char.alternate_greetings = char.alternate_greetings.filter(g => 
              !g.includes(`<!--st_workshop_${packId}_`)
            );
            removedCount += (beforeLen - char.alternate_greetings.length);
          }
          if (char.data && Array.isArray(char.data.alternate_greetings)) {
            char.data.alternate_greetings = char.data.alternate_greetings.filter(g => 
              !g.includes(`<!--st_workshop_${packId}_`)
            );
          }
          
          if (typeof window.saveCharacterDebounced === 'function') {
            window.saveCharacterDebounced();
          } else if (typeof window.saveMetadata === 'function') {
            window.saveMetadata();
          }
          if (window.eventSource && typeof window.eventSource.emit === 'function') {
            window.eventSource.emit('characterEdited', chId);
          }
        }
      } catch (err) {
        console.warn('[ST创意工坊] 删除开场白失败:', err);
      }
    }

    const result = { success: true, message: `已取消订阅，清理了 ${removedCount} 条相关记录` };
    sendResult('workshop_unsubscribe_result', result);
    toastr.success('已取消订阅', 'ST创意工坊');
    return result;
  } catch (err) {
    console.error('[ST创意工坊] 取消订阅失败:', err);
    const result = { success: false, message: '取消订阅失败：' + err.message };
    sendResult('workshop_unsubscribe_result', result);
    toastr.error('取消订阅失败', 'ST创意工坊');
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 增量同步变更（处理新增、修改、删除）
// ═══════════════════════════════════════════════════════════════════════════

async function handleSyncChanges(payload) {
  const { packId, worldbookName, changes } = payload;
  if (packId == null || !worldbookName || !changes) {
    const result = { success: false, message: '缺少必要参数' };
    sendResult('workshop_sync_changes_result', result);
    return result;
  }

  try {
    const names = await window.TavernHelper.getWorldbookNames();
    if (!names.includes(worldbookName)) {
      await window.TavernHelper.createWorldbook(worldbookName);
    }

    let appliedCount = 0;

    // 1. 处理删除（需要分类处理：worldbook / regex / greeting）
    if (changes.deleted && changes.deleted.length > 0) {
      try {
        // 删除世界书条目
        const { deleted_entries } = await window.TavernHelper.deleteWorldbookEntries(
          worldbookName,
          e => e.extra?.source === 'storyshare_workshop'
            && e.extra.pack_id === packId
            && changes.deleted.map(entry => entry.id).includes(e.extra.workshop_entry_id),
          { render: 'debounced' }
        );
        appliedCount += deleted_entries.length;

        // 删除正则（全局和角色）
        const deletedRegexIds = changes.deleted.filter(e => e.entry_type === 'regex').map(e => e.id);
        if (deletedRegexIds.length > 0) {
          // 全局正则
          await window.TavernHelper.updateTavernRegexesWith(regexes => {
            const beforeCount = regexes.length;
            const newRegexes = regexes.filter(r => {
              if (!r.id || !String(r.id).startsWith(`st_workshop_${packId}_`)) return true;
              const entryId = Number(String(r.id).split('_').pop());
              return !deletedRegexIds.includes(entryId);
            });
            appliedCount += (beforeCount - newRegexes.length);
            return newRegexes;
          }, { scope: 'all' });

          // 角色正则
          await window.TavernHelper.updateTavernRegexesWith(regexes => {
            const beforeCount = regexes.length;
            const newRegexes = regexes.filter(r => {
              if (!r.id || !String(r.id).startsWith(`st_workshop_${packId}_`)) return true;
              const entryId = Number(String(r.id).split('_').pop());
              return !deletedRegexIds.includes(entryId);
            });
            appliedCount += (beforeCount - newRegexes.length);
            return newRegexes;
          }, { scope: 'character' });
        }

        // 删除开场白
        const deletedGreetings = changes.deleted.filter(e => e.entry_type === 'greeting');
        if (deletedGreetings.length > 0) {
          const { chId, characters } = getCharacterInfo();
          const char = characters[chId];
          const deletedEntryIds = deletedGreetings.map(e => e.id);
          
          // 通过隐藏标记识别并删除
          if (Array.isArray(char.alternate_greetings)) {
            const beforeLen = char.alternate_greetings.length;
            char.alternate_greetings = char.alternate_greetings.filter(g => {
              // 检查是否包含被删除条目的标记
              for (const entryId of deletedEntryIds) {
                if (g.includes(`<!--st_workshop_${packId}_${entryId}-->`)) {
                  return false;
                }
              }
              return true;
            });
            appliedCount += (beforeLen - char.alternate_greetings.length);
          }
          if (char.data && Array.isArray(char.data.alternate_greetings)) {
            char.data.alternate_greetings = char.data.alternate_greetings.filter(g => {
              for (const entryId of deletedEntryIds) {
                if (g.includes(`<!--st_workshop_${packId}_${entryId}-->`)) {
                  return false;
                }
              }
              return true;
            });
          }
          
          if (typeof window.saveCharacterDebounced === 'function') {
            window.saveCharacterDebounced();
          } else if (typeof window.saveMetadata === 'function') {
            window.saveMetadata();
          }
          if (window.eventSource && typeof window.eventSource.emit === 'function') {
            window.eventSource.emit('characterEdited', chId);
          }
        }
      } catch (err) {
        console.error('[ST创意工坊] 删除条目失败:', err);
      }
    }

    // 2. 处理新增和修改（先删除旧的，再插入新的）
    const entriesToUpdate = [
      ...(changes.new || []),
      ...(changes.modified || [])
    ];

    if (entriesToUpdate.length > 0) {
      const entryIds = entriesToUpdate.map(e => e.id);

      // 分类条目：worldbook / regex / greeting
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
        // 2.1 处理 Worldbook 条目
        if (worldbookEntries.length > 0) {
          // 删除旧的 worldbook 条目
          await window.TavernHelper.deleteWorldbookEntries(
            worldbookName,
            e => e.extra?.source === 'storyshare_workshop'
              && e.extra.pack_id === packId
              && worldbookEntries.map(entry => entry.id).includes(e.extra.workshop_entry_id),
            { render: 'debounced' }
          );

          // 插入新的 worldbook 条目
          const stWorldbookEntries = worldbookEntries.map(entry => ({
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

          await window.TavernHelper.createWorldbookEntries(worldbookName, stWorldbookEntries, { render: 'immediate' });
          appliedCount += stWorldbookEntries.length;
        }

        // 2.2 处理 Regex 条目（先删除旧的，再插入新的）
        if (regexEntries.length > 0) {
          // 分离全局正则和角色正则
          const globalRegexEntries = [];
          const charRegexEntries = [];
          for (const entry of regexEntries) {
            if (entry.extra_data && entry.extra_data.regex_scope === 'character') {
              charRegexEntries.push(entry);
            } else {
              globalRegexEntries.push(entry);
            }
          }

          // 删除并插入全局正则
          if (globalRegexEntries.length > 0) {
            await window.TavernHelper.updateTavernRegexesWith(regexes => {
              // 先删除旧的
              const newRegexes = regexes.filter(r => {
                if (!r.id || !String(r.id).startsWith(`st_workshop_${packId}_`)) return true;
                const entryId = Number(String(r.id).split('_').pop());
                return !globalRegexEntries.map(e => e.id).includes(entryId);
              });
              // 再插入新的
              for (const entry of globalRegexEntries) {
                const ed = entry.extra_data || {};
                newRegexes.push({
                  id: `st_workshop_${packId}_${entry.id}`,
                  script_name: entry.name || '',
                  enabled: !!entry.enabled,
                  run_on_edit: !!ed.run_on_edit,
                  scope: ed.regex_scope || 'global',
                  find_regex: ed.find_regex || '',
                  replace_string: entry.content || '',
                  source: ed.source || { user_input: true, ai_output: true, slash_command: true, world_info: false },
                  destination: ed.destination || { display: true, prompt: false },
                  min_depth: ed.min_depth || null,
                  max_depth: ed.max_depth || null,
                });
                appliedCount++;
              }
              return newRegexes;
            }, { scope: 'all' });
          }

          // 删除并插入角色正则
          if (charRegexEntries.length > 0) {
            await window.TavernHelper.updateTavernRegexesWith(regexes => {
              // 先删除旧的
              const newRegexes = regexes.filter(r => {
                if (!r.id || !String(r.id).startsWith(`st_workshop_${packId}_`)) return true;
                const entryId = Number(String(r.id).split('_').pop());
                return !charRegexEntries.map(e => e.id).includes(entryId);
              });
              // 再插入新的
              for (const entry of charRegexEntries) {
                const ed = entry.extra_data || {};
                newRegexes.push({
                  id: `st_workshop_${packId}_${entry.id}`,
                  script_name: entry.name || '',
                  enabled: !!entry.enabled,
                  run_on_edit: !!ed.run_on_edit,
                  scope: 'character',
                  find_regex: ed.find_regex || '',
                  replace_string: entry.content || '',
                  source: ed.source || { user_input: true, ai_output: true, slash_command: true, world_info: false },
                  destination: ed.destination || { display: true, prompt: false },
                  min_depth: ed.min_depth || null,
                  max_depth: ed.max_depth || null,
                });
                appliedCount++;
              }
              return newRegexes;
            }, { scope: 'character' });
          }
        }

        // 2.3 处理 Greeting 条目（先删除旧的，再插入新的）
        if (greetingEntries.length > 0) {
          const { chId, characters } = getCharacterInfo();
          const char = characters[chId];
          if (!char.alternate_greetings) char.alternate_greetings = [];
          
          // 先删除旧的（通过隐藏标记识别）
          const entryIds = greetingEntries.map(e => e.id);
          char.alternate_greetings = char.alternate_greetings.filter(g => {
            // 检查是否包含要更新条目的标记
            for (const entryId of entryIds) {
              if (g.includes(`<!--st_workshop_${packId}_${entryId}-->`)) {
                return false;
              }
            }
            return true;
          });
          if (char.data && Array.isArray(char.data.alternate_greetings)) {
            char.data.alternate_greetings = char.data.alternate_greetings.filter(g => {
              for (const entryId of entryIds) {
                if (g.includes(`<!--st_workshop_${packId}_${entryId}-->`)) {
                  return false;
                }
              }
              return true;
            });
          }

          // 再插入新的（带隐藏标记）
          for (const entry of greetingEntries) {
            if (entry.content) {
              const markedContent = `${entry.content}\n<!--st_workshop_${packId}_${entry.id}-->`;
              char.alternate_greetings.push(markedContent);
              appliedCount++;
              if (char.data) {
                if (!char.data.alternate_greetings) char.data.alternate_greetings = [];
                char.data.alternate_greetings.push(markedContent);
              }
            }
          }
          
          if (typeof window.saveCharacterDebounced === 'function') {
            window.saveCharacterDebounced();
          } else if (typeof window.saveMetadata === 'function') {
            window.saveMetadata();
          }
          if (window.eventSource && typeof window.eventSource.emit === 'function') {
            window.eventSource.emit('characterEdited', chId);
          }
        }
      } catch (err) {
        console.error('[ST创意工坊] 更新条目失败:', err);
      }
    }

    const result = { success: true, message: `已应用 ${appliedCount} 处变更` };
    sendResult('workshop_sync_changes_result', result);
    toastr.success('同步成功', 'ST创意工坊');
    return result;
  } catch (err) {
    console.error('[ST创意工坊] 增量同步失败:', err);
    const result = { success: false, message: '同步失败：' + err.message };
    sendResult('workshop_sync_changes_result', result);
    toastr.error('同步失败', 'ST创意工坊');
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════════════════

// 获取当前角色信息
function getCharacterInfo() {
  let chId = window.this_chid;
  if (chId === undefined && typeof window.SillyTavern?.getContext === 'function') {
    chId = window.SillyTavern.getContext().characterId;
  }
  if (chId === undefined && typeof getContext === 'function') {
    try { chId = getContext().characterId; } catch(e) {}
  }

  let characters = window.characters;
  if (!characters && typeof window.SillyTavern?.getContext === 'function') {
    characters = window.SillyTavern.getContext().characters;
  }
  if (!characters && typeof getContext === 'function') {
    try { characters = getContext().characters; } catch(e) {}
  }

  const hasCharacter = !!(chId !== undefined && chId !== null && characters && characters[chId]);
  return { hasCharacter, chId, characters };
}

// 发送结果回 iframe
function sendResult(type, payload) {
  if (workshopWindow) {
    workshopWindow.postMessage({ type, ...payload }, '*');
  }
}
