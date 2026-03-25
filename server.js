const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

dotenv.config();
const app = express();
const server = http.createServer(app);

// Auto-generation disabled: Moderators now manually create rooms.

const allowedOrigins = ['http://localhost:5173', 'https://fftourney.com', 'https://www.fftourney.com'];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(express.json());
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(helmet());
app.use(morgan('dev'));

// Database connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Health Check Route
app.get('/', (req, res) => {
  res.json({ message: 'Free Fire Tournament Server is Running' });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/player', require('./routes/player'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/moderators', require('./routes/moderators'));

// Socket.io for real-time leaderboards
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_tournament', (tournamentId) => {
    socket.join(tournamentId);
    console.log(`Socket ${socket.id} joined tournament ${tournamentId}`);
  });

  socket.on('join_user', (userId) => {
    socket.join(userId);
    console.log(`Socket ${socket.id} joined personal room ${userId}`);
  });

  socket.on('update_score', (data) => {
    // Expected data: { tournamentId, playerUid, kills, rank }
    io.to(data.tournamentId).emit('leaderboard_update', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Background Job: Auto-update Tournament Statuses (Upcoming -> Live -> Completed)
  const { updateTournamentStatuses } = require('./utils/TournamentStatusManager');
  setInterval(() => {
    updateTournamentStatuses(io);
  }, 60000); // Check Every 1 Minute
});
