const { verifyToken } = require('../utils/jwt');
const { getDb } = require('../db/init');

/**
 * 认证中间件 - 同时支持 JWT Token 和 Session Cookie
 * 优先检查 JWT Token（用于 iframe 跨域场景）
 * 回退到 Session 认证（用于传统浏览器直接访问）
 * 如果没有认证或认证无效，直接返回 401
 */
function requireAuth(req, res, next) {
  // 1. 优先检查 JWT Token（Authorization: Bearer xxx）
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload && payload.id) {
      try {
        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
        if (user) {
          if (user.is_banned) {
            return res.status(403).json({ error: 'Forbidden', message: '您的账号已被封禁' });
          }
          req.user = user;
          return next();
        }
      } catch (err) {
        console.error('[Auth] 数据库查询用户失败:', err);
      }
    }
    return res.status(401).json({ error: 'Unauthorized', message: 'Token 无效或已过期' });
  }

  // 2. 回退到 Session 认证 (Passport)
  if (req.isAuthenticated && req.isAuthenticated()) {
    if (req.user && req.user.is_banned) {
      req.logout(() => {});
      return res.status(403).json({ error: 'Forbidden', message: '您的账号已被封禁' });
    }
    return next();
  }

  res.status(401).json({ error: 'Unauthorized', message: '请先登录' });
}

/**
 * 可选认证中间件 - 尽力而为，不拦截请求
 * 用于公开 API（如获取 Pack 详情），如果用户已登录则填充 req.user 以提供点赞/订阅状态
 */
function optionalAuth(req, res, next) {
  // 1. 优先检查 JWT Token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload && payload.id) {
      try {
        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
        if (user && !user.is_banned) {
          req.user = user;
          return next();
        }
      } catch (err) {
        console.error('[Auth] optionalAuth 数据库查询失败:', err);
      }
    }
    // Token 无效或用户被封禁，忽略，直接进入下一个中间件
    return next();
  }

  // 2. 回退到 Session 认证
  if (req.isAuthenticated && req.isAuthenticated()) {
    if (req.user && !req.user.is_banned) {
      // req.user 已由 Passport 填充，直接进入
      return next();
    }
  }

  // 均未命中，静默通过
  next();
}

module.exports = { requireAuth, optionalAuth };
