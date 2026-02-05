# ShareKhata Transaction Structure Migration

## Overview
This migration updates the transaction structure from using `addedBy` (ObjectId) to using `sentBy` and `receivedBy` (mobile numbers) for more accurate balance calculations.

## What Changed

### Before (Old Structure)
```javascript
{
  type: 'added' | 'received',
  amount: Number,
  description: String,
  addedBy: ObjectId, // Who created the transaction record
  timestamp: Date
}
```

### After (New Structure)
```javascript
{
  type: 'added' | 'received',
  amount: Number,
  description: String,
  sentBy: String,      // Mobile number of who sent money
  receivedBy: String,  // Mobile number of who received money
  addedBy: ObjectId,   // Who created the transaction record (kept for backward compatibility)
  timestamp: Date
}
```

## Why This Change?

1. **Accurate Balance Calculation**: Now we can clearly see who actually sent/received money vs who just created the transaction record
2. **Mobile Number Based**: Uses mobile numbers (unique identifiers) instead of ObjectIds for transaction flow
3. **Better Transaction Flow**: Clear distinction between transaction creator and money flow participants

## Migration Process

### 1. Run the Migration Script
```bash
cd server
npm run migrate
```

### 2. What the Migration Does
- Finds all existing ledgers and transactions
- For each transaction, determines `sentBy` and `receivedBy` based on:
  - Transaction type (`added` vs `received`)
  - Who created the transaction (`addedBy`)
  - Ledger participants (`user1` and `user2`)
- Updates all transactions with the new fields
- Preserves existing data

### 3. Migration Logic

#### For 'added' transactions:
- **sentBy**: The person who added the transaction (they paid money)
- **receivedBy**: The other person in the ledger (they received money)

#### For 'received' transactions:
- **sentBy**: The other person in the ledger (they sent money)
- **receivedBy**: The person who added the transaction (they received money)

## API Changes

### Updated Endpoints
- `GET /ledger/:id` - Now returns `sentBy` and `receivedBy` in transactions
- `POST /ledger/:id/add` - Now requires and stores `sentBy`/`receivedBy`
- `POST /ledger/:id/receive` - Now requires and stores `sentBy`/`receivedBy`

### New Transaction Creation
```javascript
// Adding a transaction (you paid)
await ledger.addTransaction(
  'added',           // type
  amount,            // amount
  yourMobile,        // sentBy (you sent money)
  friendMobile,      // receivedBy (friend received money)
  yourUserId,        // addedBy (who created the record)
  description        // description
);

// Receiving a transaction (you received)
await ledger.addTransaction(
  'received',        // type
  amount,            // amount
  friendMobile,      // sentBy (friend sent money)
  yourMobile,        // receivedBy (you received money)
  yourUserId,        // addedBy (who created the record)
  description        // description
);
```

## Balance Calculation Changes

### Old Method
```javascript
// Used addedBy ObjectId comparison
if (transaction.addedBy.equals(userId)) {
  // This was unreliable
}
```

### New Method
```javascript
// Uses mobile number comparison
if (transaction.sentBy === userMobile) {
  // You sent money (more reliable)
}
if (transaction.receivedBy === userMobile) {
  // You received money (more reliable)
}
```

## Testing After Migration

1. **Check Console Logs**: Look for the new transaction structure in API responses
2. **Verify Balance Calculation**: Ensure "You paid" and "You received" amounts are correct
3. **Test New Transactions**: Add new transactions and verify they use the new structure
4. **Check Real-time Updates**: Ensure socket.io updates include the new fields

## Rollback (If Needed)

If you need to rollback:
1. Restore the old model files
2. Remove the `sentBy` and `receivedBy` fields from transactions
3. Revert API changes

## Notes

- **Backward Compatibility**: `addedBy` field is preserved for existing functionality
- **Data Integrity**: Migration script handles edge cases and validates data
- **Performance**: New structure may improve balance calculation performance
- **Real-time Updates**: Socket.io events now include the new transaction structure 