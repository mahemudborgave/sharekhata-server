const express = require('express');
const Ledger = require('../models/Ledger');
const User = require('../models/User');
const { authenticateToken, verifyLedgerAccess } = require('../middleware/auth');

const router = express.Router();

// Helper: sort transactions newest-first by createdAt
// ObjectId timestamp is the reliable fallback for old transactions
const sortByCreatedAt = (a, b) => {
  const dateA = a.createdAt ? new Date(a.createdAt) : new Date(parseInt(String(a.id || a._id).substring(0, 8), 16) * 1000);
  const dateB = b.createdAt ? new Date(b.createdAt) : new Date(parseInt(String(b.id || b._id).substring(0, 8), 16) * 1000);
  return dateB - dateA; // newest first
};

// Helper: map a transaction document to response shape
const mapTransaction = (transaction, currentUserMobile) => ({
  id: transaction._id,
  type: transaction.type,
  amount: transaction.amount,
  description: transaction.description,
  timestamp: transaction.timestamp,
  createdAt: transaction.createdAt,
  sentBy: transaction.sentBy,
  receivedBy: transaction.receivedBy,
  addedBy: {
    id: transaction.addedBy._id,
    name: transaction.addedBy.name,
    avatar: transaction.addedBy.avatar || transaction.addedBy.getInitials()
  },
  isOwnTransaction: transaction.sentBy === currentUserMobile || transaction.receivedBy === currentUserMobile
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Sharekhata API is running 🚀' });
});

