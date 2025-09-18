const bcrypt = require('bcrypt');
const { queryWithRetry } = require('./dbRetry');

class UserManager {
  // Create a new user (admin only)
  static async createUser(adminUserId, userData) {
    const { username, password, email, full_name, role = 'user' } = userData;
    
    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    try {
      const result = await queryWithRetry(
        `INSERT INTO users (username, password_hash, email, full_name, role, is_active, password_changed_at) 
         VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP) 
         RETURNING id, username, email, full_name, role, created_at`,
        [username, passwordHash, email, full_name, role]
      );
      
      const newUser = result.rows[0];
      
      // Log the action if admin user exists
      if (adminUserId) {
        await this.logUserAction(adminUserId, 'CREATE_USER', {
          target_user: username,
          role: role
        });
      }
      
      return newUser;
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Username already exists');
      }
      throw error;
    }
  }
  
  // Authenticate user
  static async authenticateUser(username, password, ipAddress, userAgent) {
    try {
      // Check if user exists and is active
      const userResult = await queryWithRetry(
        `SELECT id, username, password_hash, role, is_active, failed_login_attempts, account_locked
         FROM users WHERE username = $1`,
        [username]
      );
      
      if (userResult.rows.length === 0) {
        return { success: false, message: 'Invalid username or password' };
      }
      
      const user = userResult.rows[0];
      
      // Check if account is locked
      if (user.account_locked) {
        return { success: false, message: 'Account is locked due to too many failed attempts' };
      }
      
      // Check if account is active
      if (!user.is_active) {
        return { success: false, message: 'Account is disabled' };
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        // Increment failed login attempts
        await this.incrementFailedAttempts(user.id);
        return { success: false, message: 'Invalid username or password' };
      }
      
      // Reset failed attempts and update last login
      await queryWithRetry(
        `UPDATE users 
         SET failed_login_attempts = 0, account_locked = false, last_login = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [user.id]
      );
      
      // Log successful login
      await this.logUserAction(user.id, 'LOGIN_SUCCESS', { 
        ip_address: ipAddress,
        user_agent: userAgent 
      });
      
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          is_active: user.is_active
        }
      };
    } catch (error) {
      throw error;
    }
  }
  
  // Increment failed login attempts
  static async incrementFailedAttempts(userId) {
    const result = await queryWithRetry(
      `UPDATE users 
       SET failed_login_attempts = failed_login_attempts + 1
       WHERE id = $1
       RETURNING failed_login_attempts`,
      [userId]
    );
    
    const attempts = result.rows[0].failed_login_attempts;
    
    // Lock account after 5 failed attempts
    if (attempts >= 5) {
      await queryWithRetry(
        `UPDATE users 
         SET account_locked = true
         WHERE id = $1`,
        [userId]
      );
    }
  }

  // Get user by ID
  static async getUserById(userId) {
    const result = await queryWithRetry(
      `SELECT id, username, email, full_name, role, is_active, account_locked, 
              failed_login_attempts, last_login, created_at
       FROM users WHERE id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  // Get user by username
  static async getUserByUsername(username) {
    const result = await queryWithRetry(
      `SELECT id, username, email, full_name, role, is_active, account_locked, 
              failed_login_attempts, last_login, created_at
       FROM users WHERE username = $1`,
      [username]
    );
    return result.rows[0] || null;
  }

  // Update last activity (for session management)
  static async updateLastActivity(userId, ipAddress, userAgent) {
    await queryWithRetry(
      `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1`,
      [userId]
    );
  }

  // Get all users (admin only)
  static async getAllUsers() {
    const result = await queryWithRetry(
      `SELECT id, username, email, full_name, role, is_active, account_locked,
              failed_login_attempts, last_login, created_at
       FROM users 
       ORDER BY created_at DESC`
    );
    return result.rows;
  }
  
  // Update user (admin only)
  static async updateUser(adminUserId, userId, updates) {
    const allowedFields = ['email', 'full_name', 'role', 'is_active'];
    const updateFields = [];
    const values = [];
    let paramCount = 1;
    
    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        updateFields.push(`${field} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
    
    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    values.push(userId);
    
    const result = await queryWithRetry(
      `UPDATE users 
       SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING id, username, email, full_name, role, is_active`,
      values
    );
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    
    // Log the action
    await this.logUserAction(adminUserId, 'UPDATE_USER', {
      target_user: result.rows[0].username,
      changes: updates
    });
    
    return result.rows[0];
  }
  
  // Delete user (admin only)
  static async deleteUser(adminUserId, userId) {
    const userResult = await queryWithRetry(
      'SELECT username FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const username = userResult.rows[0].username;
    
    await queryWithRetry('DELETE FROM users WHERE id = $1', [userId]);
    
    // Log the action
    await this.logUserAction(adminUserId, 'DELETE_USER', {
      target_user: username
    });
    
    return { success: true, message: `User ${username} deleted successfully` };
  }
  
  // Log user action
  static async logUserAction(userId, action, details = null, ipAddress = null) {
    await queryWithRetry(
      `INSERT INTO user_audit_log (user_id, action, details, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [userId, action, details ? JSON.stringify(details) : null, ipAddress]
    );
  }
  
  // Get user audit log
  static async getUserAuditLog(limit = 100) {
    const result = await queryWithRetry(
      `SELECT ual.*, u.username 
       FROM user_audit_log ual
       LEFT JOIN users u ON ual.user_id = u.id
       ORDER BY ual.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // Update user password (admin function)
  async updateUserPassword(username, newPassword) {
    try {
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);
      
      const result = await queryWithRetry(
        `UPDATE users 
         SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP, 
             failed_login_attempts = 0, account_locked = false
         WHERE username = $2
         RETURNING id, username`,
        [passwordHash, username]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];
      
      // Log password change
      await UserManager.logUserAction(user.id, 'PASSWORD_CHANGED', {
        method: 'admin_update',
        timestamp: new Date().toISOString()
      });

      return { success: true, message: 'Password updated successfully' };
    } catch (error) {
      console.error('Error updating password:', error);
      throw error;
    }
  }

  // Change user password (requires current password)
  static async changeUserPassword(userId, currentPassword, newPassword) {
    try {
      // Verify current password
      const userResult = await queryWithRetry(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword, 
        userResult.rows[0].password_hash
      );

      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await queryWithRetry(
        `UPDATE users 
         SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [passwordHash, userId]
      );

      // Log password change
      await this.logUserAction(userId, 'PASSWORD_CHANGED', {
        method: 'user_self_change',
        timestamp: new Date().toISOString()
      });

      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  }
}

module.exports = UserManager;