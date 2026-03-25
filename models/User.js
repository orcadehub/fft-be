const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  ffUid: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  inGameName: { type: String, default: 'New Player' },
  level: { type: Number, default: 0 },
  walletBalance: { type: Number, default: 0 },
  totalWinnings: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  stats: {
    kdRatio: { type: Number, default: 0 },
    matchesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 }
  },
  digiLockerVerified: { type: Boolean, default: false },
  ffData: { type: mongoose.Schema.Types.Mixed, default: {} },
  other: { type: mongoose.Schema.Types.Mixed, default: {} },
  isBanned: { type: Boolean, default: false }
}, { timestamps: true });

UserSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await new Promise((resolve, reject) => {
    bcrypt.hash(this.password, 10, (err, hash) => {
      if (err) reject(err);
      resolve(hash);
    });
  });
});

UserSchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
