const UserManager = require('../utils/userManager');

async function requireAuth(req, res, next) {
  try {
    // Check if user is logged in
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }

    // Verify user still exists and is active
    const user = await UserManager.getUserById(req.session.user.id);
    if (!user || !user.is_active || user.account_locked) {
      // Clear invalid session
      req.session.destroy();
      return res.redirect('/login');
    }

    // Update last activity
    await UserManager.updateLastActivity(user.id, req.ip, req.get('User-Agent'));
    
    // Refresh user data in session
    req.session.user = user;
    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.redirect('/login');
  }
}

async function requireAdmin(req, res, next) {
  try {
    // First check basic auth
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }

    // Verify user exists, is active, and has admin role
    const user = await UserManager.getUserById(req.session.user.id);
    if (!user || !user.is_active || user.account_locked || user.role !== 'admin') {
      // Log unauthorized access attempt
      if (user) {
        await UserManager.logUserAction(user.id, 'UNAUTHORIZED_ADMIN_ACCESS', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
      }
      
      // Clear session and redirect
      req.session.destroy();
      return res.redirect('/login');
    }

    // Update last activity and continue
    await UserManager.updateLastActivity(user.id, req.ip, req.get('User-Agent'));
    req.session.user = user;
    return next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    return res.redirect('/login');
  }
}

// Middleware to log user actions
async function logUserAction(action, details = {}) {
  return async (req, res, next) => {
    if (req.session && req.session.user) {
      try {
        await UserManager.logUserAction(req.session.user.id, action, {
          ...details,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method
        });
      } catch (error) {
        console.error('Failed to log user action:', error);
      }
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, logUserAction };