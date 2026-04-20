const DOM = {
    numPlayers: document.getElementById('num-players'),
    cardsPerPlayer: document.getElementById('cards-per-player'),
    timeMultiplier: document.getElementById('time-multiplier'),
    variance: document.getElementById('variance'),
    numSims: document.getElementById('num-sims'),
    
    numPlayersVal: document.getElementById('num-players-val'),
    cardsPerPlayerVal: document.getElementById('cards-per-player-val'),
    timeMultiplierVal: document.getElementById('time-multiplier-val'),
    varianceVal: document.getElementById('variance-val'),
    
    btnVisualSim: document.getElementById('btn-visual-sim'),
    btnBatchSim: document.getElementById('btn-batch-sim'),
    
    statCardsLeft: document.getElementById('stat-cards-left'),
    statStatus: document.getElementById('stat-status'),
    
    gameStage: document.getElementById('game-stage'),
    batchResults: document.getElementById('batch-results'),
    analyticsPanel: document.getElementById('analytics-panel'),
    
    centerPile: document.getElementById('center-pile'),
    playersContainer: document.getElementById('players-container'),
    
    eventLog: document.getElementById('event-log'),
    
    rWinrate: document.getElementById('r-winrate'),
    rAdvice: document.getElementById('r-advice')
};

// Map to store chart instances for cleanup
const chartInstances = {};

// Bind inputs
function bindInput(inputEl, valEl, onChange) {
    if (!inputEl) return;
    inputEl.addEventListener('input', () => {
        if (valEl) valEl.textContent = inputEl.value;
        if(onChange) onChange();
    });
}

function updateCardsMax() {
    let maxCards = Math.floor(100 / parseInt(DOM.numPlayers.value));
    DOM.cardsPerPlayer.max = maxCards;
    if (parseInt(DOM.cardsPerPlayer.value) > maxCards) {
        DOM.cardsPerPlayer.value = maxCards;
        DOM.cardsPerPlayerVal.textContent = maxCards;
    }
}

bindInput(DOM.numPlayers, DOM.numPlayersVal, updateCardsMax);
bindInput(DOM.cardsPerPlayer, DOM.cardsPerPlayerVal);
bindInput(DOM.timeMultiplier, DOM.timeMultiplierVal);
bindInput(DOM.variance, DOM.varianceVal);

// Init max cards limit
updateCardsMax();

function logEvent(msg, type = '') {
    const p = document.createElement('p');
    p.textContent = msg;
    if (type) p.className = `log-${type}`;
    DOM.eventLog.appendChild(p);
    DOM.eventLog.scrollTop = DOM.eventLog.scrollHeight;
}

function clearLog() {
    DOM.eventLog.innerHTML = '';
}

function getConfig() {
    return {
        numPlayers: parseInt(DOM.numPlayers.value),
        cardsPerPlayer: parseInt(DOM.cardsPerPlayer.value),
        timeMultiplier: parseInt(DOM.timeMultiplier.value),
        variance: parseInt(DOM.variance.value),
        numSims: parseInt(DOM.numSims.value) || 1000
    };
}

let visualSimInterval = null;
let currentSimulation = null; // keeps track for holding frustration state

function renderPlayers(sim) {
    DOM.playersContainer.innerHTML = '';
    for (let p = 0; p < sim.numPlayers; p++) {
        const pBox = document.createElement('div');
        pBox.className = 'player-box';
        pBox.innerHTML = `
            <h4>Player ${p + 1}</h4>
            <div class="card-count" id="p${p}-cards">${sim.players[p] ? sim.players[p].length : 0}</div>
            <div style="font-size: 0.8rem; color: #64748b; margin-top:0.5rem">cards</div>
            <div class="frustration-bar" id="p${p}-frust" style="width: ${sim.frustration[p]}%"></div>
        `;
        DOM.playersContainer.appendChild(pBox);
    }
}

