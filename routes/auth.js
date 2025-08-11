const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Ledger = require('../models/Ledger');
const Friendship = require('../models/Friendship');
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

    // Check for pending friend requests
    console.log('🔍 Checking for pending friend requests for mobile:', mobile);
    const pendingFriendships = await Friendship.findPendingByMobile(mobile);
    
    if (pendingFriendships.length > 0) {
      console.log(`📱 Found ${pendingFriendships.length} pending friend requests`);
      
      // Process each pending friendship
      for (const friendship of pendingFriendships) {
        try {
          // Update friendship status
          friendship.status = 'accepted';
          friendship.friendId = user._id;
          await friendship.save();

          // Update ledger to link with user
          const ledger = await Ledger.findById(friendship.ledgerId);
          if (ledger) {
            ledger.user2 = user._id;
            ledger.user2Mobile = undefined; // Remove mobile reference
            await ledger.save();
          }

          // Add to friendships list for new user
          await User.findByIdAndUpdate(user._id, {
            $addToSet: { friendships: friendship._id }
          });

          // Add to friends list for both users
          await User.findByIdAndUpdate(friendship.requesterId, {
            $addToSet: { friends: user._id }
          });

          await User.findByIdAndUpdate(user._id, {
            $addToSet: { friends: friendship.requesterId }
          });

          console.log(`✅ Processed pending friendship with user: ${friendship.requesterId}`);
        } catch (error) {
          console.error(`❌ Error processing pending friendship:`, error);
        }
      }
    }

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
      },
      pendingFriendshipsProcessed: pendingFriendships.length
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    console.log('🔐 LOGIN - START');
    console.log('📱 Mobile:', req.body.mobile);
    console.log('🔑 Password:', req.body.password ? '***' : 'empty');
    
    const { mobile, password } = req.body;

    // Validation
    if (!mobile || !password) {
      console.log('❌ Missing credentials:', { mobile: !!mobile, password: !!password });
      return res.status(400).json({ message: 'Mobile and password are required' });
    }

    // Find user by mobile
    console.log('🔍 Searching for user with mobile:', mobile);
    const user = await User.findOne({ mobile });
    
    if (!user) {
      console.log('❌ User not found for mobile:', mobile);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    console.log('✅ User found:', { id: user._id, name: user.name });

    // Check password
    console.log('🔐 Verifying password...');
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      console.log('❌ Invalid password for user:', mobile);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    console.log('✅ Password verified successfully');

    // Generate token
    console.log('🎫 Generating JWT token...');
    const token = generateToken(user._id);
    
    console.log('✅ JWT token generated');

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
    
    console.log('📦 LOGIN RESPONSE:', { 
      message: response.message, 
      token: token ? '***' : 'empty',
      user: response.user 
    });
    console.log('✅ LOGIN - COMPLETE');
    
    res.json(response);
  } catch (error) {
    console.error('❌ LOGIN - ERROR:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/add-friend (protected)
router.post('/add-friend', authenticateToken, async (req, res) => {
  try {
    const { mobile, customName } = req.body;
    const currentUserId = req.user._id;

    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }

    if (!customName || !customName.trim()) {
      return res.status(400).json({ message: 'Friend name is required' });
    }

    // Check if trying to add self
    const currentUser = await User.findById(currentUserId);
    if (currentUser.mobile === mobile) {
      return res.status(400).json({ message: 'Cannot add yourself as friend' });
    }

    // Check if friendship already exists
    const existingFriendship = await Friendship.findOne({
      requesterId: currentUserId,
      friendMobile: mobile
    });

    if (existingFriendship) {
      return res.status(400).json({ 
        message: existingFriendship.status === 'pending' 
          ? 'Friend request already sent' 
          : 'Already friends'
      });
    }

    // Find if friend is registered
    const friend = await User.findOne({ mobile });
    
    let ledger;
    let friendship;
    let responseData;

    if (friend) {
      // Friend is registered - create accepted friendship immediately
      console.log('✅ Friend is registered, creating accepted friendship');
      
      // Check if already friends through other direction
      const reverseFriendship = await Friendship.findOne({
        requesterId: friend._id,
        friendMobile: currentUser.mobile
      });

      if (reverseFriendship && reverseFriendship.status === 'accepted') {
        return res.status(400).json({ message: 'Already friends' });
      }

      // Create or get existing ledger
      ledger = await Ledger.findOne({
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

      // Create accepted friendship
      friendship = new Friendship({
        requesterId: currentUserId,
        friendId: friend._id,
        friendMobile: mobile,
        customName: customName,
        status: 'accepted',
        ledgerId: ledger._id
      });
      await friendship.save();

      // Add to friends list for both users
      await User.findByIdAndUpdate(currentUserId, {
        $addToSet: { friends: friend._id, friendships: friendship._id }
      });

      await User.findByIdAndUpdate(friend._id, {
        $addToSet: { friends: currentUserId, friendships: friendship._id }
      });

      responseData = {
        message: 'Friend added successfully',
        friend: {
          id: friend._id,
          name: customName, // Always use custom name
          mobile: friend.mobile,
          avatar: friend.avatar || friend.getInitials()
        },
        ledgerId: ledger._id,
        status: 'accepted',
        isRegistered: true
      };

    } else {
      // Friend is not registered - create pending friendship
      console.log('⏳ Friend is not registered, creating pending friendship');
      
      // Create ledger with mobile number references
      ledger = new Ledger({
        user1: currentUserId,
        user2: null, // Will be updated when friend registers
        user2Mobile: mobile // Store mobile for unregistered user
      });
      await ledger.save();

      // Create pending friendship
      friendship = new Friendship({
        requesterId: currentUserId,
        friendId: null,
        friendMobile: mobile,
        customName: customName,
        status: 'pending',
        ledgerId: ledger._id
      });
      await friendship.save();

      // Add to friendships list for current user
      await User.findByIdAndUpdate(currentUserId, {
        $addToSet: { friendships: friendship._id }
      });

      responseData = {
        message: 'Friend request sent successfully',
        friend: {
          mobile: mobile,
          name: customName, // Always use custom name
          avatar: '?'
        },
        ledgerId: ledger._id,
        status: 'pending',
        isRegistered: false
      };
    }

    res.json(responseData);
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

// GET /auth/friendships (protected) - Get all friendships including pending ones
router.get('/friendships', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'friendships',
        populate: [
          { path: 'requesterId', select: 'name mobile avatar' },
          { path: 'friendId', select: 'name mobile avatar' },
          { path: 'ledgerId', select: 'balance lastUpdated' }
        ]
      })
      .select('friendships');

    const friendships = user.friendships.map(friendship => {
      const isRequester = friendship.requesterId._id.equals(req.user._id);
      const otherUser = isRequester ? friendship.friendId : friendship.requesterId;
      
      return {
        id: friendship._id,
        status: friendship.status,
        isRequester,
        otherUser: otherUser ? {
          id: otherUser._id,
          name: friendship.customName || otherUser.name || 'Unknown User', // Custom name takes priority
          mobile: otherUser.mobile || friendship.friendMobile,
          avatar: otherUser.avatar || '?'
        } : {
          mobile: friendship.friendMobile,
          name: friendship.customName || 'Unknown User', // Use custom name for pending friends
          avatar: '?'
        },
        ledgerId: friendship.ledgerId._id,
        balance: friendship.ledgerId.balance,
        lastUpdated: friendship.ledgerId.lastUpdated,
        createdAt: friendship.createdAt
      };
    });

    res.json({ friendships });
  } catch (error) {
    console.error('Get friendships error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /auth/pending-friends (protected) - Get pending friend requests
router.get('/pending-friends', authenticateToken, async (req, res) => {
  try {
    const pendingFriendships = await Friendship.find({
      requesterId: req.user._id,
      status: 'pending'
    }).populate('ledgerId', 'balance lastUpdated');

    const pendingFriends = pendingFriendships.map(friendship => ({
      id: friendship._id,
      mobile: friendship.friendMobile,
      name: friendship.customName || 'Unknown User', // Include custom name
      ledgerId: friendship.ledgerId._id,
      balance: friendship.ledgerId.balance,
      lastUpdated: friendship.ledgerId.lastUpdated,
      createdAt: friendship.createdAt
    }));

    res.json({ pendingFriends });
  } catch (error) {
    console.error('Get pending friends error:', error);
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
        avatar: user.avatar || user.getInitials()
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router; 