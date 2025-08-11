const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  friendId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }, // null if unregistered
  friendMobile: {
    type: String,
    required: true,
    match: /^[6-9]\d{9}$/
  },
  customName: {
    type: String,
    trim: true,
    maxlength: 50,
    required: true
  }, // Custom name given by requester (required)
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending'
  },
  ledgerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ledger',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
friendshipSchema.index({ requesterId: 1, friendMobile: 1 }, { unique: true });
friendshipSchema.index({ friendMobile: 1, status: 1 });
friendshipSchema.index({ requesterId: 1, status: 1 });

// Method to check if friendship is active
friendshipSchema.methods.isActive = function() {
  return this.status === 'accepted';
};

// Method to check if friend is registered
friendshipSchema.methods.isFriendRegistered = function() {
  return this.friendId !== null && this.friendId !== undefined;
};

// Static method to find friendship between two users
friendshipSchema.statics.findFriendship = function(user1Id, user2Id) {
  return this.findOne({
    $or: [
      { requesterId: user1Id, friendId: user2Id },
      { requesterId: user2Id, friendId: user1Id }
    ],
    status: 'accepted'
  });
};

// Static method to find pending friendships by mobile
friendshipSchema.statics.findPendingByMobile = function(mobile) {
  return this.find({
    friendMobile: mobile,
    status: 'pending'
  });
};

module.exports = mongoose.model('Friendship', friendshipSchema); 