const Tournament = require('../models/Tournament');

async function autoGenerateTournaments() {
    try {
        console.log('[Auto-Generator] Checking for new matches to generate...');

        const now = new Date();
        const tournamentsToCreate = [];
        
        let currentPointer = new Date(now);
        currentPointer.setMinutes(0, 0, 0); // start at the top of the next hour
        
        const modes = ['Classic', 'Clash Squad'];
        const sizes = [
            { size: '1v1', minutes: 0, mult: 1 },
            { size: '2v2', minutes: 20, mult: 2 },
            { size: '4v4', minutes: 40, mult: 4 }
        ];

        // Fetch existing roomCodes to avoid duplicates
        const existingTournaments = await Tournament.find({ 
            status: 'Upcoming',
            startTime: { $gte: now }
        }).select('roomCode');
        const existingRoomCodes = new Set(existingTournaments.map(t => t.roomCode));

        // Generate matches for the next 48 hours to be safe (Hourly frequency)
        for (let i = 1; i <= 48; i++) {
            const loopPointer = new Date(currentPointer);
            loopPointer.setHours(loopPointer.getHours() + i);
            
            const year = loopPointer.getFullYear();
            const month = String(loopPointer.getMonth() + 1).padStart(2, '0');
            const day = String(loopPointer.getDate()).padStart(2, '0');
            const hour = loopPointer.getHours();
            const hourCode = String(hour).padStart(2, '0');

            // Price Cycle: 20, 40, 80 based on hour of day
            const priceCycle = [20, 40, 80];
            const basePrice = priceCycle[hour % 3];

            modes.forEach(mode => {
                const modeCode = mode === 'Classic' ? 'CL' : 'CS';
                
                sizes.forEach(({ size, minutes, mult }) => {
                    const startTime = new Date(loopPointer);
                    startTime.setMinutes(minutes);
                    
                    if (startTime > now) {
                        const sizeCode = size.replace('v', '');
                        // Stable Format: fft_DDMMYYYY_HHMM_MODE_SIZE
                        const minutesCode = String(minutes).padStart(2, '0');
                        const roomCode = `fft_${day}${month}${year}_${hourCode}${minutesCode}_${modeCode}_${sizeCode}`;

                        if (!existingRoomCodes.has(roomCode)) {
                            tournamentsToCreate.push({
                                roomCode,
                                password: '123',
                                entryFee: basePrice * mult,
                                prizePool: Math.floor((basePrice * 48) * 0.85),
                                gameMode: mode,
                                teamSize: size,
                                maxPlayers: 48,
                                startTime: startTime,
                                status: 'Upcoming'
                            });
                        }
                    }
                });
            });
        }

        if (tournamentsToCreate.length > 0) {
            await Tournament.insertMany(tournamentsToCreate);
            console.log(`[Auto-Generator] Generated ${tournamentsToCreate.length} new matches.`);
        } else {
            console.log('[Auto-Generator] No new matches to generate.');
        }
    } catch (err) {
        console.error('[Auto-Generator] Error:', err);
    }
}

module.exports = { autoGenerateTournaments };