// GET /ledger/:id - Get ledger with transactions
router.get('/:id', verifyLedgerAccess, async (req, res) => {
  try {
    const { ledger } = req;
    const currentUserId = req.user._id;
    const currentUserMobile = req.user.mobile;

    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    const balance = ledger.getBalanceForUser(currentUserMobile);
    const breakdown = ledger.getBalanceBreakdown();

    const formattedTransactions = ledger.transactions
      .map(t => mapTransaction(t, currentUserMobile))
      .sort(sortByCreatedAt);

    res.json({
      ledger: {
        id: ledger._id,
        balance,
        friend: {
          id: otherUser._id,
          name: otherUser.name,
          mobile: otherUser.mobile,
          avatar: otherUser.avatar || otherUser.getInitials()
        },
        transactions: formattedTransactions,
        lastUpdated: ledger.lastUpdated,
        debug: breakdown
      }
    });
  } catch (error) {
    console.error('❌ GET LEDGER - ERROR:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /ledger/:id/add - Add transaction (I paid)
router.post('/:id/add', verifyLedgerAccess, async (req, res) => {
  try {
    const { ledger } = req;
    const { amount, description = '', date } = req.body;
    const currentUserId = req.user._id;
    const currentUserMobile = req.user.mobile;

    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    const otherUserMobile = otherUser.mobile;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    await ledger.addTransaction('added', amount, currentUserMobile, otherUserMobile, currentUserId, description, date);
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    const balance = ledger.getBalanceForUser(currentUserMobile);
    const io = req.app.get('io');

    const socketData = {
      ledgerId: ledger._id,
      balance,
      friend: {
        id: otherUser._id,
        name: otherUser.name,
        mobile: otherUser.mobile,
        avatar: otherUser.avatar || otherUser.getInitials()
      },
      transactions: ledger.transactions
        .map(t => mapTransaction(t, currentUserMobile))
        .sort(sortByCreatedAt),
      lastUpdated: ledger.lastUpdated
    };

    io.to(ledger._id.toString()).emit('ledger-updated', socketData);

    res.json({
      message: 'Transaction added successfully',
      balance,
      transaction: {
        id: ledger.transactions[ledger.transactions.length - 1]._id,
        type: 'added',
        amount,
        description,
        sentBy: currentUserMobile,
        receivedBy: otherUserMobile,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('❌ ADD TRANSACTION - ERROR:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /ledger/:id/receive - Add transaction (I received)
router.post('/:id/receive', verifyLedgerAccess, async (req, res) => {
  try {
    const { ledger } = req;
    const { amount, description = '', date } = req.body;
    const currentUserId = req.user._id;
    const currentUserMobile = req.user.mobile;

    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    const otherUserMobile = otherUser.mobile;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    await ledger.addTransaction('received', amount, otherUserMobile, currentUserMobile, currentUserId, description, date);
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    const balance = ledger.getBalanceForUser(currentUserMobile);
    const io = req.app.get('io');

    const socketData = {
      ledgerId: ledger._id,
      balance,
      friend: {
        id: otherUser._id,
        name: otherUser.name,
        mobile: otherUser.mobile,
        avatar: otherUser.avatar || otherUser.getInitials()
      },
      transactions: ledger.transactions
        .map(t => mapTransaction(t, currentUserMobile))
        .sort(sortByCreatedAt),
      lastUpdated: ledger.lastUpdated
    };

    io.to(ledger._id.toString()).emit('ledger-updated', socketData);

    res.json({
      message: 'Transaction added successfully',
      balance,
      transaction: {
        id: ledger.transactions[ledger.transactions.length - 1]._id,
        type: 'received',
        amount,
        description,
        sentBy: otherUserMobile,
        receivedBy: currentUserMobile,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Receive transaction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /ledger - Get all ledgers for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const currentUserMobile = req.user.mobile;

    const ledgers = await Ledger.find({
      $or: [{ user1: currentUserId }, { user2: currentUserId }]
    })
      .populate('user1', 'name mobile avatar')
      .populate('user2', 'name mobile avatar');

    const formattedLedgers = ledgers.map(ledger => {
      const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
      const balance = ledger.getBalanceForUser(currentUserMobile);
      return {
        id: ledger._id,
        friend: {
          id: otherUser._id,
          name: otherUser.name,
          mobile: otherUser.mobile,
          avatar: otherUser.avatar || otherUser.getInitials()
        },
        balance,
        lastUpdated: ledger.lastUpdated,
        transactionCount: ledger.transactions.length
      };
    });

    res.json({ ledgers: formattedLedgers });
  } catch (error) {
    console.error('Get ledgers error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /ledger/:id/transaction/:transactionId - Edit transaction
router.put('/:id/transaction/:transactionId', verifyLedgerAccess, async (req, res) => {
  try {
    const { ledger } = req;
    const { transactionId } = req.params;
    const { amount, description, date } = req.body;
    const currentUserId = req.user._id;
    const currentUserMobile = req.user.mobile;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const transaction = ledger.transactions.id(transactionId);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (!transaction.addedBy.equals(currentUserId)) {
      return res.status(403).json({ message: 'You can only edit your own transactions' });
    }

    transaction.amount = amount;
    transaction.description = description || '';
    if (date) transaction.timestamp = new Date(date);

    await ledger.save();

    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    const balance = ledger.getBalanceForUser(currentUserMobile);
    const io = req.app.get('io');

    const socketData = {
      ledgerId: ledger._id,
      balance,
      friend: {
        id: otherUser._id,
        name: otherUser.name,
        mobile: otherUser.mobile,
        avatar: otherUser.avatar || otherUser.getInitials()
      },
      transactions: ledger.transactions
        .map(t => mapTransaction(t, currentUserMobile))
        .sort(sortByCreatedAt),
      lastUpdated: ledger.lastUpdated
    };

    io.to(ledger._id.toString()).emit('ledger-updated', socketData);

    res.json({
      message: 'Transaction updated successfully',
      balance,
      transaction: {
        id: transaction._id,
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description,
        timestamp: transaction.timestamp
      }
    });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /ledger/:id/transaction/:transactionId - Delete transaction
router.delete('/:id/transaction/:transactionId', verifyLedgerAccess, async (req, res) => {
  try {
    const { ledger } = req;
    const { transactionId } = req.params;
    const currentUserId = req.user._id;
    const currentUserMobile = req.user.mobile;

    const transaction = ledger.transactions.id(transactionId);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (!transaction.addedBy.equals(currentUserId)) {
      return res.status(403).json({ message: 'You can only delete your own transactions' });
    }

    transaction.deleteOne();
    await ledger.save();

    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    const balance = ledger.getBalanceForUser(currentUserMobile);
    const io = req.app.get('io');

    const socketData = {
      ledgerId: ledger._id,
      balance,
      friend: {
        id: otherUser._id,
        name: otherUser.name,
        mobile: otherUser.mobile,
        avatar: otherUser.avatar || otherUser.getInitials()
      },
      transactions: ledger.transactions
        .map(t => mapTransaction(t, currentUserMobile))
        .sort(sortByCreatedAt),
      lastUpdated: ledger.lastUpdated
    };

    io.to(ledger._id.toString()).emit('ledger-updated', socketData);

    res.json({ message: 'Transaction deleted successfully', balance });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
