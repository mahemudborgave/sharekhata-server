const mongoose = require('mongoose');
const Ledger = require('../models/Ledger');
const User = require('../models/User');
require('dotenv').config();

async function migrateTransactions() {
  try {
    console.log('🔄 Starting transaction migration...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get all ledgers
    const ledgers = await Ledger.find({}).populate('user1', 'mobile').populate('user2', 'mobile');
    console.log(`📊 Found ${ledgers.length} ledgers to migrate`);
    
    let totalTransactions = 0;
    let migratedTransactions = 0;
    
    for (const ledger of ledgers) {
      console.log(`\n🔍 Processing ledger: ${ledger._id}`);
      console.log(`   User1: ${ledger.user1.mobile} (${ledger.user1._id})`);
      console.log(`   User2: ${ledger.user2.mobile} (${ledger.user2._id})`);
      console.log(`   Transactions: ${ledger.transactions.length}`);
      
      totalTransactions += ledger.transactions.length;
      
      for (let i = 0; i < ledger.transactions.length; i++) {
        const transaction = ledger.transactions[i];
        
        // Skip if already migrated
        if (transaction.sentBy && transaction.receivedBy) {
          console.log(`   Transaction ${i + 1}: Already migrated`);
          continue;
        }
        
        // Determine sentBy and receivedBy based on transaction type and addedBy
        let sentBy, receivedBy;
        
        if (transaction.type === 'added') {
          // For 'added' transactions, the person who added it is the one who paid
          if (transaction.addedBy.equals(ledger.user1._id)) {
            sentBy = ledger.user1.mobile;
            receivedBy = ledger.user2.mobile;
          } else {
            sentBy = ledger.user2.mobile;
            receivedBy = ledger.user1.mobile;
          }
        } else if (transaction.type === 'received') {
          // For 'received' transactions, the person who added it is the one who received
          if (transaction.addedBy.equals(ledger.user1._id)) {
            receivedBy = ledger.user1.mobile;
            sentBy = ledger.user2.mobile;
          } else {
            receivedBy = ledger.user2.mobile;
            sentBy = ledger.user1.mobile;
          }
        }
        
        // Update the transaction
        transaction.sentBy = sentBy;
        transaction.receivedBy = receivedBy;
        
        console.log(`   Transaction ${i + 1}: ${transaction.type} - ${sentBy} → ${receivedBy}`);
        migratedTransactions++;
      }
      
      // Save the updated ledger
      await ledger.save();
      console.log(`   ✅ Ledger saved`);
    }
    
    console.log(`\n🎉 Migration completed!`);
    console.log(`   Total transactions: ${totalTransactions}`);
    console.log(`   Migrated transactions: ${migratedTransactions}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateTransactions();
}

module.exports = migrateTransactions; 