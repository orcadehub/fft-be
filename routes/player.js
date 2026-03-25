const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Get player stats (Mocked from FF API)
router.get('/:uid', async (req, res) => {
  try {
    const user = await User.findOne({ ffUid: req.params.uid });
    if (!user) {
      // Return a mocked profile if not found
      return res.json({
        ffUid: req.params.uid,
        inGameName: `Guest_${req.params.uid.substring(0, 4)}`,
        level: Math.floor(Math.random() * 80) + 1,
        stats: { kdRatio: (Math.random() * 5).toFixed(2), wins: Math.floor(Math.random()*100) },
        found: false
      });
    }

    const ffData = user.ffData || {};
    const info = ffData.basicInfo || {};
    
    res.json({ 
      ...user.toJSON(),
      inGameName: info.nickname || user.inGameName,
      level: info.level || user.level,
      rank: info.rank,
      csRank: info.csRank,
      found: true 
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
