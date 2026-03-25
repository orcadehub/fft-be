const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Create tournament
router.post('/', auth, async (req, res) => {
  if (req.user.level < 60) {
    return res.status(403).json({ error: 'Level 60+ required to create a tournament' });
  }

  try {
    const { roomCode, password, entryFee, gameMode, startTime, maxPlayers } = req.body;
    const tournament = new Tournament({
      roomCode,
      password,
      entryFee,
      gameMode,
      startTime,
      maxPlayers,
      creator: req.user._id,
      prizePool: entryFee * maxPlayers * 0.85 // 15% platform fee assumption
    });
    
    await tournament.save();
    res.status(201).json(tournament);
  } catch (err) {
    res.status(500).json({ error: 'Server error when creating tournament' });
  }
});

// Get live tournaments
router.get('/live', async (req, res) => {
  try {
    const tournaments = await Tournament.find({ status: { $in: ['Upcoming', 'Live'] } })
      .populate('creator', 'inGameName')
      .sort({ startTime: 1 });
    res.json(tournaments);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all enrolled tournaments for an authenticated user
router.get('/enrolled', auth, async (req, res) => {
  try {
    const tournaments = await Tournament.find({ 'players.user': req.user._id })
      .populate('creator', 'inGameName')
      .sort({ startTime: -1 });
    res.json(tournaments);
  } catch (err) {
    console.error('Fetch Enrolled Error: ', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join tournament (Wallet Based)
router.post('/:id/join', auth, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    
    // Check if full
    if (tournament.players.length >= tournament.maxPlayers) {
      return res.status(400).json({ error: 'Tournament is full' });
    }

    // Check if already joined
    if (tournament.players.find(p => p.user.toString() === req.user._id.toString())) {
      return res.status(400).json({ error: 'Already joined' });
    }

    // Check Time Limits
    const timeRemainingMs = new Date(tournament.startTime) - new Date();
    if (timeRemainingMs <= 2 * 60 * 1000) {
      return res.status(400).json({ error: 'Registration is closed (less than 2 minutes remaining)' });
    }

    // Check Level
    if (req.user.level < tournament.levelReq) {
      return res.status(403).json({ error: `Level ${tournament.levelReq}+ required to join` });
    }

    // Find fresh user to check wallet
    const user = await User.findById(req.user._id);
    
    // Calculate Per Player Fee
    let perPlayerFee = tournament.entryFee;
    if (tournament.teamSize === '2v2') perPlayerFee = tournament.entryFee / 2;
    if (tournament.teamSize === '4v4') perPlayerFee = tournament.entryFee / 4;

    let updatedWalletBalance = user.walletBalance;

    // Handle Paid Tournament Logic
    if (perPlayerFee > 0) {
      if (user.walletBalance < perPlayerFee) {
        return res.status(400).json({ 
          error: 'Insufficient funds. Please recharge your wallet.',
          requiresRecharge: true,
          missingAmount: perPlayerFee - user.walletBalance
        });
      }

      console.log(`[Join Debit Attempt] User: ${user._id}, Balance Before: ${user.walletBalance}, Amount: ${perPlayerFee}`);

      // Deduct from wallet atomically
      const updatedUserDoc = await User.findOneAndUpdate(
        { _id: user._id, walletBalance: { $gte: perPlayerFee } },
        { $inc: { walletBalance: -perPlayerFee } },
        { new: true }
      );

      if (!updatedUserDoc) {
        console.error(`[Join Debit Error] User ${user._id} Insufficient funds or Not Found`);
        return res.status(400).json({ error: 'Insufficient funds. Please recharge your wallet.' });
      }

      updatedWalletBalance = updatedUserDoc.walletBalance;
      console.log(`[Join Debit Success] User: ${user._id}, Balance After: ${updatedWalletBalance}`);

      // Create Transaction Record
      const Transaction = require('../models/Transaction');
      await Transaction.create({
        user: user._id,
        type: 'DEBIT',
        amount: perPlayerFee,
        description: `Tournament Participation: ${tournament.gameMode} (${tournament.teamSize})`,
        referenceId: tournament._id,
        status: 'Success'
      });
    }

    // Join tournament (Common for Paid and Free)
    tournament.players.push({
      user: user._id,
      ffUid: user.ffUid,
      inGameName: user.inGameName
    });

    await tournament.save();

    // Broadcast update using socket.io
    const io = req.app.get('io');
    io.to(tournament._id.toString()).emit('player_joined', tournament.players);

    res.json({ message: 'Joined successfully', tournament, walletBalance: updatedWalletBalance });
  } catch (err) {
    console.error('Join error: ', err);
    res.status(500).json({ error: 'Server error joining tournament' });
  }
});

// Get tournament with leaderboard
router.get('/:id', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate('creator', 'inGameName')
      .populate('players.user', 'stats');
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get Global Leaderboard (Top 100 by Total Winnings)
router.get('/leaderboard', async (req, res) => {
  try {
    const topPlayers = await User.find({})
      .sort({ totalWinnings: -1, inGameName: 1 })
      .limit(100)
      .select('inGameName ffUid totalWinnings stats');
    res.json(topPlayers);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching leaderboard' });
  }
});

module.exports = router;
