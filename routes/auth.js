// routes/auth.js
const express = require('express');
const router = express.Router();
const csurf = require('csurf');
const UserManager = require('../utils/userManager');

const userManager = new UserManager();

// CSRF for auth forms
router.use(csurf({ cookie: true }));

// Show login form
router.get('/login', (req, res) => {
  res.render('login', { csrfToken: req.csrfToken(), error: null });
});

// Handle login submit
router.post('/login', express.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body || {};
  
  if (!username || !password) {
    return res.status(400).render('login', { 
      csrfToken: req.csrfToken(), 
      error: 'Username and password are required' 
    });
  }

  try {
    // Attempt authentication with enhanced security
    const authResult = await userManager.authenticateUser(
      username, 
      password, 
      req.ip, 
      req.get('User-Agent')
    );

    if (authResult.success) {
      // Set session with full user data
      req.session.user = authResult.user;
      
      // Log successful login
      await userManager.logUserAction(authResult.user.id, 'LOGIN_SUCCESS', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Redirect to admin dashboard
      return res.redirect('/admin');
    } else {
      // Authentication failed - render error
      return res.status(401).render('login', { 
        csrfToken: req.csrfToken(), 
        error: authResult.message 
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    
    // Log the failed attempt if we can identify the user
    try {
      const user = await userManager.getUserByUsername(username);
      if (user) {
        await userManager.logUserAction(user.id, 'LOGIN_ERROR', {
          error: error.message,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      }
    } catch (logError) {
      console.error('Failed to log login error:', logError);
    }

    return res.status(500).render('login', { 
      csrfToken: req.csrfToken(), 
      error: 'An error occurred during login. Please try again.' 
    });
  }
});

// Logout (destroys session, then redirects to /login)
router.post('/logout', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    // Log logout action if user is authenticated
    if (req.session && req.session.user) {
      await userManager.logUserAction(req.session.user.id, 'LOGOUT', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    }
  } catch (error) {
    console.error('Error logging logout:', error);
  }

  // Destroy session and redirect
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;