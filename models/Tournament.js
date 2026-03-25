const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ffUid: String,
  inGameName: String,
  kills: { type: Number, default: 0 },
  rank: { type: Number, default: 0 },
  prizeWon: { type: Number, default: 0 }
});

const TournamentSchema = new mongoose.Schema({
  roomName: { type: String },
  roomCode: { type: String, required: true },
  password: { type: String },
  entryFee: { type: Number, required: true },
  prizePool: { type: Number, default: 0 },
  levelReq: { type: Number, default: 55 },
  gameMode: { type: String, enum: ['Classic', 'Clash Squad'], default: 'Classic' },
  teamSize: { type: String, enum: ['1v1', '2v2', '4v4'], default: '1v1' },
  status: { type: String, enum: ['Upcoming', 'Live', 'Completed'], default: 'Upcoming' },
  players: [PlayerSchema],
  maxPlayers: { type: Number, default: 48 },
  startTime: { type: Date, required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'Moderator' },
  prizeDistributed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Tournament', TournamentSchema);
