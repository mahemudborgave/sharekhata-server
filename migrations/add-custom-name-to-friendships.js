const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sharekhata';

async function migrateCustomNames() {
  try {
    console.log('🚀 Starting migration: Add customName field to existing friendships');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get the Friendship model
    const Friendship = require('../models/Friendship');
    
    // Update all existing friendships to have customName field (set to default names)
    const result = await Friendship.updateMany(
      { customName: { $exists: false } },
      { $set: { customName: 'Friend' } }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} friendship documents`);
    
    // Verify the migration
    const totalFriendships = await Friendship.countDocuments();
    const friendshipsWithCustomName = await Friendship.countDocuments({ customName: { $exists: true } });
    
    console.log(`📊 Migration verification:`);
    console.log(`  Total friendships: ${totalFriendships}`);
    console.log(`  Friendships with customName field: ${friendshipsWithCustomName}`);
    
    if (totalFriendships === friendshipsWithCustomName) {
      console.log('✅ Migration completed successfully!');
    } else {
      console.log('⚠️ Migration may have issues');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the migration
migrateCustomNames(); 