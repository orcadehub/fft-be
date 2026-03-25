const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Tournament = require('./models/Tournament');

dotenv.config();

const seedTournaments = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for seeding...');

    // Clear all existing seeded tournaments
    await Tournament.deleteMany({});
    console.log('Cleared all existing matches.');

    const now = new Date();
    const modes = ['Classic', 'Clash Squad'];
    
    // Updated Team Settings: 48 players total 
    const sizes = [
      { size: '1v1', minutes: 0, mult: 1, maxTeams: 48 },
      { size: '2v2', minutes: 20, mult: 2, maxTeams: 24 }, // 24 duos
      { size: '4v4', minutes: 40, mult: 4, maxTeams: 12 }  // 12 squads
    ];

    const tournaments = [];
    const tomorrow = new Date(now.getTime() + (24 * 60 * 60 * 1000));

    // Iterate through hours for the next 24+ hours
    for (let i = 0; i < 36; i++) {
        const d = new Date(now);
        d.setHours(now.getHours() + i);
        
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hourForCode = d.getHours();

        // 3-hour price cycle for the BASE entry fee
        const priceCycle = [20, 40, 80];
        const basePrice = priceCycle[i % 3];

        modes.forEach(mode => {
            const modeCode = mode === 'Classic' ? 'CL' : 'CS';
            
            sizes.forEach(({ size, minutes, mult, maxTeams }) => {
                const startTime = new Date(d);
                startTime.setMinutes(minutes);
                startTime.setSeconds(0);
                startTime.setMilliseconds(0);

                if (startTime > now) {
                    const timeCode = String(hourForCode).padStart(2, '0') + String(minutes).padStart(2, '0');
                    const roomCode = `fft_${day}${month}${year}_${modeCode}_${timeCode}`;
                    
                    // Final entry fee is per Team (1x, 2x, or 4x the base price)
                    const entryFee = basePrice * mult;
                    
                    // Total players is always 48 for these tournaments
                    const totalPlayers = size === '1v1' ? 48 : (size === '2v2' ? 48 : 48);
                    
                    // Prize Pool based on total players paying the base price (minus 15% platform fee)
                    const prizePool = Math.floor((basePrice * totalPlayers) * 0.85);

                    // For Clash Squad, the user usually wants it smaller, but I will stick to 48 players total for now
                    // keeping maxPlayers consistent for tournament join logic.

                    tournaments.push({
                        roomCode,
                        password: '123',
                        entryFee, // Entry fee is per Team/Duo as requested
                        prizePool,
                        gameMode: mode,
                        teamSize: size,
                        maxPlayers: totalPlayers,
                        startTime: startTime,
                        status: 'Upcoming'
                    });
                }
            });
        });
    }

    if (tournaments.length > 0) {
      await Tournament.insertMany(tournaments);
      console.log(`Successfully seeded ${tournaments.length} matches with updated Team Pricing!`);
    }

    process.exit();
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
};

seedTournaments();
