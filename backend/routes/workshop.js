const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db/init');
const { requireAuth, optionalAuth } = require('../middleware/auth');

// ── 辅助函数 ────────────────────────────────────────────────────────

// 计算数据哈希值（用于快速判断数据是否改变）
function computeHash(data) {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

// 格式化用户头像 URL
function avatarUrl(discordId, avatar) {
  if (avatar) return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`;
  return `https://cdn.discordapp.com/embed/avatars/${parseInt(discordId) % 5}.png`;
}

// 将数据库行格式化为 workshop API 响应
function formatWorkshop(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    worldbook: row.worldbook || '',
    author_id: row.author_id || null,
    status: row.status || 'active',
    created_at: row.created_at,
  };
}

// 将数据库行格式化为 pack API 响应
function formatPack(row, isLiked = false, isSubscribed = false) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    section: row.section || 'steampunk',
    tags: JSON.parse(row.tags || '[]'),
    worldbook: row.worldbook || '',
    like_count: row.like_count,
    sub_count: row.sub_count,
    entry_count: row.entry_count || 0,
    count_worldbook: row.count_worldbook || 0,
    count_regex: row.count_regex || 0,
    count_greeting: row.count_greeting || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_liked: isLiked,
    is_subscribed: isSubscribed,
    author: {
      id: row.author_id,
      username: row.username,
      display_name: row.display_name || null,
      avatar: avatarUrl(row.discord_id, row.avatar),
    },
    workshop: row.w_id ? { id: row.w_id, slug: row.w_slug, name: row.w_name } : null,
  };
}

// 将数据库行格式化为 entry API 响应
function formatEntry(row) {
  return {
    id: row.id,
    pack_id: row.pack_id,
    author_id: row.author_id,    // 条目作者（用于前端判断编辑权限）
    name: row.name,
    entry_type: row.entry_type || 'worldbook',
    extra_data: JSON.parse(row.extra_data || '{}'),
    enabled: !!row.enabled,
    content: row.content,
    strategy_type: row.strategy_type,
    keys: JSON.parse(row.keys || '[]'),
    keys_secondary_logic: row.keys_secondary_logic,
    keys_secondary: JSON.parse(row.keys_secondary || '[]'),
    scan_depth: row.scan_depth,
    position_type: row.position_type,
    position_order: row.position_order,
    position_depth: row.position_depth,
    position_role: row.position_role,
    probability: row.probability,
    recursion_prevent_incoming: !!row.recursion_prevent_incoming,
    recursion_prevent_outgoing: !!row.recursion_prevent_outgoing,
    recursion_delay_until: row.recursion_delay_until || null,
    effect_sticky: row.effect_sticky || null,
    effect_cooldown: row.effect_cooldown || null,
    effect_delay: row.effect_delay || null,
    created_at: row.created_at,
    // Phase 2: 版本控制字段
    version: row.version || 1,
    updated_at: row.updated_at || row.created_at,
    is_deleted: !!row.is_deleted,
  };
}

// 创建条目版本快照（在修改或删除前调用）
// Phase 2.1 优化：只保留元数据（entry_id, version, entry_type, created_by）
// 滚动窗口策略：每个条目只保留1个历史快照，新快照创建时删除旧快照
function createEntryVersionSnapshot(db, entry, userId) {
  // 1. 删除该条目的所有旧快照（保持只有1个历史快照）
  db.prepare(`DELETE FROM entry_versions WHERE entry_id = ?`).run(entry.id);
  
  // 2. 插入当前版本的精简快照（只保留元数据）
  db.prepare(`
    INSERT INTO entry_versions (entry_id, version, entry_type, created_by)
    VALUES (?, ?, ?, ?)
  `).run(
    entry.id,
    entry.version || 1,
    entry.entry_type || 'worldbook',
    userId
  );
}

// 枚举校验常量
const VALID_STRATEGY_TYPES = ['constant', 'selective'];
const VALID_POSITION_TYPES = [
  'before_character_definition', 'after_character_definition',
  'before_example_messages', 'after_example_messages',
  'before_author_note', 'after_author_note', 'at_depth',
];
const VALID_LOGICS = ['and_any', 'not_all', 'not_any', 'and_all'];
const VALID_ROLES = ['system', 'user', 'assistant'];

// ── Workshop 路由 ────────────────────────────────────────────────────

