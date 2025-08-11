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

// Migration function
const migrateFriendships = async () => {
  try {
    console.log('🔄 Starting friendship migration...');
    
    // Get the Friendship model
    const Friendship = require('../models/Friendship');
    const User = require('../models/User');
    const Ledger = require('../models/Ledger');
    
    // Clear existing friendships collection (if any)
    await Friendship.deleteMany({});
    console.log('🧹 Cleared existing friendships collection');
    
    // Find all existing ledgers
    const ledgers = await Ledger.find({});
    console.log(`📊 Found ${ledgers.length} existing ledgers`);
    
    // Create friendships for existing ledgers
    for (const ledger of ledgers) {
      try {
        // Check if both users exist
        const user1 = await User.findById(ledger.user1);
        const user2 = await User.findById(ledger.user2);
        
        if (user1 && user2) {
          // Both users exist, create accepted friendship
          const friendship = new Friendship({
            requesterId: ledger.user1,
            friendId: ledger.user2,
            friendMobile: user2.mobile,
            status: 'accepted',
            ledgerId: ledger._id
          });
          await friendship.save();
          
          // Update user documents
          await User.findByIdAndUpdate(ledger.user1, {
            $addToSet: { friendships: friendship._id }
          });
          
          await User.findByIdAndUpdate(ledger.user2, {
            $addToSet: { friendships: friendship._id }
          });
          
          console.log(`✅ Created friendship for ledger: ${ledger._id}`);
        } else {
          console.log(`⚠️ Skipping ledger ${ledger._id} - users not found`);
        }
      } catch (error) {
        console.error(`❌ Error processing ledger ${ledger._id}:`, error);
      }
    }
    
    console.log('✅ Friendship migration completed successfully');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  }
};

// Run migration
const runMigration = async () => {
  try {
    await connectDB();
    await migrateFriendships();
    console.log('🎉 Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration }; 