function updateVisuals(sim) {
    let totalCardsLeft = sim.players.reduce((sum, hand) => sum + hand.length, 0);
    DOM.statCardsLeft.textContent = totalCardsLeft;
    
    if (sim.centerPile === 0) {
        DOM.centerPile.innerHTML = '<div class="empty-pile">0</div>';
    } else {
        DOM.centerPile.innerHTML = sim.centerPile;
        DOM.centerPile.classList.remove('pulse');
        void DOM.centerPile.offsetWidth; // trigger reflow
        DOM.centerPile.classList.add('pulse');
    }

    if (sim.status === 'idle') DOM.statStatus.textContent = 'Idle';
    else if (sim.status === 'running') DOM.statStatus.textContent = 'Running';
    else if (sim.status === 'won') DOM.statStatus.textContent = 'Victory!';
    else if (sim.status === 'lost') DOM.statStatus.textContent = 'Defeat';

    // Update Player Cards and Frustration
    if (sim.players && sim.players.length) {
        for (let p = 0; p < sim.numPlayers; p++) {
            const el = document.getElementById(`p${p}-cards`);
            if (el) el.textContent = sim.players[p].length;
            
            const frustEl = document.getElementById(`p${p}-frust`);
            if (frustEl) frustEl.style.width = `${sim.frustration[p]}%`;
        }
    }
}

function shakePlayer(index) {
    const el = document.getElementById(`p${index}-cards`);
    if (el) {
        el.classList.add('error');
        setTimeout(() => el.classList.remove('error'), 400);
    }
}

function renderAnalyticsCharts(cardsPerPlayer, analyticsData) {
    const ctxPassFail = document.getElementById(`chart-passfail-${cardsPerPlayer}`).getContext('2d');
    const ctxFirstCard = document.getElementById(`chart-firstcard-${cardsPerPlayer}`).getContext('2d');
    const ctxTiming = document.getElementById(`chart-timing-${cardsPerPlayer}`).getContext('2d');

    // Destroy old charts if they exist
    [`passfail-${cardsPerPlayer}`, `firstcard-${cardsPerPlayer}`, `timing-${cardsPerPlayer}`].forEach(id => {
        if (chartInstances[id]) chartInstances[id].destroy();
    });

    // 1. Pass vs Fail Trend
    const passFailLabels = ['1-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'];
    const passData = passFailLabels.map(label => analyticsData.passRatesByValue[label].pass);
    const failData = passFailLabels.map(label => analyticsData.passRatesByValue[label].total - analyticsData.passRatesByValue[label].pass);

    chartInstances[`passfail-${cardsPerPlayer}`] = new Chart(ctxPassFail, {
        type: 'bar',
        data: {
            labels: passFailLabels,
            datasets: [
                { label: 'Successful Plays', data: passData, backgroundColor: '#34d399' },
                { label: 'Game Overs Triggered', data: failData, backgroundColor: '#f43f5e' }
            ]
        },
        options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true } } }
    });

    // 2. First card value in wins vs losses
    chartInstances[`firstcard-${cardsPerPlayer}`] = new Chart(ctxFirstCard, {
        type: 'bar',
        data: {
            labels: ['Winning Games', 'Losing Games'],
            datasets: [{
                label: 'Avg First Card Value',
                data: [analyticsData.avgFirstCardWon, analyticsData.avgFirstCardLost],
                backgroundColor: ['#34d399', '#f43f5e']
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } }
    });

    // 3. Timing Chart (Bonus data mapped)
    const timingLabels = ['1-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'];
    const timingData = timingLabels.map(label => {
        const d = analyticsData.passRatesByValue[label];
        return d.total > 0 ? d.timeSum / d.total : 0;
    });

    chartInstances[`timing-${cardsPerPlayer}`] = new Chart(ctxTiming, {
        type: 'line',
        data: {
            labels: timingLabels,
            datasets: [{
                label: 'Avg Wait Time (ms)',
                data: timingData,
                borderColor: '#6366f1',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(99, 102, 241, 0.1)'
            }]
        },
        options: { responsive: true }
    });

    // Update Advice for this specific tab
    document.getElementById(`advice-${cardsPerPlayer}`).innerHTML = TheMindSimulation.generateStrategicAdvice(analyticsData);
}

// Tab Switching logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tabNumber = btn.getAttribute('data-tab');
        document.querySelector(`.tab-pane[data-tab="${tabNumber}"]`).classList.add('active');
    });
});

