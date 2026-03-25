const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const auth = require('../middleware/auth');

let razorpay;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// Verify payment (Now updates wallet)
router.post('/verify', auth, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay) return res.status(500).json({ error: 'Razorpay disabled' });

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    try {
      // Update Payment Record
      const payment = await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        { razorpayPaymentId: razorpay_payment_id, status: 'Success' },
        { new: true }
      );

      if (!payment) return res.status(404).json({ error: 'Order not found' });

      // Update User Wallet
      const User = require('../models/User');
      const user = await User.findById(payment.user);
      if (!user) return res.status(404).json({ error: 'User not found' });

      user.walletBalance += payment.amount;
      await user.save();

      // Create Transaction Record
      const Transaction = require('../models/Transaction');
      await new Transaction({
        user: user._id,
        type: 'CREDIT',
        amount: payment.amount,
        description: 'Wallet Recharge',
        referenceId: payment._id,
        status: 'Success'
      }).save();

      res.status(200).json({ 
        status: 'Recharge Successful', 
        walletBalance: user.walletBalance,
        addedAmount: payment.amount
      });
    } catch (err) {
      console.error('Verify error:', err);
      res.status(500).json({ error: 'Verification failed' });
    }
  } else {
    res.status(400).json({ error: 'Invalid signature' });
  }
});

// Create recharge order (Multiples of 100 only)
router.post('/recharge', auth, async (req, res) => {
  const { amount } = req.body;
  console.log(`[Recharge Request] User: ${req.user._id}, Amount: ${amount}`);
  
  if (!amount || amount < 100 || amount % 100 !== 0) {
    return res.status(400).json({ error: 'Recharge amount must be a multiple of 100' });
  }

  if (!razorpay) return res.status(500).json({ error: 'Razorpay disabled' });

  const options = {
    amount: amount * 100, // paise
    currency: "INR",
    receipt: `rcpt_recharge_${crypto.randomBytes(8).toString('hex')}`
  };

  try {
    const order = await razorpay.orders.create(options);
    
    await new Payment({
      user: req.user._id,
      razorpayOrderId: order.id,
      amount
    }).save();

    res.json({ order, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('Recharge Order error:', err);
    res.status(500).json({ error: 'Failed to create recharge order' });
  }
});

// Get user transactions
router.get('/transactions', auth, async (req, res) => {
  try {
    const Transaction = require('../models/Transaction');
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(transactions);
  } catch (err) {
    console.error('Fetch transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
});

module.exports = router;
