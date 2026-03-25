const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');

// Verify FF UID (Check if player exists and meet level requirements)
router.get('/verify/:uid', async (req, res) => {
  const { uid } = req.params;
  
  if (!uid) {
    return res.status(400).json({ error: 'UID is required' });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ ffUid: uid });
    if (existingUser) {
      return res.status(400).json({ error: 'This UID is already registered' });
    }

    const apiKey = process.env.FREEFIRE_API_KEY;
    console.log(`[API] Verifying UID ${uid}...`);
    
    try {
      // Check Ban Status First
      const banRes = await axios.get(`https://developers.freefirecommunity.com/api/v1/bancheck?key=${apiKey}&lang=en&uid=${uid}`);
      const isBanned = banRes.data?.data?.is_banned === 1;

      if (isBanned) {
         return res.status(403).json({ 
            error: 'CRITICAL: This Free Fire account is BANNED.', 
            isBanned: true 
         });
      }

      const apiRes = await axios.get(`https://developers.freefirecommunity.com/api/v1/info?key=${apiKey}&region=ind&uid=${uid}`);
      
      if (apiRes.data && apiRes.data.basicInfo) {
        const { nickname, level } = apiRes.data.basicInfo;
        return res.json({ 
          success: true, 
          name: nickname || 'Unknown', 
          level: parseInt(level) || 0,
          raw: apiRes.data
        });
      } else {
        return res.status(404).json({ error: 'Player not found in Free Fire Database' });
      }
    } catch (apiErr) {
      console.error('[API Error]', apiErr.response?.data || apiErr.message);
      return res.status(500).json({ error: 'Could not connect to Free Fire Server' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register a new user (Signup)
router.post('/register', async (req, res) => {
  const { ffUid, password } = req.body;
  
  if (!ffUid || !password) {
    return res.status(400).json({ error: 'UID and Password are required' });
  }

  try {
    let user = await User.findOne({ ffUid });
    if (user) return res.status(400).json({ error: 'User with this UID already exists' });

    let ffData = {};
    let other = {};
    let inGameName = 'New Player';
    let level = 0;
    let stats = { kdRatio: 0, matchesPlayed: 0, wins: 0 };
    let isBanned = false; // Track ban status

    try {
      const apiKey = process.env.FREEFIRE_API_KEY;
      
      // Mandatory Ban Check on Final Register
      const banRes = await axios.get(`https://developers.freefirecommunity.com/api/v1/bancheck?key=${apiKey}&lang=en&uid=${ffUid}`);
      if (banRes.data?.data?.is_banned === 1) {
          return res.status(403).json({ error: 'This account is BANNED from Free Fire and cannot be registered.' });
      }

      const apiRes = await axios.get(`https://developers.freefirecommunity.com/api/v1/info?key=${apiKey}&region=ind&uid=${ffUid}`);
      
      if (apiRes.data) {
        other = apiRes.data; // Store full response here
        
        if (apiRes.data.basicInfo) {
          ffData = apiRes.data;
          inGameName = apiRes.data.basicInfo.nickname || inGameName;
          level = apiRes.data.basicInfo.level || 0;

          // Populate combat stats if available
          if (apiRes.data.combatStats) {
            stats.kdRatio = apiRes.data.combatStats.kdRatio || 0;
            stats.matchesPlayed = apiRes.data.combatStats.matchesPlayed || 0;
            stats.wins = apiRes.data.combatStats.wins || 0;
          }
          console.log(`[API] Detailed Sync for ${ffUid}: ${inGameName}`);
        }
      }
    } catch (apiErr) {
      console.error('[API Error] FF Data Sync Failed:', apiErr.response?.data || apiErr.message);
    }

    user = new User({
      ffUid,
      password,
      inGameName,
      level,
      stats,
      ffData,
      other,
      isBanned
    });

    await user.save();
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { ffUid, password } = req.body;
  
  if (!ffUid || !password) {
    return res.status(400).json({ error: 'UID and Password are required' });
  }

  try {
    const user = await User.findOne({ ffUid });
    if (!user) return res.status(401).json({ error: 'Player account not found. Please register first.' });

    // Check if account is banned in our records
    if (user.isBanned) {
        return res.status(403).json({ error: 'ACCESS DENIED: This account has been banned due to policy violations.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid password. Try again.' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const auth = require('../middleware/auth');
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
