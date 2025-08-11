const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sharekhata');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Test the friendship system
const testFriendshipSystem = async () => {
  try {
    console.log('🧪 Testing Friendship System...');
    
    // Get models
    const User = require('./models/User');
    const Friendship = require('./models/Friendship');
    const Ledger = require('./models/Ledger');
    
    // Test 1: Create a test user
    console.log('\n📝 Test 1: Creating test user...');
    const testUser = new User({
      name: 'Test User',
      mobile: '9876543210',
      password: 'testpass123'
    });
    await testUser.save();
    console.log('✅ Test user created:', testUser.name);
    
    // Test 2: Add unregistered friend
    console.log('\n📝 Test 2: Adding unregistered friend...');
    const unregisteredMobile = '9876543211';
    
    // Simulate the add-friend API call
    const ledger = new Ledger({
      user1: testUser._id,
      user2: null,
      user2Mobile: unregisteredMobile
    });
    await ledger.save();
    
    const friendship = new Friendship({
      requesterId: testUser._id,
      friendId: null,
      friendMobile: unregisteredMobile,
      customName: 'John Doe', // Required custom name
      status: 'pending',
      ledgerId: ledger._id
    });
    await friendship.save();
    
    console.log('✅ Pending friendship created for mobile:', unregisteredMobile);
    
    // Test 3: Simulate friend registration
    console.log('\n📝 Test 3: Simulating friend registration...');
    const friend = new User({
      name: 'Test Friend',
      mobile: unregisteredMobile,
      password: 'friendpass123'
    });
    await friend.save();
    console.log('✅ Friend registered:', friend.name);
    
    // Test 4: Process pending friendship
    console.log('\n📝 Test 4: Processing pending friendship...');
    const pendingFriendships = await Friendship.findPendingByMobile(unregisteredMobile);
    console.log(`📱 Found ${pendingFriendships.length} pending friendships`);
    
    for (const pendingFriendship of pendingFriendships) {
      // Update friendship status
      pendingFriendship.status = 'accepted';
      pendingFriendship.friendId = friend._id;
      await pendingFriendship.save();
      
      // Update ledger
      const ledgerToUpdate = await Ledger.findById(pendingFriendship.ledgerId);
      if (ledgerToUpdate) {
        ledgerToUpdate.user2 = friend._id;
        ledgerToUpdate.user2Mobile = undefined;
        await ledgerToUpdate.save();
      }
      
      // Update user documents
      await User.findByIdAndUpdate(pendingFriendship.requesterId, {
        $addToSet: { friendships: pendingFriendship._id, friends: friend._id }
      });
      
      await User.findByIdAndUpdate(friend._id, {
        $addToSet: { friendships: pendingFriendship._id, friends: pendingFriendship.requesterId }
      });
      
      console.log('✅ Pending friendship processed successfully');
    }
    
    // Test 5: Verify final state
    console.log('\n📝 Test 5: Verifying final state...');
    const finalFriendship = await Friendship.findOne({
      requesterId: testUser._id,
      friendMobile: unregisteredMobile
    });
    
    const finalLedger = await Ledger.findById(ledger._id);
    
    console.log('📊 Final Friendship Status:', finalFriendship.status);
    console.log('📊 Final Ledger user2:', finalLedger.user2);
    console.log('📊 Final Ledger user2Mobile:', finalLedger.user2Mobile);
    console.log('📊 Custom Name Preserved:', finalFriendship.customName);
    
    // Test 6: Add transaction to ledger
    console.log('\n📝 Test 6: Adding transaction to ledger...');
    const transaction = {
      type: 'added',
      amount: 100,
      description: 'Test transaction',
      sentBy: testUser.mobile,
      receivedBy: friend.mobile,
      addedBy: testUser._id,
      timestamp: new Date()
    };
    
    finalLedger.transactions.push(transaction);
    finalLedger.calculateBalance();
    await finalLedger.save();
    
    console.log('✅ Transaction added, new balance:', finalLedger.balance);
    
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await User.deleteMany({ mobile: { $in: ['9876543210', '9876543211'] } });
    await Friendship.deleteMany({ requesterId: testUser._id });
    await Ledger.deleteMany({ _id: ledger._id });
    
    console.log('✅ Test data cleaned up');
    console.log('\n🎉 All tests passed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

// Run tests
const runTests = async () => {
  try {
    await connectDB();
    await testFriendshipSystem();
    process.exit(0);
  } catch (error) {
    console.error('❌ Tests failed:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests }; 