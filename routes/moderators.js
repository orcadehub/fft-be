const express = require('express');
const router = express.Router();
const Moderator = require('../models/Moderator');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Seed an initial admin if none exists
const initAdmin = async () => {
  try {
    const adminExists = await Moderator.findOne({ username: 'ajithkumargurram@gmail.com' });
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('AzzuDeepthi@143', salt);
      await Moderator.create({ username: 'ajithkumargurram@gmail.com', password: hashedPassword });
      console.log('Seeded initial moderator: ajithkumargurram@gmail.com');
    }
  } catch (err) {
    console.error('Failed to seed admin:', err);
  }
};
initAdmin();

// Admin Login Route
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find moderator by username
    const moderator = await Moderator.findOne({ username });
    if (!moderator) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, moderator.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Sign JWT Token
    const payload = {
      id: moderator._id,
      role: moderator.role
    };
    
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
    
    res.json({ 
      token, 
      moderator: { 
        id: moderator._id, 
        username: moderator.username, 
        role: moderator.role 
      } 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
// Middleware to verify Moderation JWT
const adminAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token, access denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.role || !['admin', 'superadmin'].includes(decoded.role)) {
      throw new Error();
    }
    req.moderator = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid admin token' });
  }
};

// Get ALL tournaments for admin
router.get('/tournaments', adminAuth, async (req, res) => {
  try {
    const tournaments = await Tournament.find().sort({ startTime: -1 });
    res.json(tournaments);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create Tournament (Admin)
router.post('/tournaments', adminAuth, async (req, res) => {
  try {
    const { roomCode, password, entryFee, gameMode, startTime, maxPlayers, teamSize } = req.body;
    
    // Auto-generate roomName: FFT_ddmmyyyy_XXZ_yy
    const dt = startTime ? new Date(startTime) : new Date();
    const ddmmyyyy = String(dt.getDate()).padStart(2, '0') + 
                     String(dt.getMonth() + 1).padStart(2, '0') + 
                     dt.getFullYear();
    const xx = gameMode === 'Classic' ? 'CL' : 'CS';
    const z = String(teamSize).includes('1v1') ? '1' : String(teamSize).includes('2v2') ? '2' : '4';
    const prefix = `FFT_${ddmmyyyy}_${xx}${z}_`;

    const lastTournament = await Tournament.find({ roomName: new RegExp(`^${prefix}`) })
      .sort({ roomName: -1 })
      .limit(1);

    let yy = '01';
    if (lastTournament.length > 0 && lastTournament[0].roomName) {
       const lastYy = parseInt(lastTournament[0].roomName.split('_').pop());
       if (!isNaN(lastYy)) {
          yy = String(lastYy + 1).padStart(2, '0');
       }
    }
    const roomName = `${prefix}${yy}`;

    const tournament = new Tournament({
      roomName,
      roomCode: roomCode || 'TBD',
      password: password || 'TBD',
      entryFee: entryFee || 0,
      gameMode,
      teamSize,
      startTime: startTime || new Date(Date.now() + 3600000), // Default 1 hr from now
      maxPlayers: maxPlayers || 48,
      creator: req.moderator.id,
      prizePool: req.body.prizePool !== undefined ? req.body.prizePool : (entryFee || 0) * (maxPlayers || 48) * 0.8 // use body prizePool or 80% of total entry collection
    });
    
    await tournament.save();
    res.status(201).json(tournament);
  } catch (err) {
    res.status(500).json({ error: 'Server error when creating tournament' });
  }
});

// Update Tournament (Admin)
router.put('/tournaments/:id', adminAuth, async (req, res) => {
  try {
    const tournament = await Tournament.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    );
    if (!tournament) return res.status(404).json({ error: 'Not found' });
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete Tournament (Admin) with full refunds
router.delete('/tournaments/:id', adminAuth, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Not found' });

    let refundAmount = Number(tournament.entryFee) || 0;
    if (tournament.teamSize === '2v2') refundAmount = refundAmount / 2;
    if (tournament.teamSize === '4v4') refundAmount = refundAmount / 4;
    
    const playersToRefund = tournament.players || [];

    console.log(`[Tournament Delete] Processing refunds for ${playersToRefund.length} players. Amount: ${refundAmount}`);

    // Process refunds ONLY if prizes haven't been distributed yet
    if (!tournament.prizeDistributed && playersToRefund.length > 0) {
      const io = req.app.get('io');
      const refundPromises = playersToRefund.map(async (player) => {
        // Handle both populated and unpopulated user field
        const userId = player.user?._id || player.user;
        if (!userId) {
          console.warn(`[Refund] Skipping player ${player._id} because user ID is missing.`);
          return;
        }
        
        console.log(`[Refund] Crediting ₹${refundAmount} to User: ${userId}`);

        // 1. Credit the user's wallet - Using findByIdAndUpdate for simplicity
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          { $inc: { walletBalance: Number(refundAmount) } },
          { new: true, runValidators: true }
        );
        
        if (!updatedUser) {
          console.error(`[Refund Error] Failed to find User with ID: ${userId} for tourney: ${tournament._id}`);
          return;
        }

        console.log(`[Refund Success] User ${userId} wallet: ₹${updatedUser.walletBalance} (Credited ₹${refundAmount})`);

        // Emit socket update to user's personal room
        if (io) {
          io.to(userId.toString()).emit('wallet_balance_update', updatedUser.walletBalance);
        }

        // 2. Create a transaction record
        await Transaction.create({
          user: userId,
          type: 'CREDIT',
          amount: refundAmount,
          description: `Refund for tournament deletion: ${tournament.roomName || tournament.roomCode}`,
          status: 'Success',
          referenceId: tournament._id.toString()
        });
      });

      await Promise.all(refundPromises);
    }

    // Finally delete the tournament
    await Tournament.findByIdAndDelete(req.params.id);
    
    res.json({ 
      message: tournament.prizeDistributed 
        ? 'Deleted successfully (no refunds issued as prizes were already distributed)' 
        : 'Deleted successfully and refunded all players',
      refunded: !tournament.prizeDistributed,
      refundCount: !tournament.prizeDistributed ? playersToRefund.length : 0
    });
  } catch (err) {
    console.error('Delete/Refund Error:', err);
    res.status(500).json({ error: 'Server error during deletion and refund process' });
  }
});

// Get ALL users for admin
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error when fetching users' });
  }
});

// Update User Password (Admin)
router.put('/users/:id/password', adminAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.password = password; // The pre-save hook in User model will hash this
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('[Admin] Password Update Error:', err);
    res.status(500).json({ error: 'Server error when updating password' });
  }
});

module.exports = router;
