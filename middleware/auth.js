const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const verifyLedgerAccess = async (req, res, next) => {
  try {
    const { id: ledgerId } = req.params;
    const userId = req.user._id;

    const Ledger = require('../models/Ledger');
    const ledger = await Ledger.findById(ledgerId);

    if (!ledger) {
      return res.status(404).json({ message: 'Ledger not found' });
    }

    // Check if user is part of this ledger
    if (!ledger.user1.equals(userId) && !ledger.user2.equals(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    req.ledger = ledger;
    next();
  } catch (error) {
    console.error('Ledger access verification error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  authenticateToken,
  verifyLedgerAccess
}; 