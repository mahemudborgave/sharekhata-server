const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Ledger = require('../models/Ledger');
const { authenticateToken } = require('../middleware/auth');
const { sendOTPEmail } = require('../utils/emailService');
const { generateOTP, saveOTP, verifyOTP, clearOTP } = require('../utils/otpStore');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

// POST /auth/send-otp — send OTP to email for registration or forgot-password
router.post('/send-otp', async (req, res) => {
  try {
    const { email, purpose } = req.body; // purpose: 'registration' | 'forgot-password'

    if (!email || !purpose) {
      return res.status(400).json({ message: 'Email and purpose are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email address' });
    }

    if (!['registration', 'forgot-password'].includes(purpose)) {
      return res.status(400).json({ message: 'Invalid purpose' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });

    if (purpose === 'registration' && existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    if (purpose === 'forgot-password' && !existingUser) {
      return res.status(404).json({ message: 'No account found with this email' });
    }

    // Skip dummy emails for forgot-password
    if (purpose === 'forgot-password' && existingUser.email.endsWith('@sharekhata.app')) {
      return res.status(400).json({ message: 'This account was created before email support. Please contact support.' });
    }

    const otp = generateOTP();
    saveOTP(email, otp, purpose);

    await sendOTPEmail(email, otp, purpose);

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
  }
});

// POST /auth/verify-otp — verify OTP (used before registration to confirm email)
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;

    if (!email || !otp || !purpose) {
      return res.status(400).json({ message: 'Email, OTP and purpose are required' });
    }

    const result = verifyOTP(email, otp, purpose);
    if (!result.valid) {
      return res.status(400).json({ message: result.reason });
    }

    res.json({ message: 'OTP verified successfully', verified: true });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, mobile, email, password, otp } = req.body;

    if (!name || !mobile || !email || !password || !otp) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Verify OTP before creating account
    const otpResult = verifyOTP(email, otp, 'registration');
    if (!otpResult.valid) {
      return res.status(400).json({ message: otpResult.reason });
    }

    // Check mobile & email uniqueness
    const existingMobile = await User.findOne({ mobile });
    if (existingMobile) {
      return res.status(400).json({ message: 'Mobile number already registered' });
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = new User({ name, mobile, email: email.toLowerCase(), password });
    await user.save();

    // Clear OTP after successful registration
    clearOTP(email);

    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        avatar: user.avatar || user.getInitials()
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/forgot-password — verify OTP then allow password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const otpResult = verifyOTP(email, otp, 'forgot-password');
    if (!otpResult.valid) {
      return res.status(400).json({ message: otpResult.reason });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password = newPassword; // pre-save hook will hash it
    await user.save();

    clearOTP(email);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Forgot password error:', error);
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
        email: user.email,
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