/**
 * Migration: Backfill createdAt for all ledger transactions that don't have it.
 * Uses the ObjectId embedded timestamp as the source of truth.
 *
 * Run with: node migrations/backfill-transaction-createdAt.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const ledgers = db.collection('ledgers');

    const result = await ledgers.updateMany(
      {}, // all ledgers, no filter
      [
        {
          $set: {
            transactions: {
              $map: {
                input: '$transactions',
                as: 't',
                in: {
                  $mergeObjects: [
                    '$$t',
                    {
                      // Always overwrite createdAt from ObjectId timestamp
                      createdAt: { $toDate: '$$t._id' }
                    }
                  ]
                }
              }
            }
          }
        }
      ]
    );

    console.log(`✅ Migration complete.`);
    console.log(`   Matched:  ${result.matchedCount} ledgers`);
    console.log(`   Modified: ${result.modifiedCount} ledgers`);
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

migrate();