DOM.btnVisualSim.addEventListener('click', () => {
    // Start Visual Simulation
    if (visualSimInterval) clearInterval(visualSimInterval);
    
    DOM.gameStage.classList.remove('hidden');
    DOM.batchResults.classList.add('hidden');
    DOM.analyticsPanel.classList.add('hidden');
    clearLog();
    logEvent("Starting Visual Simulation...");
    
    let config = getConfig();
    
    // Check if we should retain frustration from previous game (if num config matches)
    if (currentSimulation && currentSimulation.numPlayers === config.numPlayers) {
        config.frustration = currentSimulation.frustration;
    }
    
    currentSimulation = new TheMindSimulation(config);
    let sim = currentSimulation;
    
    sim.startRound();
    renderPlayers(sim);
    updateVisuals(sim);

    DOM.btnBatchSim.disabled = true;
    DOM.btnVisualSim.textContent = "Restart Visual";

    visualSimInterval = setInterval(() => {
        if (sim.status === 'lost' || sim.status === 'won') {
            clearInterval(visualSimInterval);
            DOM.btnBatchSim.disabled = false;
            updateVisuals(sim);
            if (sim.status === 'won') logEvent("🎯 Simulation COMPLETE! All cards played in order.", 'success');
            if (sim.status === 'lost') logEvent("💀 Simulation FAILED! Game reset immediately.", 'error');
            return;
        }

        let result = sim.playNextCard();

        if (result) {
            if (result.type === 'play' || result.type === 'play_and_won') {
                logEvent(`Player ${result.player + 1} played ${result.card}`);
            } else if (result.type === 'mistake') {
                logEvent(`Player ${result.player + 1} played ${result.card} EARLY!`, 'error');
                shakePlayer(result.player);
                result.discarded.forEach(d => {
                    logEvent(`- Player ${d.player + 1} also had: ${d.card}`, 'error');
                    shakePlayer(d.player);
                });
                logEvent(`Everyone else gets frustrated! Game over!`);
            }
            updateVisuals(sim);
        }
    }, 800); // 800ms between plays
});

DOM.btnBatchSim.addEventListener('click', () => {
    if (visualSimInterval) clearInterval(visualSimInterval);
    DOM.btnBatchSim.disabled = false;
    DOM.btnVisualSim.textContent = "Visual Simulation";
    clearLog();
    
    const config = getConfig();
    logEvent(`Running batch analysis: ${config.numSims} games per card count (1-5)...`);

    DOM.gameStage.classList.add('hidden');
    DOM.batchResults.classList.add('hidden');
    DOM.analyticsPanel.classList.remove('hidden');

    const ranges = ['1-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'];

    // Loop through 1 to 5 cards per hand
    for (let cCount = 1; cCount <= 5; cCount++) {
        let wins = 0;
        let firstCardWonValues = [];
        let firstCardLostValues = [];
        const passRatesByValue = {};
        ranges.forEach(r => passRatesByValue[r] = { pass: 0, total: 0, timeSum: 0 });

        for (let i = 0; i < config.numSims; i++) {
            const batchSim = new TheMindSimulation({ ...config, cardsPerPlayer: cCount });
            batchSim.startRound();
            
            while (batchSim.status === 'running') {
                batchSim.playNextCard();
            }

            if (batchSim.status === 'won') wins++;
            
            // Analyze the logs of this single game
            batchSim.logs.forEach(l => {
                const rangeIdx = Math.min(9, Math.floor((l.card - 1) / 10));
                const rangeKey = ranges[rangeIdx];
                
                passRatesByValue[rangeKey].total++;
                if (l.status === 'pass') passRatesByValue[rangeKey].pass++;
                passRatesByValue[rangeKey].timeSum += l.timeBetween;

                if (l.isFirstCard) {
                    if (batchSim.status === 'won') firstCardWonValues.push(l.card);
                    else firstCardLostValues.push(l.card);
                }
            });
        }

        const stats = {
            winRate: (wins / config.numSims) * 100,
            passRatesByValue,
            avgFirstCardWon: firstCardWonValues.length > 0 ? firstCardWonValues.reduce((a,b)=>a+b, 0) / firstCardWonValues.length : 0,
            avgFirstCardLost: firstCardLostValues.length > 0 ? firstCardLostValues.reduce((a,b)=>a+b, 0) / firstCardLostValues.length : 0
        };

        renderAnalyticsCharts(cCount, stats);
    }

    logEvent(`All simulations complete! View analytics below.`);
});
