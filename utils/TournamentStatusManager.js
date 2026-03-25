const Tournament = require('../models/Tournament');

const updateTournamentStatuses = async (io) => {
  try {
    const now = new Date();
    
    // 1. Mark 'Upcoming' as 'Live' if current time >= startTime
    const upcomingToLive = await Tournament.updateMany(
      { 
        status: 'Upcoming', 
        startTime: { $lte: now } 
      },
      { $set: { status: 'Live' } }
    );

    if (upcomingToLive.modifiedCount > 0) {
      console.log(`[Status Manager] ${upcomingToLive.modifiedCount} matches marked as Live (Time matched)`);
      if (io) io.emit('tournament_status_update', { status: 'Live' });
    }

    // 2. Mark 'Live' as 'Completed' if 30 minutes (1800000 ms) have passed since startTime
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const liveToCompleted = await Tournament.updateMany(
      { 
        status: 'Live', 
        startTime: { $lte: thirtyMinutesAgo } 
      },
      { $set: { status: 'Completed' } }
    );

    if (liveToCompleted.modifiedCount > 0) {
      console.log(`[Status Manager] ${liveToCompleted.modifiedCount} matches marked as Completed (Time expired)`);
      if (io) io.emit('tournament_status_update', { status: 'Completed' });
    }
  } catch (err) {
    console.error('[Status Manager Error]', err.message);
  }
};

module.exports = { updateTournamentStatuses };
