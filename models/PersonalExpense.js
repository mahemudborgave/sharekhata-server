const mongoose = require('mongoose');

const personalExpenseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['food', 'transport', 'shopping', 'bills', 'entertainment', 'health', 'education', 'other'],
    default: 'other'
  },
  transactionType: {
    type: String,
    enum: ['expense', 'income'],
    default: 'expense',
    required: true
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient date-based queries
personalExpenseSchema.index({ userId: 1, date: -1 });
personalExpenseSchema.index({ userId: 1, transactionType: 1, date: -1 });

// Method to get expenses for a date range
personalExpenseSchema.statics.getExpensesByDateRange = async function(userId, startDate, endDate, transactionType = null) {
  const query = {
    userId,
    date: {
      $gte: startDate,
      $lte: endDate
    }
  };
  
  if (transactionType) {
    query.transactionType = transactionType;
  }
  
  return this.find(query).sort({ date: -1 });
};

// Method to calculate total for date range
personalExpenseSchema.statics.getTotalByDateRange = async function(userId, startDate, endDate, transactionType = 'expense') {
  const result = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        date: {
          $gte: startDate,
          $lte: endDate
        },
        transactionType
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]);
  
  return result.length > 0 ? result[0].total : 0;
};

module.exports = mongoose.model('PersonalExpense', personalExpenseSchema);