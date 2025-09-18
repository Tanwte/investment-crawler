const { query, validationResult } = require('express-validator');

const searchValidation = [
  query('q').trim().isLength({ min: 1, max: 80 }).matches(/^[\w\s\-.,$()]+$/i),
  query('page').optional().toInt().isInt({ min: 1, max: 200 }),
  query('size').optional().toInt().isInt({ min: 1, max: 50 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).send('Bad params');
    next();
  }
];

module.exports = { searchValidation };