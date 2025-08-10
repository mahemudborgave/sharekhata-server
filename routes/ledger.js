const express = require('express');
const Ledger = require('../models/Ledger');
const User = require('../models/User');
const { authenticateToken, verifyLedgerAccess } = require('../middleware/auth');

const router = express.Router();

// GET /ledger/:id - Get ledger with transactions
router.get('/:id', verifyLedgerAccess, async (req, res) => {
  try {
    console.log('🔄 GET LEDGER - START');
    console.log('📋 Ledger ID:', req.params.id);
    console.log('👤 Current User ID:', req.user._id);
    console.log('👤 Current User Name:', req.user.name);
    console.log('👤 Current User Mobile:', req.user.mobile);
    
    const { ledger } = req;
    const currentUserId = req.user._id;
    const currentUserMobile = req.user.mobile;

    console.log('📊 LEDGER DATA:', {
      id: ledger._id,
      user1: ledger.user1,
      user2: ledger.user2,
      transactionsCount: ledger.transactions.length,
      balance: ledger.balance
    });

    // Populate user details
    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    console.log('👥 POPULATED USERS:', {
      user1: { id: ledger.user1._id, name: ledger.user1.name, mobile: ledger.user1.mobile },
      user2: { id: ledger.user2._id, name: ledger.user2.name, mobile: ledger.user2.mobile }
    });

    // Get the other user (friend)
    console.log('🔍 USER IDENTIFICATION DEBUG:');
    console.log('  Current User ID:', currentUserId);
    console.log('  Current User Mobile:', currentUserMobile);
    console.log('  User1 ID:', ledger.user1._id);
    console.log('  User1 Mobile:', ledger.user1.mobile);
    console.log('  User2 ID:', ledger.user2._id);
    console.log('  User2 Mobile:', ledger.user2.mobile);
    console.log('  Current User equals User1?', ledger.user1.equals(currentUserId));
    console.log('  Current User equals User2?', ledger.user2.equals(currentUserId));
    
    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    console.log('👥 FRIEND SELECTED:', { id: otherUser._id, name: otherUser.name, mobile: otherUser.mobile });
    
    // Calculate balance for current user using mobile number
    const balance = ledger.getBalanceForUser(currentUserMobile);
    console.log('💰 CALCULATED BALANCE:', balance);
    
    // Get balance breakdown for debugging
    const breakdown = ledger.getBalanceBreakdown();
    console.log('🔍 BALANCE BREAKDOWN:', breakdown);

    // Format transactions for display
    const formattedTransactions = ledger.transactions.map(transaction => {
      console.log('🔍 TRANSACTION OWNERSHIP DEBUG:');
      console.log('  Transaction ID:', transaction._id);
      console.log('  Transaction sentBy:', transaction.sentBy);
      console.log('  Transaction receivedBy:', transaction.receivedBy);
      console.log('  Current User Mobile:', currentUserMobile);
      console.log('  Is current user sender?', transaction.sentBy === currentUserMobile);
      console.log('  Is current user receiver?', transaction.receivedBy === currentUserMobile);
      
      const isOwnTransaction = transaction.sentBy === currentUserMobile || transaction.receivedBy === currentUserMobile;
      console.log('📝 TRANSACTION:', {
        id: transaction._id,
        type: transaction.type,
        amount: transaction.amount,
        sentBy: transaction.sentBy,
        receivedBy: transaction.receivedBy,
        addedBy: transaction.addedBy.name,
        isOwnTransaction: isOwnTransaction
      });
      
      return {
        id: transaction._id,
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description,
        timestamp: transaction.timestamp,
        sentBy: transaction.sentBy,
        receivedBy: transaction.receivedBy,
        addedBy: {
          id: transaction.addedBy._id,
          name: transaction.addedBy.name,
          avatar: transaction.addedBy.avatar || transaction.addedBy.getInitials()
        },
        isOwnTransaction: isOwnTransaction
      };
    });

    // Sort transactions by timestamp (newest first)
    formattedTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const response = {
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
    };

    console.log('📦 FINAL RESPONSE:', {
      ledgerId: response.ledger.id,
      balance: response.ledger.balance,
      friendName: response.ledger.friend.name,
      transactionsCount: response.ledger.transactions.length
    });

    console.log('✅ GET LEDGER - COMPLETE');
    res.json(response);
  } catch (error) {
    console.error('❌ GET LEDGER - ERROR:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /ledger/:id/add - Add transaction (I added)
router.post('/:id/add', verifyLedgerAccess, async (req, res) => {
  try {
    console.log('🔄 ADD TRANSACTION - START');
    console.log('📋 Ledger ID:', req.params.id);
    console.log('👤 Current User:', req.user.name);
    console.log('👤 Current User Mobile:', req.user.mobile);
    console.log('📦 Request Body:', req.body);
    
    const { ledger } = req;
    const { amount, description = '' } = req.body;
    const currentUserId = req.user._id;
    const currentUserMobile = req.user.mobile;

    // Get the other user's mobile number
    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    const otherUserMobile = otherUser.mobile;

    console.log('💰 TRANSACTION DETAILS:', {
      type: 'added',
      amount,
      description,
      sentBy: currentUserMobile, // You are sending money
      receivedBy: otherUserMobile, // Friend receives the money
      addedBy: currentUserId
    });

    if (!amount || amount <= 0) {
      console.log('❌ Invalid amount:', amount);
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    // Add transaction with new structure
    console.log('📝 Adding transaction to database...');
    await ledger.addTransaction('added', amount, currentUserMobile, otherUserMobile, currentUserId, description);
    console.log('✅ Transaction added to database');

    // Populate for response
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    // Calculate new balance
    const balance = ledger.getBalanceForUser(currentUserMobile);
    
    console.log('💰 NEW BALANCE:', balance);
    console.log('👥 OTHER USER:', otherUser.name);

    // Emit real-time update
    const io = req.app.get('io');
    const roomName = ledger._id.toString();
    
    const socketData = {
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
        sentBy: transaction.sentBy,
        receivedBy: transaction.receivedBy,
        addedBy: {
          id: transaction.addedBy._id,
          name: transaction.addedBy.name,
          avatar: transaction.addedBy.avatar || transaction.addedBy.getInitials()
        },
        isOwnTransaction: transaction.sentBy === currentUserMobile || transaction.receivedBy === currentUserMobile
      })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
      lastUpdated: ledger.lastUpdated
    };
    
    console.log('📡 Emitting socket update to room:', roomName);
    io.to(roomName).emit('ledger-updated', socketData);

    const response = {
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
    };

    console.log('📦 RESPONSE:', response);
    console.log('✅ ADD TRANSACTION - COMPLETE');
    res.json(response);
  } catch (error) {
    console.error('❌ ADD TRANSACTION - ERROR:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /ledger/:id/receive - Add transaction (I received)
router.post('/:id/receive', verifyLedgerAccess, async (req, res) => {
  try {
    console.log('🔄 RECEIVE TRANSACTION - START');
    console.log('📋 Ledger ID:', req.params.id);
    console.log('👤 Current User:', req.user.name);
    console.log('👤 Current User Mobile:', req.user.mobile);
    console.log('📦 Request Body:', req.body);
    
    const { ledger } = req;
    const { amount, description = '' } = req.body;
    const currentUserId = req.user._id;
    const currentUserMobile = req.user.mobile;

    // Get the other user's mobile number
    await ledger.populate('user1', 'name mobile avatar');
    await ledger.populate('user2', 'name mobile avatar');
    const otherUser = ledger.user1.equals(currentUserId) ? ledger.user2 : ledger.user1;
    const otherUserMobile = otherUser.mobile;

    console.log('💰 TRANSACTION DETAILS:', {
      type: 'received',
      amount,
      description,
      sentBy: otherUserMobile, // Friend sent you money
      receivedBy: currentUserMobile, // You received the money
      addedBy: currentUserId
    });

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    // Add transaction with new structure
    await ledger.addTransaction('received', amount, otherUserMobile, currentUserMobile, currentUserId, description);

    // Populate for response
    await ledger.populate('transactions.addedBy', 'name mobile avatar');

    // Get the other user
    const balance = ledger.getBalanceForUser(currentUserMobile);

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
        sentBy: transaction.sentBy,
        receivedBy: transaction.receivedBy,
        addedBy: {
          id: transaction.addedBy._id,
          name: transaction.addedBy.name,
          avatar: transaction.addedBy.avatar || transaction.addedBy.getInitials()
        },
        isOwnTransaction: transaction.sentBy === currentUserMobile || transaction.receivedBy === currentUserMobile
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
      $or: [
        { user1: currentUserId },
        { user2: currentUserId }
      ]
    }).populate('user1', 'name mobile avatar')
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

module.exports = router; 