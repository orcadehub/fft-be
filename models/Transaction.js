const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['Success', 'Pending', 'Failed'], default: 'Success' },
  referenceId: { type: String }, // Razorpay Payment ID or Tournament ID
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
