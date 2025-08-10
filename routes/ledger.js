const express = require('express');
const Ledger = require('../models/Ledger');
const User = require('../models/User');
const { authenticateToken, verifyLedgerAccess } = require('../middleware/auth');

const router = express.Router();

// GET /ledger/:id - Get ledger with transactions
router.get('/:id', verifyLedgerAccess, async (req, res) => {
  try {
    const { ledger } = req;
    const currentUserId = req.user._id;

    // Populate user details
    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    // Get the other user (friend)
    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    
    // Calculate balance for current user
    const balance = ledger.getBalanceForUser(currentUserId);

    // Format transactions for display
    const formattedTransactions = ledger.transactions.map(transaction => ({
      id: transaction._id,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      timestamp: transaction.timestamp,
      addedBy: {
        id: transaction.addedBy._id,
        name: transaction.addedBy.name,
        avatar: transaction.addedBy.avatar || transaction.addedBy.getInitials()
      },
      isOwnTransaction: transaction.addedBy._id.equals(currentUserId)
    }));

    // Sort transactions by timestamp (newest first)
    formattedTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

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
        lastUpdated: ledger.lastUpdated
      }
    });
  } catch (error) {
    console.error('Get ledger error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /ledger/:id/add - Add transaction (I added)
router.post('/:id/add', verifyLedgerAccess, async (req, res) => {
  try {
    const { ledger } = req;
    const { amount, description = '' } = req.body;
    const currentUserId = req.user._id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    // Add transaction
    await ledger.addTransaction('added', amount, currentUserId, description);

    // Populate for response
    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    // Get the other user
    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    const balance = ledger.getBalanceForUser(currentUserId);

    // Emit real-time update
    const io = req.app.get('io');
    const roomName = ledger._id.toString();
    
    io.to(roomName).emit('ledger-updated', {
      ledgerId: ledger._id,
      balance,
      friend: {
        id: otherUser._id,
        name: otherUser.name,
        mobile: otherUser.mobile,
        avatar: otherUser.avatar || otherUser.getInitials()
      },
      transactions: ledger.transactions.map(transaction => ({
        id: transaction._id,
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description,
        timestamp: transaction.timestamp,
        addedBy: {
          id: transaction.addedBy._id,
          name: transaction.addedBy.name,
          avatar: transaction.addedBy.avatar || transaction.addedBy.getInitials()
        },
        isOwnTransaction: transaction.addedBy._id.equals(currentUserId)
      })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
      lastUpdated: ledger.lastUpdated
    });

    res.json({
      message: 'Transaction added successfully',
      balance,
      transaction: {
        id: ledger.transactions[ledger.transactions.length - 1]._id,
        type: 'added',
        amount,
        description,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Add transaction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /ledger/:id/receive - Add transaction (I received)
router.post('/:id/receive', verifyLedgerAccess, async (req, res) => {
  try {
    const { ledger } = req;
    const { amount, description = '' } = req.body;
    const currentUserId = req.user._id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    // Add transaction
    await ledger.addTransaction('received', amount, currentUserId, description);

    // Populate for response
    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    // Get the other user
    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    const balance = ledger.getBalanceForUser(currentUserId);

    // Emit real-time update
    const io = req.app.get('io');
    const roomName = ledger._id.toString();
    
    io.to(roomName).emit('ledger-updated', {
      ledgerId: ledger._id,
      balance,
      friend: {
        id: otherUser._id,
        name: otherUser.name,
        mobile: otherUser.mobile,
        avatar: otherUser.avatar || otherUser.getInitials()
      },
      transactions: ledger.transactions.map(transaction => ({
        id: transaction._id,
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description,
        timestamp: transaction.timestamp,
        addedBy: {
          id: transaction.addedBy._id,
          name: transaction.addedBy.name,
          avatar: transaction.addedBy.avatar || transaction.addedBy.getInitials()
        },
        isOwnTransaction: transaction.addedBy._id.equals(currentUserId)
      })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
      lastUpdated: ledger.lastUpdated
    });

    res.json({
      message: 'Transaction added successfully',
      balance,
      transaction: {
        id: ledger.transactions[ledger.transactions.length - 1]._id,
        type: 'received',
        amount,
        description,
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

    const ledgers = await Ledger.find({
      $or: [
        { user1: currentUserId },
        { user2: currentUserId }
      ]
    }).populate('user1', 'name mobile avatar')
      .populate('user2', 'name mobile avatar');

    const formattedLedgers = ledgers.map(ledger => {
      const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
      const balance = ledger.getBalanceForUser(currentUserId);
      
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

module.exports = router; 