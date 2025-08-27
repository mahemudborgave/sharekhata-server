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
  // NEW: Use sentBy and receivedBy with mobile numbers
  sentBy: {
    type: String, // Mobile number of who sent the money
    required: true,
    match: /^[6-9]\d{9}$/ // Indian mobile number format
  },
  receivedBy: {
    type: String, // Mobile number of who received the money
    required: true,
    match: /^[6-9]\d{9}$/ // Indian mobile number format
  },
  // Keep addedBy for backward compatibility and to track who created the transaction record
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

// Method to calculate balance (legacy - kept for compatibility)
ledgerSchema.methods.calculateBalance = function() {
  this.balance = this.getBalanceForUser(this.user2); // Get user2's balance as the ledger balance
  this.lastUpdated = new Date();
  return this.balance;
};

// Method to add transaction
ledgerSchema.methods.addTransaction = function(type, amount, sentByMobile, receivedByMobile, addedBy, description = '') {
  // console.log('📝 ADDING TRANSACTION TO MODEL:', {
  //   type,
  //   amount,
  //   sentByMobile,
  //   receivedByMobile,
  //   addedBy,
  //   description,
  //   timestamp: new Date()
  // });
  
  const transaction = {
    type,
    amount,
    sentBy: sentByMobile,
    receivedBy: receivedByMobile,
    addedBy,
    description,
    timestamp: new Date()
  };
  
  this.transactions.push(transaction);
  // console.log('✅ Transaction added to array. Total transactions:', this.transactions.length);
  
  this.calculateBalance();
  // console.log('✅ Balance calculated. New balance:', this.balance);
  
  return this.save();
};

// Method to get balance for a specific user (using mobile number)
ledgerSchema.methods.getBalanceForUser = function(userMobile) {
  let userPaid = 0;
  let friendPaid = 0;
  
  // console.log('Calculating balance for user mobile:', userMobile);
  // console.log('Total transactions:', this.transactions.length);
  
  this.transactions.forEach((transaction, index) => {
    // console.log(`Transaction ${index + 1}:`, {
    //   type: transaction.type,
    //   amount: transaction.amount,
    //   sentBy: transaction.sentBy,
    //   receivedBy: transaction.receivedBy,
    //   isOwnTransaction: transaction.sentBy === userMobile || transaction.receivedBy === userMobile
    // });
    
    if (transaction.type === 'added') {
      // Only count 'added' transactions (money paid for shared expenses)
      if (transaction.sentBy === userMobile) {
        userPaid += transaction.amount; // You paid this amount
        // console.log(`You paid: +${transaction.amount}, Total: ${userPaid}`);
      } else {
        friendPaid += transaction.amount; // Friend paid this amount
        // console.log(`Friend paid: +${transaction.amount}, Total: ${friendPaid}`);
      }
    }
    // Ignore 'received' transactions as they are just settlements
  });
  
  const balance = userPaid - friendPaid;
  // console.log(`Final balance: ${userPaid} - ${friendPaid} = ${balance}`);
  
  // Calculate net balance: positive means you get money, negative means you owe money
  return balance;
};

// Method to get detailed balance breakdown for debugging
ledgerSchema.methods.getBalanceBreakdown = function() {
  let user1Paid = 0;
  let user2Paid = 0;
  let user1Received = 0;
  let user2Received = 0;
  
  this.transactions.forEach(transaction => {
    // Get user mobile numbers from populated user objects
    const user1Mobile = this.user1.mobile || this.user1;
    const user2Mobile = this.user2.mobile || this.user2;
    
    if (transaction.sentBy === user1Mobile) {
      // User1's transactions
      if (transaction.type === 'added') {
        user1Paid += transaction.amount;
      } else if (transaction.type === 'received') {
        user1Received += transaction.amount;
      }
    } else if (transaction.sentBy === user2Mobile) {
      // User2's transactions
      if (transaction.type === 'added') {
        user2Paid += transaction.amount;
      } else if (transaction.type === 'received') {
        user2Received += transaction.amount;
      }
    }
  });
  
  return {
    user1Paid,
    user2Paid,
    user1Received,
    user2Received,
    user1Balance: user1Paid - user2Paid,
    user2Balance: user2Paid - user1Paid,
    transactions: this.transactions.length
  };
};

module.exports = mongoose.model('Ledger', ledgerSchema); 