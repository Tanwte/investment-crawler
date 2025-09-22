// routes/admin/users.js - User management routes for admin
const express = require('express');
const router = express.Router();
const { requireAdmin, logUserAction } = require('../../middleware/auth');
const UserManager = require('../../utils/userManager');
const { queryWithRetry } = require('../../utils/dbRetry');
const csurf = require('csurf');

// Apply CSRF protection and admin authentication to all routes
router.use(requireAdmin);
router.use(csurf({ cookie: true }));

// List all users
router.get('/', async (req, res) => {
  try {
    const users = await UserManager.getAllUsers();
    res.render('admin/users/index', { 
      users, 
      csrfToken: req.csrfToken(),
      user: req.session.user 
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).render('error', { 
      message: 'Failed to load users',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// Show create user form
router.get('/create', (req, res) => {
  res.render('admin/users/create', { 
    csrfToken: req.csrfToken(),
    user: req.session.user,
    error: null
  });
});

// Handle create user
router.post('/create', express.urlencoded({ extended: false }), async (req, res) => {
  const { username, password, email, full_name, role } = req.body;
  
  try {
    // Validate input
    if (!username || !password || !email || !role) {
      return res.render('admin/users/create', {
        csrfToken: req.csrfToken(),
        user: req.session.user,
        error: 'All fields are required'
      });
    }

    if (password.length < 6) {
      return res.render('admin/users/create', {
        csrfToken: req.csrfToken(),
        user: req.session.user,
        error: 'Password must be at least 6 characters long'
      });
    }

    if (!['admin', 'user'].includes(role)) {
      return res.render('admin/users/create', {
        csrfToken: req.csrfToken(),
        user: req.session.user,
        error: 'Invalid role selected'
      });
    }

    // Create the user
    const newUser = await UserManager.createUser(req.session.user.id, {
      username,
      password,
      email,
      full_name,
      role
    });

    // Log the action
    await UserManager.logUserAction(req.session.user.id, 'CREATE_USER_SUCCESS', {
      target_user: username,
      role: role,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.redirect('/admin/users?created=' + encodeURIComponent(username));
  } catch (error) {
    console.error('Error creating user:', error);
    
    // Log the failed attempt
    await UserManager.logUserAction(req.session.user.id, 'CREATE_USER_FAILED', {
      target_user: username,
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.render('admin/users/create', {
      csrfToken: req.csrfToken(),
      user: req.session.user,
      error: error.message
    });
  }
});

// Show edit user form
router.get('/:id/edit', async (req, res) => {
  try {
    const user = await UserManager.getUserById(req.params.id);
    if (!user) {
      return res.status(404).render('error', { 
        message: 'User not found',
        error: {}
      });
    }

    res.render('admin/users/edit', { 
      editUser: user,
      csrfToken: req.csrfToken(),
      user: req.session.user,
      error: null
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).render('error', { 
      message: 'Failed to load user',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// Handle update user
router.post('/:id/edit', express.urlencoded({ extended: false }), async (req, res) => {
  const userId = req.params.id;
  const { email, full_name, role, is_active } = req.body;
  
  try {
    // Validate role
    if (!['admin', 'user'].includes(role)) {
      const user = await UserManager.getUserById(userId);
      return res.render('admin/users/edit', {
        editUser: user,
        csrfToken: req.csrfToken(),
        user: req.session.user,
        error: 'Invalid role selected'
      });
    }

    // Update the user
    const updates = {
      email,
      full_name,
      role,
      is_active: is_active === 'on'
    };

    const updatedUser = await UserManager.updateUser(req.session.user.id, userId, updates);

    // Log the action
    await UserManager.logUserAction(req.session.user.id, 'UPDATE_USER_SUCCESS', {
      target_user: updatedUser.username,
      changes: updates,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.redirect('/admin/users?updated=' + encodeURIComponent(updatedUser.username));
  } catch (error) {
    console.error('Error updating user:', error);
    
    // Log the failed attempt
    await UserManager.logUserAction(req.session.user.id, 'UPDATE_USER_FAILED', {
      target_user_id: userId,
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const user = await UserManager.getUserById(userId);
    res.render('admin/users/edit', {
      editUser: user,
      csrfToken: req.csrfToken(),
      user: req.session.user,
      error: error.message
    });
  }
});

// Handle delete user
router.post('/:id/delete', express.urlencoded({ extended: false }), async (req, res) => {
  const userId = req.params.id;
  
  try {
    // Prevent self-deletion
    if (parseInt(userId) === req.session.user.id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete your own account' 
      });
    }

    // Delete the user
    const result = await UserManager.deleteUser(req.session.user.id, userId);

    // Log the action
    await UserManager.logUserAction(req.session.user.id, 'DELETE_USER_SUCCESS', {
      target_user_id: userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.redirect('/admin/users?deleted=true');
  } catch (error) {
    console.error('Error deleting user:', error);
    
    // Log the failed attempt
    await UserManager.logUserAction(req.session.user.id, 'DELETE_USER_FAILED', {
      target_user_id: userId,
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Show reset password form
router.get('/:id/reset-password', async (req, res) => {
  try {
    const user = await UserManager.getUserById(req.params.id);
    if (!user) {
      return res.status(404).render('error', { 
        message: 'User not found',
        error: {}
      });
    }

    res.render('admin/users/reset-password', { 
      editUser: user,
      csrfToken: req.csrfToken(),
      user: req.session.user,
      error: null
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).render('error', { 
      message: 'Failed to load user',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// Handle password reset
router.post('/:id/reset-password', express.urlencoded({ extended: false }), async (req, res) => {
  const userId = req.params.id;
  const { new_password, confirm_password } = req.body;
  
  try {
    const user = await UserManager.getUserById(userId);
    if (!user) {
      return res.status(404).render('error', { 
        message: 'User not found',
        error: {}
      });
    }

    // Validate password
    if (!new_password || new_password.length < 6) {
      return res.render('admin/users/reset-password', {
        editUser: user,
        csrfToken: req.csrfToken(),
        user: req.session.user,
        error: 'Password must be at least 6 characters long'
      });
    }

    if (new_password !== confirm_password) {
      return res.render('admin/users/reset-password', {
        editUser: user,
        csrfToken: req.csrfToken(),
        user: req.session.user,
        error: 'Passwords do not match'
      });
    }

    // Reset the password using static method
    await UserManager.updateUserPassword(user.username, new_password);

    // Log the action
    await UserManager.logUserAction(req.session.user.id, 'RESET_PASSWORD_SUCCESS', {
      target_user: user.username,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.redirect('/admin/users?password_reset=' + encodeURIComponent(user.username));
  } catch (error) {
    console.error('Error resetting password:', error);
    
    // Log the failed attempt
    await UserManager.logUserAction(req.session.user.id, 'RESET_PASSWORD_FAILED', {
      target_user_id: userId,
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const user = await UserManager.getUserById(userId);
    res.render('admin/users/reset-password', {
      editUser: user,
      csrfToken: req.csrfToken(),
      user: req.session.user,
      error: error.message
    });
  }
});

// Lock user account
router.post('/:id/lock', express.urlencoded({ extended: false }), async (req, res) => {
  const userId = req.params.id;
  
  try {
    // Prevent locking yourself
    if (parseInt(userId) === req.session.user.id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot lock your own account' 
      });
    }

    // Lock the account
    await queryWithRetry(
      `UPDATE users 
       SET account_locked = true 
       WHERE id = $1`,
      [userId]
    );

    // Log the action
    await UserManager.logUserAction(req.session.user.id, 'LOCK_ACCOUNT_SUCCESS', {
      target_user_id: userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.redirect('/admin/users?locked=true');
  } catch (error) {
    console.error('Error locking account:', error);
    
    // Log the failed attempt
    await UserManager.logUserAction(req.session.user.id, 'LOCK_ACCOUNT_FAILED', {
      target_user_id: userId,
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Unlock user account
router.post('/:id/unlock', express.urlencoded({ extended: false }), async (req, res) => {
  const userId = req.params.id;
  
  try {
    await UserManager.updateUser(req.session.user.id, userId, {
      is_active: true
    });

    // Also reset failed attempts and unlock account
    await queryWithRetry(
      `UPDATE users 
       SET failed_login_attempts = 0, account_locked = false 
       WHERE id = $1`,
      [userId]
    );

    // Log the action
    await UserManager.logUserAction(req.session.user.id, 'UNLOCK_ACCOUNT_SUCCESS', {
      target_user_id: userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.redirect('/admin/users?unlocked=true');
  } catch (error) {
    console.error('Error unlocking account:', error);
    
    // Log the failed attempt
    await UserManager.logUserAction(req.session.user.id, 'UNLOCK_ACCOUNT_FAILED', {
      target_user_id: userId,
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// View audit log
router.get('/audit-log', async (req, res) => {
  try {
    const auditLog = await UserManager.getUserAuditLog(100);
    res.render('admin/users/audit-log', { 
      auditLog,
      csrfToken: req.csrfToken(),
      user: req.session.user
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).render('error', { 
      message: 'Failed to load audit log',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

module.exports = router;