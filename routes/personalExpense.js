const express = require('express');
const PersonalExpense = require('../models/PersonalExpense');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Helper function to get date ranges
const getDateRanges = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const lastWeekStart = new Date(today);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  
  const lastMonthStart = new Date(today);
  lastMonthStart.setDate(lastMonthStart.getDate() - 30);
  
  return {
    today: { start: today, end: new Date() },
    yesterday: { start: yesterday, end: today },
    lastWeek: { start: lastWeekStart, end: new Date() },
    lastMonth: { start: lastMonthStart, end: new Date() }
  };
};

// GET /personal-expense/summary - Get summary for today, yesterday, last week, last month
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const ranges = getDateRanges();
    
    const [todayTotal, yesterdayTotal, lastWeekTotal, lastMonthTotal] = await Promise.all([
      PersonalExpense.getTotalByDateRange(userId, ranges.today.start, ranges.today.end, 'expense'),
      PersonalExpense.getTotalByDateRange(userId, ranges.yesterday.start, ranges.yesterday.end, 'expense'),
      PersonalExpense.getTotalByDateRange(userId, ranges.lastWeek.start, ranges.lastWeek.end, 'expense'),
      PersonalExpense.getTotalByDateRange(userId, ranges.lastMonth.start, ranges.lastMonth.end, 'expense')
    ]);
    
    res.json({
      summary: {
        today: todayTotal,
        yesterday: yesterdayTotal,
        lastWeek: lastWeekTotal,
        lastMonth: lastMonthTotal
      }
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /personal-expense/transactions - Get all transactions with optional filters
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { period, transactionType, limit = 50 } = req.query;
    
    let startDate = new Date(0); // Beginning of time
    const endDate = new Date();
    
    if (period) {
      const ranges = getDateRanges();
      if (ranges[period]) {
        startDate = ranges[period].start;
      }
    }
    
    const query = {
      userId,
      date: { $gte: startDate, $lte: endDate }
    };
    
    if (transactionType && ['expense', 'income'].includes(transactionType)) {
      query.transactionType = transactionType;
    }
    
    const transactions = await PersonalExpense.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit));
    
    res.json({ transactions });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /personal-expense/add - Add new expense/income
router.post('/add', authenticateToken, async (req, res) => {
  try {
    const { amount, description, category, transactionType, date } = req.body;
    const userId = req.user._id;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    
    if (!description || description.trim() === '') {
      return res.status(400).json({ message: 'Description is required' });
    }
    
    const expense = new PersonalExpense({
      userId,
      amount: parseFloat(amount),
      description: description.trim(),
      category: category || 'other',
      transactionType: transactionType || 'expense',
      date: date ? new Date(date) : new Date()
    });
    
    await expense.save();
    
    res.status(201).json({
      message: 'Transaction added successfully',
      transaction: expense
    });
  } catch (error) {
    console.error('Add transaction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /personal-expense/:id - Update expense/income
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, category, transactionType, date } = req.body;
    const userId = req.user._id;
    
    const expense = await PersonalExpense.findOne({ _id: id, userId });
    
    if (!expense) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    if (amount !== undefined) expense.amount = parseFloat(amount);
    if (description !== undefined) expense.description = description.trim();
    if (category !== undefined) expense.category = category;
    if (transactionType !== undefined) expense.transactionType = transactionType;
    if (date !== undefined) expense.date = new Date(date);
    
    await expense.save();
    
    res.json({
      message: 'Transaction updated successfully',
      transaction: expense
    });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /personal-expense/:id - Delete expense/income
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const expense = await PersonalExpense.findOneAndDelete({ _id: id, userId });
    
    if (!expense) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /personal-expense/stats - Get statistics by category
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = 'lastMonth' } = req.query;
    
    const ranges = getDateRanges();
    const range = ranges[period] || ranges.lastMonth;
    
    const stats = await PersonalExpense.aggregate([
      {
        $match: {
          userId: userId,
          date: { $gte: range.start, $lte: range.end },
          transactionType: 'expense'
        }
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);
    
    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;