// GET /api/workshop/workshops — 公开获取所有工坊列表
router.get('/workshops', (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare(`SELECT * FROM workshops WHERE status = 'active' ORDER BY id ASC`).all();
    res.json({ data: rows.map(formatWorkshop) });
  } catch (err) {
    console.error('[Workshop] 获取工坊列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/workshop/workshops — 创建工坊（仅创作者或管理员）
router.post('/workshops', requireAuth, (req, res) => {
  const db = getDb();
  const userRow = db.prepare(`SELECT role FROM users WHERE id = ?`).get(req.user.id);
  if (!userRow || (userRow.role !== 'creator' && userRow.role !== 'admin')) {
    return res.status(403).json({ error: '只有创作者或管理员才能创建工坊' });
  }

  const { name, description, worldbook } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: '工坊名称不能为空' });
  if (String(name).trim().length > 50) return res.status(400).json({ error: '工坊名称不能超过 50 字' });

  // 自动生成 slug：去除非字母数字汉字字符 + 追加时间戳保证唯一
  const base = String(name).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '_');
  const slug = `${base}_${Date.now()}`;

  try {
    // 管理员直接激活，创作者需等待审批
    const status = (userRow.role === 'admin') ? 'active' : 'pending';
    const info = db.prepare(`
      INSERT INTO workshops (name, slug, description, worldbook, author_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      String(name).trim(),
      slug,
      String(description || '').trim(),
      String(worldbook || '').trim(),
      req.user.id,
      status
    );
    const created = db.prepare(`SELECT * FROM workshops WHERE id = ?`).get(info.lastInsertRowid);
    const msg = status === 'pending' ? '工坊申请已提交，等待管理员审批' : '工坊创建成功';
    res.status(201).json({ data: formatWorkshop(created), message: msg });
  } catch (err) {
    console.error('[Workshop] 创建工坊失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// PUT /api/workshop/workshops/:id — 编辑工坊（作者或管理员）
router.put('/workshops/:id',  requireAuth, (req, res) => {
  const db = getDb();
  const wid = parseInt(req.params.id);
  if (isNaN(wid)) return res.status(400).json({ error: '无效的工坊 ID' });

  const existing = db.prepare(`SELECT * FROM workshops WHERE id = ?`).get(wid);
  if (!existing) return res.status(404).json({ error: '工坊不存在' });

  const userRow = db.prepare(`SELECT role FROM users WHERE id = ?`).get(req.user.id);
  const isAdmin = userRow && userRow.role === 'admin';
  if (!isAdmin && existing.author_id !== req.user.id) {
    return res.status(403).json({ error: '无权编辑此工坊' });
  }

  const { name, description, worldbook } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: '工坊名称不能为空' });
  if (String(name).trim().length > 50) return res.status(400).json({ error: '工坊名称不能超过 50 字' });

  try {
    db.prepare(`UPDATE workshops SET name = ?, description = ?, worldbook = ? WHERE id = ?`)
      .run(String(name).trim(), String(description || '').trim(), String(worldbook || '').trim(), wid);
    const updated = db.prepare(`SELECT * FROM workshops WHERE id = ?`).get(wid);
    res.json({ data: formatWorkshop(updated), message: '工坊更新成功' });
  } catch (err) {
    console.error('[Workshop] 更新工坊失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// DELETE /api/workshop/workshops/:id — 删除工坊（作者或管理员）
router.delete('/workshops/:id', requireAuth, (req, res) => {
  const db = getDb();
  const wid = parseInt(req.params.id);
  if (isNaN(wid)) return res.status(400).json({ error: '无效的工坊 ID' });

  const existing = db.prepare(`SELECT * FROM workshops WHERE id = ?`).get(wid);
  if (!existing) return res.status(404).json({ error: '工坊不存在' });

  const userRow = db.prepare(`SELECT role FROM users WHERE id = ?`).get(req.user.id);
  const isAdmin = userRow && userRow.role === 'admin';
  if (!isAdmin && existing.author_id !== req.user.id) {
    return res.status(403).json({ error: '无权删除此工坊' });
  }

  try {
    db.prepare(`DELETE FROM workshops WHERE id = ?`).run(wid);
    res.json({ success: true, message: '工坊已删除' });
  } catch (err) {
    console.error('[Workshop] 删除工坊失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── Pack 路由 ────────────────────────────────────────────────────────

// GET /api/workshop — 获取 pack 列表，按热度排序（like_count + sub_count）
router.get('/', optionalAuth, (req, res) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const userId = req.user ? req.user.id : null;

  // 过滤参数：workshop slug（新），兼容旧 section
  const workshopSlug = req.query.workshop || req.query.section || null;
  const search = req.query.q ? String(req.query.q).trim() : null;
  const tag = req.query.tag ? String(req.query.tag).trim() : null;
  const authorId = req.query.author_id ? parseInt(req.query.author_id) : null;
  const sort = req.query.sort === 'newest' ? 'newest' : 'popular'; // 默认按热度

  // 动态构建 WHERE 子句
  const whereClauses = [];
  const params = [];

  if (workshopSlug) {
    whereClauses.push(`w.slug = ?`);
    params.push(workshopSlug);
  }
  if (search) {
    // 仅按模组名称（标题）搜索
    whereClauses.push(`p.title LIKE '%' || ? || '%'`);
    params.push(search);
  }
  if (tag) {
    whereClauses.push(`EXISTS (SELECT 1 FROM json_each(p.tags) WHERE value = ?)`);
    params.push(tag);
  }
  if (authorId && !isNaN(authorId)) {
    whereClauses.push(`p.author_id = ?`);
    params.push(authorId);
  }

  const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM workshop_packs p
    LEFT JOIN workshops w ON p.workshop_id = w.id
    ${whereSQL}
  `).get(...params)?.count || 0;

  const rows = db.prepare(`
    SELECT p.*,
           u.username, u.avatar, u.discord_id, u.display_name,
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS entry_count, 
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND e.entry_type='worldbook' AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS count_worldbook,
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND e.entry_type='regex' AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS count_regex,
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND e.entry_type='greeting' AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS count_greeting,
           w.id as w_id, w.slug as w_slug, w.name as w_name
    FROM workshop_packs p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN workshops w ON p.workshop_id = w.id
    ${whereSQL}
    ${sort === 'newest' ? 'ORDER BY p.created_at DESC' : 'ORDER BY (p.like_count + p.sub_count) DESC, p.created_at DESC'}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  // 批量查询当前用户的点赞/订阅状态
  let likedSet = new Set();
  let subbedSet = new Set();
  if (userId) {
    const packIds = rows.map((r) => r.id);
    if (packIds.length > 0) {
      const placeholders = packIds.map(() => '?').join(',');
      db.prepare(`SELECT pack_id FROM workshop_likes WHERE user_id = ? AND pack_id IN (${placeholders})`)
        .all(userId, ...packIds)
        .forEach((r) => likedSet.add(r.pack_id));
      db.prepare(`SELECT pack_id FROM workshop_subscriptions WHERE user_id = ? AND pack_id IN (${placeholders})`)
        .all(userId, ...packIds)
        .forEach((r) => subbedSet.add(r.pack_id));
    }
  }

  const data = rows.map((row) => formatPack(row, likedSet.has(row.id), subbedSet.has(row.id)));

  // 计算数据哈希值（用于前端判断是否需要更新）
  const dataHash = computeHash(data);

  res.json({
    data,
    hash: dataHash,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /api/workshop/packs/:packId — 获取单个 pack 详情（含条目列表）
router.get('/packs/:packId', optionalAuth, (req, res) => {
  const db = getDb();
  const packId = parseInt(req.params.packId);
  if (isNaN(packId)) return res.status(400).json({ error: '无效的模组 ID' });
  const userId = req.user ? req.user.id : null;

  const row = db.prepare(`
    SELECT p.*,
           u.username, u.avatar, u.discord_id, u.display_name,
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS entry_count, 
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND e.entry_type='worldbook' AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS count_worldbook,
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND e.entry_type='regex' AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS count_regex,
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND e.entry_type='greeting' AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS count_greeting,
           w.id as w_id, w.slug as w_slug, w.name as w_name
    FROM workshop_packs p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN workshops w ON p.workshop_id = w.id
    WHERE p.id = ?
  `).get(packId);

  if (!row) return res.status(404).json({ error: '模组不存在' });

  let isLiked = false;
  let isSubscribed = false;
  if (userId) {
    isLiked = !!db.prepare(`SELECT 1 FROM workshop_likes WHERE user_id = ? AND pack_id = ?`).get(userId, packId);
    isSubscribed = !!db.prepare(`SELECT 1 FROM workshop_subscriptions WHERE user_id = ? AND pack_id = ?`).get(userId, packId);
  }

  // 只返回未删除的条目
  const entries = db.prepare(`
    SELECT * FROM workshop_entries 
    WHERE pack_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
    ORDER BY position_order ASC, id ASC
  `).all(packId);

  res.json({
    data: {
      ...formatPack(row, isLiked, isSubscribed),
      entries: entries.map(formatEntry),
    },
  });
});

// POST /api/workshop/packs — 创建新 pack（任意登录用户均可创建）
router.post('/packs', requireAuth, (req, res) => {
  const db = getDb();

  const { title, description, workshop_id, tags, worldbook } = req.body;

  if (!title || !String(title).trim()) return res.status(400).json({ error: '模组标题不能为空' });
  if (String(title).trim().length > 200) return res.status(400).json({ error: '模组标题不能超过 200 字' });

  // 校验 workshop_id（可选；若传了则必须存在）
  let sectionVal = 'steampunk';
  let workshopIdVal = null;
  if (workshop_id != null) {
    const wid = parseInt(workshop_id);
    if (isNaN(wid)) return res.status(400).json({ error: '无效的工坊 ID' });
    const workshopRow = db.prepare(`SELECT id, slug FROM workshops WHERE id = ?`).get(wid);
    if (!workshopRow) return res.status(400).json({ error: '指定的工坊不存在' });
    workshopIdVal = workshopRow.id;
    sectionVal = workshopRow.slug;
  }

  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags.map(String).filter(Boolean) : []);
  const worldbookVal = String(worldbook || '').trim();

  try {
    const info = db.prepare(`
      INSERT INTO workshop_packs (author_id, title, description, section, tags, worldbook, workshop_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, String(title).trim(), String(description || '').trim(), sectionVal, tagsJson, worldbookVal, workshopIdVal);

    res.status(201).json({ data: { id: info.lastInsertRowid }, message: '模组创建成功' });
  } catch (err) {
    console.error('[Workshop] 创建 Pack 失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// PUT /api/workshop/packs/:packId — 编辑 pack 元数据（仅作者）
router.put('/packs/:packId', requireAuth, (req, res) => {
  const db = getDb();
  const packId = parseInt(req.params.packId);
  if (isNaN(packId)) return res.status(400).json({ error: '无效的模组 ID' });

  const existing = db.prepare(`SELECT author_id FROM workshop_packs WHERE id = ?`).get(packId);
  if (!existing) return res.status(404).json({ error: '模组不存在' });
  if (existing.author_id !== req.user.id) return res.status(403).json({ error: '无权编辑此模组' });

  const { title, description, tags, worldbook, workshop_id } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: '模组标题不能为空' });

  const tagsJson = Array.isArray(tags)
    ? JSON.stringify(tags.map(String).filter(Boolean))
    : null;
  const worldbookVal = worldbook !== undefined ? String(worldbook).trim() : null;

  // 校验并解析 workshop_id（可选）
  let newWorkshopId = undefined; // undefined 表示不更新
  let newSection = undefined;
  if (workshop_id !== undefined && workshop_id !== null) {
    const wid = parseInt(workshop_id);
    if (isNaN(wid)) return res.status(400).json({ error: '无效的工坊 ID' });
    const workshopRow = db.prepare(`SELECT id, slug FROM workshops WHERE id = ?`).get(wid);
    if (!workshopRow) return res.status(400).json({ error: '指定的工坊不存在' });
    newWorkshopId = workshopRow.id;
    newSection = workshopRow.slug;
  }

  try {
    // 动态构建 SET 子句
    const setClauses = ['title = ?', 'description = ?'];
    const runParams = [String(title).trim(), String(description || '').trim()];
    if (tagsJson !== null) { setClauses.push('tags = ?'); runParams.push(tagsJson); }
    if (worldbookVal !== null) { setClauses.push('worldbook = ?'); runParams.push(worldbookVal); }
    if (newWorkshopId !== undefined) {
      setClauses.push('workshop_id = ?');
      runParams.push(newWorkshopId);
      setClauses.push('section = ?');
      runParams.push(newSection);
    }
    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    runParams.push(packId);

    db.prepare(`UPDATE workshop_packs SET ${setClauses.join(', ')} WHERE id = ?`).run(...runParams);

    res.json({ message: '模组更新成功' });
  } catch (err) {
    console.error('[Workshop] 更新 Pack 失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// DELETE /api/workshop/packs/:packId — 删除 pack（仅作者，级联删除条目）
router.delete('/packs/:packId', requireAuth, (req, res) => {
  const db = getDb();
  const packId = parseInt(req.params.packId);
  if (isNaN(packId)) return res.status(400).json({ error: '无效的模组 ID' });

  const existing = db.prepare(`SELECT author_id FROM workshop_packs WHERE id = ?`).get(packId);
  if (!existing) return res.status(404).json({ error: '模组不存在' });
  if (existing.author_id !== req.user.id) return res.status(403).json({ error: '无权删除此模组' });

  db.prepare(`DELETE FROM workshop_packs WHERE id = ?`).run(packId);
  res.json({ success: true, message: '模组已删除' });
});

// ── 点赞路由 ─────────────────────────────────────────────────────────

// POST /api/workshop/packs/:packId/like — 点赞（需登录）
router.post('/packs/:packId/like', requireAuth, (req, res) => {
  const db = getDb();
  const packId = parseInt(req.params.packId);
  if (isNaN(packId)) return res.status(400).json({ error: '无效的模组 ID' });

  const pack = db.prepare(`SELECT id FROM workshop_packs WHERE id = ?`).get(packId);
  if (!pack) return res.status(404).json({ error: '模组不存在' });

  try {
    const toggleLike = db.transaction(() => {
      const existing = db.prepare(`SELECT 1 FROM workshop_likes WHERE user_id = ? AND pack_id = ?`).get(req.user.id, packId);
      if (existing) {
        // 取消点赞
        db.prepare(`DELETE FROM workshop_likes WHERE user_id = ? AND pack_id = ?`).run(req.user.id, packId);
        db.prepare(`UPDATE workshop_packs SET like_count = MAX(0, like_count - 1) WHERE id = ?`).run(packId);
        return false;
      } else {
        // 点赞
        db.prepare(`INSERT INTO workshop_likes (user_id, pack_id) VALUES (?, ?)`).run(req.user.id, packId);
        db.prepare(`UPDATE workshop_packs SET like_count = like_count + 1 WHERE id = ?`).run(packId);
        return true;
      }
    });

    const liked = toggleLike();
    const row = db.prepare(`SELECT like_count FROM workshop_packs WHERE id = ?`).get(packId);
    res.json({ liked, like_count: row.like_count });
  } catch (err) {
    console.error('[Workshop] 点赞操作失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── 订阅路由 ─────────────────────────────────────────────────────────

// GET /api/workshop/my-subscriptions — 获取当前用户的订阅列表（需登录）
router.get('/my-subscriptions', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT p.*,
             u.username, u.avatar, u.discord_id, u.display_name,
             (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS entry_count, 
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND e.entry_type='worldbook' AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS count_worldbook,
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND e.entry_type='regex' AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS count_regex,
           (SELECT COUNT(*) FROM workshop_entries e WHERE e.pack_id = p.id AND e.entry_type='greeting' AND (e.is_deleted = 0 OR e.is_deleted IS NULL)) AS count_greeting,
             w.id as w_id, w.slug as w_slug, w.name as w_name,
             s.created_at as subscribed_at,
             s.selected_entry_ids,
             s.worldbook_name,
             s.last_synced_at,
             s.synced_version_map
      FROM workshop_subscriptions s
      JOIN workshop_packs p ON s.pack_id = p.id
      JOIN users u ON p.author_id = u.id
      LEFT JOIN workshops w ON p.workshop_id = w.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(req.user.id);

    const data = rows.map(row => ({
      ...formatPack(row, false, true),
      subscribed_at: row.subscribed_at,
      // Phase 2: 条目级别订阅信息
      selected_entry_ids: JSON.parse(row.selected_entry_ids || '[]'),
      worldbook_name: row.worldbook_name || '',
      last_synced_at: row.last_synced_at || null,
      synced_version_map: JSON.parse(row.synced_version_map || '{}'),
    }));

    res.json({ data });
  } catch (err) {
    console.error('[Workshop] 获取订阅列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/workshop/packs/:packId/subscribe — 订阅（需登录）
router.post('/packs/:packId/subscribe', requireAuth, (req, res) => {
  const db = getDb();
  const packId = parseInt(req.params.packId);
  if (isNaN(packId)) return res.status(400).json({ error: '无效的模组 ID' });

  const pack = db.prepare(`SELECT id FROM workshop_packs WHERE id = ?`).get(packId);
  if (!pack) return res.status(404).json({ error: '模组不存在' });

  const { action, selected_entry_ids, worldbook_name } = req.body || {};

  // 验证 selected_entry_ids 数组
  const entryIds = Array.isArray(selected_entry_ids) 
    ? selected_entry_ids.map(id => parseInt(id)).filter(id => !isNaN(id))
    : [];
  const entryIdsJson = JSON.stringify(entryIds);
  const worldbookNameVal = String(worldbook_name || '').trim();
  
  // 生成当前版本映射：查询选中条目的当前版本号
  const versionMap = {};
  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    const entries = db.prepare(`SELECT id, version FROM workshop_entries WHERE id IN (${placeholders})`).all(...entryIds);
    for (const entry of entries) {
      versionMap[entry.id] = entry.version || 1;
    }
  }
  const versionMapJson = JSON.stringify(versionMap);

  try {
    const toggleSub = db.transaction(() => {
      const existing = db.prepare(`SELECT 1 FROM workshop_subscriptions WHERE user_id = ? AND pack_id = ?`).get(req.user.id, packId);
      
      if (action === 'subscribe') {
        if (!existing) {
          // 新订阅：插入带条目级别信息的记录
          db.prepare(`
            INSERT INTO workshop_subscriptions (user_id, pack_id, selected_entry_ids, worldbook_name, synced_version_map, last_synced_at) 
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(req.user.id, packId, entryIdsJson, worldbookNameVal, versionMapJson);
          db.prepare(`UPDATE workshop_packs SET sub_count = sub_count + 1 WHERE id = ?`).run(packId);
        } else {
          // 更新现有订阅（重新同步）
          db.prepare(`
            UPDATE workshop_subscriptions 
            SET selected_entry_ids = ?, worldbook_name = ?, synced_version_map = ?, last_synced_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND pack_id = ?
          `).run(entryIdsJson, worldbookNameVal, versionMapJson, req.user.id, packId);
        }
        return true;
      }
      
      if (action === 'unsubscribe') {
        if (existing) {
          db.prepare(`DELETE FROM workshop_subscriptions WHERE user_id = ? AND pack_id = ?`).run(req.user.id, packId);
          db.prepare(`UPDATE workshop_packs SET sub_count = MAX(0, sub_count - 1) WHERE id = ?`).run(packId);
        }
        return false;
      }

      // Default toggle behavior（向后兼容）
      if (existing) {
        db.prepare(`DELETE FROM workshop_subscriptions WHERE user_id = ? AND pack_id = ?`).run(req.user.id, packId);
        db.prepare(`UPDATE workshop_packs SET sub_count = MAX(0, sub_count - 1) WHERE id = ?`).run(packId);
        return false;
      } else {
        db.prepare(`
          INSERT INTO workshop_subscriptions (user_id, pack_id, selected_entry_ids, worldbook_name, synced_version_map, last_synced_at) 
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(req.user.id, packId, entryIdsJson, worldbookNameVal, versionMapJson);
        db.prepare(`UPDATE workshop_packs SET sub_count = sub_count + 1 WHERE id = ?`).run(packId);
        return true;
      }
    });

    const subscribed = toggleSub();
    const row = db.prepare(`SELECT sub_count FROM workshop_packs WHERE id = ?`).get(packId);
    res.json({ subscribed, sub_count: row.sub_count });
  } catch (err) {
    console.error('[Workshop] 订阅操作失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/workshop/packs/:packId/sync — 同步更新（应用所有变更到订阅记录）
router.post('/packs/:packId/sync', requireAuth, (req, res) => {
  const db = getDb();
  const packId = parseInt(req.params.packId);
  if (isNaN(packId)) return res.status(400).json({ error: '无效的模组 ID' });

  const pack = db.prepare(`SELECT id FROM workshop_packs WHERE id = ?`).get(packId);
  if (!pack) return res.status(404).json({ error: '模组不存在' });

  // 获取用户订阅
  const subscription = db.prepare(`
    SELECT selected_entry_ids, synced_version_map 
    FROM workshop_subscriptions 
    WHERE user_id = ? AND pack_id = ?
  `).get(req.user.id, packId);

  if (!subscription) {
    return res.status(400).json({ error: '您尚未订阅此模组' });
  }

  const { worldbook_name } = req.body || {};
  const worldbookNameVal = String(worldbook_name || '').trim();

  try {
    // 获取模组当前所有活跃条目
    const activeEntries = db.prepare(`
      SELECT id, version FROM workshop_entries 
      WHERE pack_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
    `).all(packId);

    // 构建新的选中条目 ID 列表和版本映射
    const newSelectedIds = activeEntries.map(e => e.id);
    const newVersionMap = {};
    activeEntries.forEach(e => {
      newVersionMap[String(e.id)] = e.version || 1;
    });

    // 更新订阅记录
    db.prepare(`
      UPDATE workshop_subscriptions 
      SET selected_entry_ids = ?, synced_version_map = ?, worldbook_name = ?, last_synced_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND pack_id = ?
    `).run(
      JSON.stringify(newSelectedIds),
      JSON.stringify(newVersionMap),
      worldbookNameVal,
      req.user.id,
      packId
    );

    res.json({
      success: true,
      message: '同步成功',
      selected_entry_ids: newSelectedIds,
      synced_version_map: newVersionMap,
    });
  } catch (err) {
    console.error('[Workshop] 同步失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/workshop/packs/:packId/sync-selective — 选择性同步更新（仅更新指定条目）
router.post('/packs/:packId/sync-selective', requireAuth, (req, res) => {
  const db = getDb();
  const packId = parseInt(req.params.packId);
  if (isNaN(packId)) return res.status(400).json({ error: '无效的模组 ID' });

  const pack = db.prepare(`SELECT id FROM workshop_packs WHERE id = ?`).get(packId);
  if (!pack) return res.status(404).json({ error: '模组不存在' });

  // 获取用户订阅
  const subscription = db.prepare(`
    SELECT selected_entry_ids, synced_version_map 
    FROM workshop_subscriptions 
    WHERE user_id = ? AND pack_id = ?
  `).get(req.user.id, packId);

  if (!subscription) {
    return res.status(400).json({ error: '您尚未订阅此模组' });
  }

  const { entry_ids, worldbook_name } = req.body || {};
  
  if (!Array.isArray(entry_ids)) {
    return res.status(400).json({ error: '参数 entry_ids 必须是数组' });
  }

  const worldbookNameVal = String(worldbook_name || '').trim();

  try {
    // 解析当前订阅状态
    const selectedIds = JSON.parse(subscription.selected_entry_ids || '[]');
    const syncedVersions = JSON.parse(subscription.synced_version_map || '{}');
    const selectedIdSet = new Set(selectedIds.map(id => Number(id)));

    // 获取模组所有条目（包括已删除的）
    const allEntries = db.prepare(`
      SELECT * FROM workshop_entries WHERE pack_id = ?
    `).all(packId);

    // 构建条目映射
    const entryMap = {};
    allEntries.forEach(entry => {
      entryMap[entry.id] = entry;
    });

    // 分类用户选择的条目
    const changesApplied = {
      new: [],       // 新增的条目（完整数据）
      modified: [],  // 修改的条目（完整数据）
      deleted: []    // 删除的条目ID
    };

    // 新的 selected_entry_ids 和 synced_version_map
    const newSelectedIds = [...selectedIds];
    const newSyncedVersions = { ...syncedVersions };

    // 遍历用户选中的条目ID
    for (const entryId of entry_ids) {
      const entryIdNum = Number(entryId);
      const entry = entryMap[entryIdNum];

      if (!entry) continue; // 条目不存在，跳过

      const currentVersion = entry.version || 1;
      const syncedVersion = syncedVersions[String(entryIdNum)];
      const wasSelected = selectedIdSet.has(entryIdNum);

      if (entry.is_deleted) {
        // 用户选择删除此条目
        if (wasSelected) {
          // 从订阅列表移除
          const index = newSelectedIds.indexOf(entryIdNum);
          if (index !== -1) {
            newSelectedIds.splice(index, 1);
          }
          delete newSyncedVersions[String(entryIdNum)];
          changesApplied.deleted.push(entryIdNum);
        }
      } else if (!wasSelected) {
        // 新增条目：用户之前未订阅过
        newSelectedIds.push(entryIdNum);
        newSyncedVersions[String(entryIdNum)] = currentVersion;
        changesApplied.new.push(formatEntry(entry));
      } else if (syncedVersion !== undefined && currentVersion > syncedVersion) {
        // 修改的条目：更新版本号
        newSyncedVersions[String(entryIdNum)] = currentVersion;
        changesApplied.modified.push(formatEntry(entry));
      }
    }

    // 使用事务更新数据库
    const updateSubscription = db.transaction(() => {
      db.prepare(`
        UPDATE workshop_subscriptions 
        SET selected_entry_ids = ?, synced_version_map = ?, worldbook_name = ?, last_synced_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND pack_id = ?
      `).run(
        JSON.stringify(newSelectedIds),
        JSON.stringify(newSyncedVersions),
        worldbookNameVal,
        req.user.id,
        packId
      );
    });

    updateSubscription();

    res.json({
      success: true,
      message: '选择性同步成功',
      selected_entry_ids: newSelectedIds,
      synced_version_map: newSyncedVersions,
      changes_applied: changesApplied,
    });
  } catch (err) {
    console.error('[Workshop] 选择性同步失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── 条目路由（必须在 /:packId 之前定义，防止路由冲突）────────────────

// POST /api/workshop/packs/:packId/entries — 新建条目（需登录，且为 pack 作者）
router.post('/packs/:packId/entries', requireAuth, (req, res) => {
  const db = getDb();
  const packId = parseInt(req.params.packId);
  if (isNaN(packId)) return res.status(400).json({ error: '无效的模组 ID' });

  const pack = db.prepare(`SELECT author_id FROM workshop_packs WHERE id = ?`).get(packId);
  if (!pack) return res.status(404).json({ error: '模组不存在' });
  
  // 只有模组作者或管理员才能添加条目
  const isPackAuthor = pack.author_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isPackAuthor && !isAdmin) {
    return res.status(403).json({ error: '只有模组作者或管理员才能添加条目' });
  }

  const {
    name, entry_type, extra_data, enabled, content, strategy_type,
    keys, keys_secondary_logic, keys_secondary,
    scan_depth, position_type, position_order, position_depth, position_role,
    probability,
    recursion_prevent_incoming, recursion_prevent_outgoing, recursion_delay_until,
    effect_sticky, effect_cooldown, effect_delay,
  } = req.body;

  if (!name || !String(name).trim()) return res.status(400).json({ error: '条目名称不能为空' });
  if (String(name).trim().length > 200) return res.status(400).json({ error: '条目名称不能超过 200 字' });
  if (strategy_type && !VALID_STRATEGY_TYPES.includes(strategy_type)) return res.status(400).json({ error: '无效的策略类型' });
  if (position_type && !VALID_POSITION_TYPES.includes(position_type)) return res.status(400).json({ error: '无效的位置类型' });
  if (keys_secondary_logic && !VALID_LOGICS.includes(keys_secondary_logic)) return res.status(400).json({ error: '无效的逻辑类型' });
  if (position_role && !VALID_ROLES.includes(position_role)) return res.status(400).json({ error: '无效的角色类型' });

  const keysJson = JSON.stringify(Array.isArray(keys) ? keys : []);
  const keysSecondaryJson = JSON.stringify(Array.isArray(keys_secondary) ? keys_secondary : []);
  const entryName = String(name).trim();

  try {
    const createEntry = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO workshop_entries (
          pack_id, author_id, name, entry_type, extra_data, enabled, content, strategy_type,
          keys, keys_secondary_logic, keys_secondary,
          scan_depth, position_type, position_order, position_depth, position_role,
          probability,
          recursion_prevent_incoming, recursion_prevent_outgoing, recursion_delay_until,
          effect_sticky, effect_cooldown, effect_delay,
          version, updated_at, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 0)
      `).run(
        packId, req.user.id,
        entryName,
        entry_type || 'worldbook',
        JSON.stringify(extra_data || {}),
        enabled !== false ? 1 : 0,
        String(content || ''),
        strategy_type || 'selective',
        keysJson,
        keys_secondary_logic || 'and_any',
        keysSecondaryJson,
        scan_depth || 'same_as_global',
        position_type || 'after_character_definition',
        parseInt(position_order) || 100,
        parseInt(position_depth) || 4,
        position_role || 'system',
        Math.min(100, Math.max(0, parseInt(probability) ?? 100)),
        recursion_prevent_incoming ? 1 : 0,
        recursion_prevent_outgoing ? 1 : 0,
        recursion_delay_until || null,
        effect_sticky || null,
        effect_cooldown || null,
        effect_delay || null
      );

      // 更新 pack 的 updated_at
      db.prepare(`UPDATE workshop_packs SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(packId);

      return info.lastInsertRowid;
    });

    const entryId = createEntry();
    res.status(201).json({ data: { id: entryId }, message: '条目添加成功' });
  } catch (err) {
    console.error('[Workshop] 添加条目失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/workshop/packs/:packId/entries/batch — 批量新建条目（仅作者）
router.post('/packs/:packId/entries/batch', requireAuth, (req, res) => {
  const db = getDb();
  const packId = parseInt(req.params.packId);
  if (isNaN(packId)) return res.status(400).json({ error: '无效的模组 ID' });

  const pack = db.prepare(`SELECT author_id FROM workshop_packs WHERE id = ?`).get(packId);
  if (!pack) return res.status(404).json({ error: '模组不存在' });
  
  const isPackAuthor = pack.author_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isPackAuthor && !isAdmin) {
    return res.status(403).json({ error: '只有模组作者或管理员才能批量添加条目' });
  }

  const { entries } = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ error: '数据格式错误，应为数组' });

  try {
    const insert = db.prepare(`
      INSERT INTO workshop_entries (
        pack_id, author_id, name, entry_type, extra_data, enabled, content, strategy_type,
        keys, keys_secondary_logic, keys_secondary,
        scan_depth, position_type, position_order, position_depth, position_role,
        probability,
        recursion_prevent_incoming, recursion_prevent_outgoing, recursion_delay_until,
        effect_sticky, effect_cooldown, effect_delay
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const batchInsert = db.transaction((data) => {
      for (const entry of data) {
        if (!entry.name) continue;
        insert.run(
          packId, req.user.id,
          String(entry.name).trim().substring(0, 200),
          entry.entry_type || 'worldbook',
          JSON.stringify(entry.extra_data || {}),
          entry.enabled !== false ? 1 : 0,
          String(entry.content || ''),
          entry.strategy_type || 'selective',
          JSON.stringify(Array.isArray(entry.keys) ? entry.keys : []),
          entry.keys_secondary_logic || 'and_any',
          JSON.stringify(Array.isArray(entry.keys_secondary) ? entry.keys_secondary : []),
          entry.scan_depth || 'same_as_global',
          entry.position_type || 'after_character_definition',
          parseInt(entry.position_order) || 100,
          parseInt(entry.position_depth) || 4,
          entry.position_role || 'system',
          Math.min(100, Math.max(0, parseInt(entry.probability) ?? 100)),
          entry.recursion_prevent_incoming ? 1 : 0,
          entry.recursion_prevent_outgoing ? 1 : 0,
          entry.recursion_delay_until || null,
          entry.effect_sticky || null,
          entry.effect_cooldown || null,
          entry.effect_delay || null
        );
      }
    });

    batchInsert(entries);

    // 更新 pack 的 updated_at
    db.prepare(`UPDATE workshop_packs SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(packId);

    res.status(201).json({ message: `成功导入 ${entries.length} 条条目` });
  } catch (err) {
    console.error('[Workshop] 批量添加条目失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// GET /api/workshop/entries/:entryId — 获取单条条目
router.get('/entries/:entryId', (req, res) => {
  const db = getDb();
  const entryId = parseInt(req.params.entryId);
  if (isNaN(entryId)) return res.status(400).json({ error: '无效的条目 ID' });

  const row = db.prepare(`SELECT * FROM workshop_entries WHERE id = ?`).get(entryId);
  if (!row) return res.status(404).json({ error: '条目不存在' });

  res.json({ data: formatEntry(row) });
});

// PUT /api/workshop/entries/:entryId — 编辑条目（仅 pack 作者）
router.put('/entries/:entryId', requireAuth, (req, res) => {
  const db = getDb();
  const entryId = parseInt(req.params.entryId);
  if (isNaN(entryId)) return res.status(400).json({ error: '无效的条目 ID' });

  const existing = db.prepare(`SELECT e.*, p.author_id as pack_author_id FROM workshop_entries e JOIN workshop_packs p ON e.pack_id = p.id WHERE e.id = ?`).get(entryId);
  if (!existing) return res.status(404).json({ error: '条目不存在' });
  
  // 条目作者、模组作者或管理员均可编辑
  const isEntryAuthor = existing.author_id === req.user.id;
  const isPackAuthor = existing.pack_author_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isEntryAuthor && !isPackAuthor && !isAdmin) {
    return res.status(403).json({ error: '无权编辑此条目' });
  }

  const {
    name, entry_type, extra_data, enabled, content, strategy_type,
    keys, keys_secondary_logic, keys_secondary,
    scan_depth, position_type, position_order, position_depth, position_role,
    probability,
    recursion_prevent_incoming, recursion_prevent_outgoing, recursion_delay_until,
    effect_sticky, effect_cooldown, effect_delay,
  } = req.body;

  if (!name || !String(name).trim()) return res.status(400).json({ error: '条目名称不能为空' });

  const keysJson = JSON.stringify(Array.isArray(keys) ? keys : []);
  const keysSecondaryJson = JSON.stringify(Array.isArray(keys_secondary) ? keys_secondary : []);
  const entryName = String(name).trim();
  const oldVersion = existing.version || 1;
  const newVersion = oldVersion + 1;

  try {
    const updateEntry = db.transaction(() => {
      // 1. 创建旧版本快照
      createEntryVersionSnapshot(db, existing, req.user.id);

      // 2. 更新条目并递增版本号
      db.prepare(`
        UPDATE workshop_entries SET
          name = ?, entry_type = ?, extra_data = ?, enabled = ?, content = ?, strategy_type = ?,
          keys = ?, keys_secondary_logic = ?, keys_secondary = ?,
          scan_depth = ?, position_type = ?, position_order = ?, position_depth = ?, position_role = ?,
          probability = ?,
          recursion_prevent_incoming = ?, recursion_prevent_outgoing = ?, recursion_delay_until = ?,
          effect_sticky = ?, effect_cooldown = ?, effect_delay = ?,
          version = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        entryName,
        entry_type || 'worldbook',
        JSON.stringify(extra_data || {}),
        enabled !== false ? 1 : 0,
        String(content || ''),
        strategy_type || 'selective',
        keysJson,
        keys_secondary_logic || 'and_any',
        keysSecondaryJson,
        scan_depth || 'same_as_global',
        position_type || 'after_character_definition',
        parseInt(position_order) || 100,
        parseInt(position_depth) || 4,
        position_role || 'system',
        Math.min(100, Math.max(0, parseInt(probability) ?? 100)),
        recursion_prevent_incoming ? 1 : 0,
        recursion_prevent_outgoing ? 1 : 0,
        recursion_delay_until || null,
        effect_sticky || null,
        effect_cooldown || null,
        effect_delay || null,
        newVersion,
        entryId
      );

      // 3. 更新 pack 的 updated_at
      db.prepare(`UPDATE workshop_packs SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(existing.pack_id);
    });

    updateEntry();
    res.json({ message: '条目更新成功', version: newVersion });
  } catch (err) {
    console.error('[Workshop] 更新条目失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// DELETE /api/workshop/entries/:entryId — 软删除条目（仅 pack 作者）
router.delete('/entries/:entryId', requireAuth, (req, res) => {
  const db = getDb();
  const entryId = parseInt(req.params.entryId);
  if (isNaN(entryId)) return res.status(400).json({ error: '无效的条目 ID' });

  const existing = db.prepare(`SELECT e.*, p.author_id as pack_author_id FROM workshop_entries e JOIN workshop_packs p ON e.pack_id = p.id WHERE e.id = ?`).get(entryId);
  if (!existing) return res.status(404).json({ error: '条目不存在' });
  
  // 条目作者、模组作者或管理员均可删除
  const isEntryAuthor = existing.author_id === req.user.id;
  const isPackAuthor = existing.pack_author_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isEntryAuthor && !isPackAuthor && !isAdmin) {
    return res.status(403).json({ error: '无权删除此条目' });
  }

  // 如果已经是删除状态，直接返回成功
  if (existing.is_deleted) {
    return res.json({ success: true, message: '条目已删除' });
  }

  const oldVersion = existing.version || 1;
  const newVersion = oldVersion + 1;

  try {
    const softDelete = db.transaction(() => {
      // 1. 创建删除前的版本快照
      createEntryVersionSnapshot(db, existing, req.user.id);

      // 2. 软删除：设置 is_deleted = 1，并递增版本号
      db.prepare(`
        UPDATE workshop_entries 
        SET is_deleted = 1, version = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(newVersion, entryId);

      // 3. 更新 pack 的 updated_at
      db.prepare(`UPDATE workshop_packs SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(existing.pack_id);
    });

    softDelete();
    res.json({ success: true, message: '条目已删除' });
  } catch (err) {
    console.error('[Workshop] 删除条目失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── 版本历史和变更检测路由 ────────────────────────────────────────────

// GET /api/workshop/packs/:packId/changes — 获取模组变更（对比用户订阅状态）
router.get('/packs/:packId/changes', requireAuth, (req, res) => {
  const db = getDb();
  const packId = parseInt(req.params.packId);
  if (isNaN(packId)) return res.status(400).json({ error: '无效的模组 ID' });

  const pack = db.prepare(`SELECT id FROM workshop_packs WHERE id = ?`).get(packId);
  if (!pack) return res.status(404).json({ error: '模组不存在' });

  // 获取用户订阅信息
  const subscription = db.prepare(`
    SELECT selected_entry_ids, synced_version_map, last_synced_at 
    FROM workshop_subscriptions 
    WHERE user_id = ? AND pack_id = ?
  `).get(req.user.id, packId);

  if (!subscription) {
    return res.status(400).json({ error: '您尚未订阅此模组' });
  }

  try {
    const selectedIds = JSON.parse(subscription.selected_entry_ids || '[]');
    const syncedVersions = JSON.parse(subscription.synced_version_map || '{}');
    const selectedIdSet = new Set(selectedIds.map(id => Number(id)));

    // 获取模组当前所有条目（包括已删除的，用于检测删除）
    const allEntries = db.prepare(`
      SELECT * FROM workshop_entries WHERE pack_id = ?
    `).all(packId);

    // 分类变更
    const newEntries = [];      // 新增的条目（用户未订阅过的）
    const modifiedEntries = []; // 修改的条目（版本号变化）
    const deletedEntries = [];  // 删除的条目（用户订阅过但被软删除）

    for (const entry of allEntries) {
      const entryId = entry.id;
      const currentVersion = entry.version || 1;
      const syncedVersion = syncedVersions[String(entryId)];
      const wasSelected = selectedIdSet.has(entryId);

      if (entry.is_deleted) {
        // 条目被删除：检查用户是否曾订阅过
        if (wasSelected) {
          deletedEntries.push(formatEntry(entry));
        }
      } else if (!wasSelected) {
        // 新增条目：用户未订阅过
        newEntries.push(formatEntry(entry));
      } else if (syncedVersion !== undefined && currentVersion > syncedVersion) {
        // 修改的条目：版本号增加了
        modifiedEntries.push({
          ...formatEntry(entry),
          synced_version: syncedVersion,
        });
      }
    }

    const hasChanges = newEntries.length > 0 || modifiedEntries.length > 0 || deletedEntries.length > 0;

    res.json({
      data: {
        pack_id: packId,
        has_changes: hasChanges,
        summary: {
          new: newEntries.length,
          modified: modifiedEntries.length,
          deleted: deletedEntries.length,
        },
        changes: {
          new: newEntries,
          modified: modifiedEntries,
          deleted: deletedEntries,
        },
        last_synced_at: subscription.last_synced_at,
      },
    });
  } catch (err) {
    console.error('[Workshop] 获取变更失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;

