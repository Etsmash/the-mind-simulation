class TheMindSimulation {
    constructor(config) {
        this.numPlayers = config.numPlayers || 4;
        this.cardsPerPlayer = config.cardsPerPlayer || 5;
        this.timeMultiplier = config.timeMultiplier || 300;
        this.variance = config.variance || 150;
        
        this.deck = [];
        this.players = []; 
        this.centerPile = 0;
        this.lastTime = 0;
        
        // Frustration persists across visual resets or is managed within single runs
        this.frustration = config.frustration || Array(this.numPlayers).fill(0);
        
        this.status = 'idle'; // idle, running, won, lost
        this.logs = []; // Detailed telemetry for analytics
    }

    reset() {
        this.centerPile = 0;
        this.status = 'idle';
        this.logs = [];
        this.lastTime = 0;
    }

    startRound() {
        // Create deck 1-100
        this.deck = Array.from({length: 100}, (_, i) => i + 1);
        this.centerPile = 0;
        this.lastTime = 0;
        this.logs = [];
        
        // Shuffle deck
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }

        // Deal cards
        this.players = Array.from({length: this.numPlayers}, () => []);
        for (let i = 0; i < this.cardsPerPlayer; i++) {
            for (let p = 0; p < this.numPlayers; p++) {
                this.players[p].push(this.deck.pop());
            }
        }

        // Sort player hands descending so pop() gets lowest
        this.players.forEach(hand => hand.sort((a, b) => b - a));

        this.status = 'running';
    }

    getNextPlay() {
        let nextPlay = null;
        
        for (let p = 0; p < this.numPlayers; p++) {
            let hand = this.players[p];
            if (hand.length > 0) {
                let lowestCard = hand[hand.length - 1]; 
                let diff = lowestCard - this.centerPile;
                
                // Add a random gaussian-like noise for variance (representing human indecisiveness)
                let rand1 = Math.random();
                let rand2 = Math.random();
                let rand3 = Math.random();
                let normalRand = (rand1 + rand2 + rand3 - 1.5) * 2; 
                
                let randomNoise = normalRand * this.variance;
                
                let tTime = (diff * this.timeMultiplier) + randomNoise;
                if (tTime < 0) tTime = 0;

                if (!nextPlay || tTime < nextPlay.intendedTime) {
                    nextPlay = {
                        playerIndex: p,
                        cardValue: lowestCard,
                        intendedTime: tTime
                    };
                }
            }
        }

        return nextPlay;
    }

    playNextCard() {
        if (this.status !== 'running') return null;

        let next = this.getNextPlay();
        if (!next) {
            // Out of cards
            this.status = 'won';
            return { type: 'won' };
        }

        const isFirstCard = this.centerPile === 0;
        const timeBetween = next.intendedTime; // This is the relative time wait for this specific card
        
        // Remove card from player's hand
        this.players[next.playerIndex].pop();

        // Check if there was any lower card in ANY other player's hand
        let mistake = false;
        let discardedCards = [];
        
        for (let p = 0; p < this.numPlayers; p++) {
            if (p !== next.playerIndex) {
                let pHand = this.players[p];
                for (let i = pHand.length - 1; i >= 0; i--) {
                    if (pHand[i] < next.cardValue) {
                        mistake = true;
                        discardedCards.push({player: p, card: pHand[i]});
                        pHand.splice(i, 1);
                    }
                }
            }
        }

        this.centerPile = next.cardValue;

        const logEntry = {
            player: next.playerIndex,
            card: next.cardValue,
            timeBetween: timeBetween,
            isFirstCard: isFirstCard,
            status: mistake ? 'fail' : 'pass'
        };
        this.logs.push(logEntry);

        if (mistake) {
            this.status = 'lost';
            // Increase frustration for everyone else
            for (let i = 0; i < this.numPlayers; i++) {
                if (i !== next.playerIndex) {
                    this.frustration[i] = Math.min(100, this.frustration[i] + 25);
                }
            }
            return {
                type: 'mistake',
                player: next.playerIndex,
                card: next.cardValue,
                discarded: discardedCards
            };
        }

        // Check if game complete
        let totalCardsLeft = this.players.reduce((sum, hand) => sum + hand.length, 0);
        if (totalCardsLeft === 0) {
            this.status = 'won';
            return {
                type: 'play_and_won',
                player: next.playerIndex,
                card: next.cardValue
            };
        }

        return {
            type: 'play',
            player: next.playerIndex,
            card: next.cardValue
        };
    }
    
    // Static methods to generate advice based on analytics data
    static generateStrategicAdvice(stats) {
        const { winRate, passRatesByValue, avgFirstCardWon, avgFirstCardLost } = stats;
        
        let adviceHtml = "";
        
        if (winRate < 10) {
            adviceHtml += "❌ <strong>High Failure Rate:</strong> In this setup, human variance is too high compared to the timing multiplier. ";
        } else if (winRate > 60) {
            adviceHtml += "✅ <strong>Solid Synchronization:</strong> Players are doing a great job maintaining the internal clock. ";
        }
        
        // Find dangerous card values (lowest pass rate)
        let dangerousValues = Object.entries(passRatesByValue)
            .filter(([range, data]) => data.total > 0 && data.pass / data.total < 0.5)
            .map(([range]) => range);
            
        if (dangerousValues.length > 0) {
            adviceHtml += `<br>⚠️ <strong>Danger Zone:</strong> Cards in the ${dangerousValues[0]} range are failing frequently. Players need to be more careful and wait 10-20% longer when they hold these middle-range numbers.`;
        }
        
        if (avgFirstCardWon < avgFirstCardLost) {
            adviceHtml += `<br>💡 <strong>Advice:</strong> Winning games often start with a lower first card (Avg: ${avgFirstCardWon.toFixed(1)}) compared to losing games (Avg: ${avgFirstCardLost.toFixed(1)}). If you hold a card above 15, wait much longer than you think you should before playing the first card.`;
        } else {
            adviceHtml += `<br>💡 <strong>Advice:</strong> Your first play timing is consistent. To improve, ensure everyone is synchronized in the '1-10' range, as that's where most initial mistakes occur.`;
        }
        
        return adviceHtml;
    }
}
