const mongoose = require('mongoose');
const Ledger = require('./models/Ledger');
const User = require('./models/User');
require('dotenv').config();

async function testNewStructure() {
  try {
    console.log('🧪 Testing new transaction structure...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get a sample ledger
    const ledgers = await Ledger.find({}).populate('user1', 'mobile').populate('user2', 'mobile').limit(1);
    
    if (ledgers.length === 0) {
      console.log('❌ No ledgers found to test');
      return;
    }
    
    const ledger = ledgers[0];
    console.log(`\n🔍 Testing ledger: ${ledger._id}`);
    console.log(`   User1: ${ledger.user1.mobile}`);
    console.log(`   User2: ${ledger.user2.mobile}`);
    console.log(`   Transactions: ${ledger.transactions.length}`);
    
    // Test balance calculation for user1
    const user1Balance = ledger.getBalanceForUser(ledger.user1.mobile);
    console.log(`\n💰 User1 balance: ${user1Balance}`);
    
    // Test balance calculation for user2
    const user2Balance = ledger.getBalanceForUser(ledger.user2.mobile);
    console.log(`💰 User2 balance: ${user2Balance}`);
    
    // Test balance breakdown
    const breakdown = ledger.getBalanceBreakdown();
    console.log(`\n🔍 Balance breakdown:`, breakdown);
    
    // Test transaction structure
    console.log(`\n📝 Transaction structure test:`);
    ledger.transactions.forEach((transaction, index) => {
      console.log(`   Transaction ${index + 1}:`);
      console.log(`     Type: ${transaction.type}`);
      console.log(`     Amount: ${transaction.amount}`);
      console.log(`     Sent By: ${transaction.sentBy}`);
      console.log(`     Received By: ${transaction.receivedBy}`);
      console.log(`     Added By: ${transaction.addedBy}`);
      console.log(`     Has sentBy: ${!!transaction.sentBy}`);
      console.log(`     Has receivedBy: ${!!transaction.receivedBy}`);
    });
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testNewStructure();
}

module.exports = testNewStructure; 