/**
 * Migration: Add dummy email to existing users who don't have one
 * Format: <mobile>@sharekhata.app
 *
 * Run with: node migrations/add-email-to-users.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const usersWithoutEmail = await User.find({
      $or: [{ email: null }, { email: { $exists: false } }]
    });

    console.log(`Found ${usersWithoutEmail.length} users without email`);

    let updated = 0;
    for (const user of usersWithoutEmail) {
      user.email = `${user.mobile}@sharekhata.app`;
      await user.save();
      updated++;
      console.log(`  Updated: ${user.name} (${user.mobile}) → ${user.email}`);
    }

    console.log(`\n✅ Migration complete. Updated ${updated} users.`);
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
