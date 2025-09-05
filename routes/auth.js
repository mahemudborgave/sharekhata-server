const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Ledger = require('../models/Ledger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, mobile, password } = req.body;

    // Validation
    if (!name || !mobile || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if mobile already exists
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(400).json({ message: 'Mobile number already registered' });
    }

    // Create new user
    const user = new User({
      name,
      mobile,
      password
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        avatar: user.avatar || user.getInitials()
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    // console.log('🔐 LOGIN - START');
    // console.log('📱 Mobile:', req.body.mobile);
    // console.log('🔑 Password:', req.body.password ? '***' : 'empty');
    
    const { mobile, password } = req.body;

    // Validation
    if (!mobile || !password) {
      // console.log('❌ Missing credentials:', { mobile: !!mobile, password: !!password });
      return res.status(400).json({ message: 'Mobile and password are required' });
    }

    // Find user by mobile
    // console.log('🔍 Searching for user with mobile:', mobile);
    const user = await User.findOne({ mobile });
    
    if (!user) {
      // console.log('❌ User not found for mobile:', mobile);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // console.log('✅ User found:', { id: user._id, name: user.name });

    // Check password
    // console.log('🔐 Verifying password...');
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      // console.log('❌ Invalid password for user:', mobile);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // console.log('✅ Password verified successfully');

    // Generate token
    // console.log('🎫 Generating JWT token...');
    const token = generateToken(user._id);
    
    // console.log('✅ JWT token generated');

    const response = {
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        avatar: user.avatar || user.getInitials()
      }
    };
    
    // console.log('📦 LOGIN RESPONSE:', { 
    //   message: response.message, 
    //   token: token ? '***' : 'empty',
    //   user: response.user 
    // });
    // console.log('✅ LOGIN - COMPLETE');
    
    res.json(response);
  } catch (error) {
    console.error('❌ LOGIN - ERROR:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/add-friend (protected)
router.post('/add-friend', authenticateToken, async (req, res) => {
  try {
    const { mobile } = req.body;
    const currentUserId = req.user._id;

    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }

    // Find friend by mobile
    const friend = await User.findOne({ mobile });
    if (!friend) {
      return res.status(404).json({ message: 'User not found with this mobile number' });
    }

    if (friend._id.equals(currentUserId)) {
      return res.status(400).json({ message: 'Cannot add yourself as friend' });
    }

    // Check if already friends
    const currentUser = await User.findById(currentUserId);
    if (currentUser.friends.includes(friend._id)) {
      return res.status(400).json({ message: 'Already friends' });
    }

    // Add to friends list
    await User.findByIdAndUpdate(currentUserId, {
      $addToSet: { friends: friend._id }
    });

    await User.findByIdAndUpdate(friend._id, {
      $addToSet: { friends: currentUserId }
    });

    // Create or get existing ledger
    let ledger = await Ledger.findOne({
      $or: [
        { user1: currentUserId, user2: friend._id },
        { user1: friend._id, user2: currentUserId }
      ]
    });

    if (!ledger) {
      ledger = new Ledger({
        user1: currentUserId,
        user2: friend._id
      });
      await ledger.save();
    }

    res.json({
      message: 'Friend added successfully',
      friend: {
        id: friend._id,
        name: friend.name,
        mobile: friend.mobile,
        avatar: friend.avatar || friend.getInitials()
      },
      ledgerId: ledger._id
    });
  } catch (error) {
    console.error('Add friend error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /auth/friends (protected)
router.get('/friends', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('friends', 'name mobile avatar')
      .select('friends');

    res.json({
      friends: user.friends.map(friend => ({
        id: friend._id,
        name: friend.name,
        mobile: friend.mobile,
        avatar: friend.avatar || friend.getInitials()
      }))
    });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /auth/profile (protected)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        createdAt: user.createdAt,  
        avatar: user.avatar || user.getInitials()
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router; 