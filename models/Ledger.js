const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['added', 'received'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const ledgerSchema = new mongoose.Schema({
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  transactions: [transactionSchema],
  balance: {
    type: Number,
    default: 0,
    // Positive: user1 owes user2, Negative: user2 owes user1
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
ledgerSchema.index({ user1: 1, user2: 1 }, { unique: true });

// Method to calculate balance
ledgerSchema.methods.calculateBalance = function() {
  let balance = 0;
  
  this.transactions.forEach(transaction => {
    if (transaction.type === 'added') {
      if (transaction.addedBy.equals(this.user1)) {
        balance += transaction.amount; // user1 owes user2
      } else {
        balance -= transaction.amount; // user2 owes user1
      }
    } else if (transaction.type === 'received') {
      if (transaction.addedBy.equals(this.user1)) {
        balance -= transaction.amount; // user1 received from user2
      } else {
        balance += transaction.amount; // user2 received from user1
      }
    }
  });
  
  this.balance = balance;
  this.lastUpdated = new Date();
  return balance;
};

// Method to add transaction
ledgerSchema.methods.addTransaction = function(type, amount, addedBy, description = '') {
  const transaction = {
    type,
    amount,
    addedBy,
    description,
    timestamp: new Date()
  };
  
  this.transactions.push(transaction);
  this.calculateBalance();
  return this.save();
};

// Method to get balance for a specific user
ledgerSchema.methods.getBalanceForUser = function(userId) {
  if (userId.equals(this.user1)) {
    return -this.balance; // Negative because user1's perspective
  } else {
    return this.balance; // Positive because user2's perspective
  }
};

module.exports = mongoose.model('Ledger', ledgerSchema); 