let artistData = null;
let currentWeights = {};
let currentEligibleArtists = null;
let globalMaxYear = null; // to compute last 5 years

function showError(msg) {
    const rankList = document.getElementById('rankList');
    if (rankList) rankList.innerHTML = `<li class="error-msg">❌ ${msg}</li>`;
    console.error(msg);
}

function showParallelError(msg) {
    const errorDiv = document.getElementById('parallelError');
    if (errorDiv) errorDiv.innerHTML = msg;
}

function clearParallelError() {
    showParallelError('');
}

async function loadData() {
    try {
        const response = await fetch("../data/artist_career.json");
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        artistData = await response.json();
        console.log(`Loaded ${artistData.length} artists`);
        return true;
    } catch (err) {
        showError(`Failed to load data/artist_career.json: ${err.message}`);
        return false;
    }
}

function getOceanusInfo(artist) {
    const oceanusEntry = (artist.info || []).find(entry => entry.genre === "Oceanus Folk");
    if (!oceanusEntry) return null;
    return {
        total_works: oceanusEntry.total_works || 0,
        total_notable: oceanusEntry.total_notable_works || 0
    };
}

// NEW: compute total works in last 5 years (all genres)
function getTotalWorksLast5Years(artist) {
    if (!globalMaxYear) return 0;
    const startYear = globalMaxYear - 4;
    const yearEntries = (artist.info || []).filter(i => i.year !== undefined && i.year >= startYear);
    return yearEntries.reduce((sum, e) => sum + (e.total_works || 0), 0);
}

// NEW: compute Oceanus works in last 5 years
function getOceanusWorksLast5Years(artist) {
    if (!globalMaxYear) return 0;
    const startYear = globalMaxYear - 4;
    const yearlyOceanus = artist.oceanus_yearly || [];
    return yearlyOceanus.filter(y => y.year >= startYear).reduce((sum, y) => sum + y.count, 0);
}

// Get other metrics (roles, influenced, collaborators) – growth rates removed
function getOtherMetrics(artist) {
    const yearEntries = (artist.info || []).filter(i => i.year !== undefined).sort((a,b) => a.year - b.year);
    const performer = artist.role_counts?.PerformerOf || 0;
    const lyricist = artist.role_counts?.LyricistOf || 0;
    const totalInfluenced = yearEntries.reduce((sum, e) => sum + (e.total_influenced_artists || 0), 0);
    const totalCollaborators = yearEntries.reduce((sum, e) => sum + (e.total_collaborators || 0), 0);
    return { performer, lyricist, totalInfluenced, totalCollaborators };
}

function getFactors(artist) {
    const oceanus = getOceanusInfo(artist);
    if (!oceanus) return null;
    const other = getOtherMetrics(artist);
    const worksLast5 = getTotalWorksLast5Years(artist);
    const oceanusLast5 = getOceanusWorksLast5Years(artist);
    return {
        total_oceanus_works: oceanus.total_works,
        notable_oceanus_works: oceanus.total_notable,
        role_performer: other.performer,
        role_lyricist: other.lyricist,
        total_influenced_artists: other.totalInfluenced,
        total_collaborators: other.totalCollaborators,
        works_last_5_years: worksLast5,
        oceanus_last_5_years: oceanusLast5
    };
}

function isEligible(artist) {
    return getOceanusInfo(artist) !== null;
}

// Compute global maximum year from all artist data
function computeGlobalMaxYear() {
    let maxYear = 0;
    for (let artist of artistData) {
        const yearEntries = (artist.info || []).filter(i => i.year !== undefined);
        for (let entry of yearEntries) {
            if (entry.year > maxYear) maxYear = entry.year;
        }
    }
    return maxYear;
}

// Compute raw scores and percentage
function computeAllScoresWithPercentage(artists, weights) {
    const factorsList = artists.map(a => getFactors(a)).filter(f => f !== null);
    const maxVals = {};
    Object.keys(weights).forEach(dim => {
        maxVals[dim] = Math.max(...factorsList.map(f => f[dim]), 1);
    });
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const results = artists.map((artist, idx) => {
        const f = factorsList[idx];
        if (!f) return null;
        let rawScore = 0;
        for (let dim in weights) {
            if (maxVals[dim] > 0) {
                rawScore += (f[dim] / maxVals[dim]) * weights[dim];
            }
        }
        const percentage = totalWeight > 0 ? (rawScore / totalWeight) * 100 : 0;
        return { name: artist.artist_name, score: percentage, rawScore: rawScore };
    }).filter(r => r !== null).sort((a,b) => b.score - a.score);
    return results;
}

function getAllEligibleArtists() {
    return currentEligibleArtists;
}

function renderRanking(artists, weights) {
    const ranked = computeAllScoresWithPercentage(artists, weights);
    const rankList = document.getElementById('rankList');
    rankList.innerHTML = ranked.slice(0, 10).map((r, idx) => 
        `<li><strong>${r.name}</strong> – ${r.score.toFixed(2)}%</li>`
    ).join('');
    if (ranked.length === 0) rankList.innerHTML = '<li class="error-msg">No scores computed.</li>';
}

function computeSelectedScoresWithPercentage(selectedArtists, weights) {
    if (!selectedArtists.length) return [];
    const allFactors = currentEligibleArtists.map(a => getFactors(a)).filter(f => f !== null);
    const maxVals = {};
    Object.keys(weights).forEach(dim => {
        maxVals[dim] = Math.max(...allFactors.map(f => f[dim]), 1);
    });
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    return selectedArtists.map(artist => {
        const f = getFactors(artist);
        if (!f) return null;
        let rawScore = 0;
        for (let dim in weights) {
            if (maxVals[dim] > 0) {
                rawScore += (f[dim] / maxVals[dim]) * weights[dim];
            }
        }
        const percentage = totalWeight > 0 ? (rawScore / totalWeight) * 100 : 0;
        return { name: artist.artist_name, score: percentage };
    }).filter(r => r !== null);
}

function renderSelectedScores(selectedArtists, weights) {
    const scores = computeSelectedScoresWithPercentage(selectedArtists, weights);
    const scoreList = document.getElementById('scoreList');
    if (!scoreList) return;
    if (scores.length === 0) {
        scoreList.innerHTML = '<li>No scores computed for selected artists.</li>';
        return;
    }
    const colors = ['#FFD700', '#00BFFF', '#E65C4A'];
    scoreList.innerHTML = scores.map((s, idx) => 
        `<li><span style="display:inline-block; width:20px; height:20px; background:${colors[idx % colors.length]}; margin-right:10px; border-radius:50%;"></span> <strong>${s.name}</strong> – ${s.score.toFixed(2)}%</li>`
    ).join('');
}

function renderParallelForSelected(weights) {
    const artistNames = [
        document.getElementById('artist1').value.trim(),
        document.getElementById('artist2').value.trim(),
        document.getElementById('artist3').value.trim()
    ].filter(n => n !== '');
    
    if (artistNames.length === 0) {
        showParallelError('Please enter at least one artist name.');
        Plotly.newPlot('parallelPlot', [], {})
        document.getElementById('scoreList').innerHTML = '';
        return;
    }
    
    const foundArtists = [];
    const notFound = [];
    for (let name of artistNames) {
        const artist = currentEligibleArtists.find(a => a.artist_name.toLowerCase() === name.toLowerCase());
        if (artist) foundArtists.push(artist);
        else notFound.push(name);
    }
    
    if (foundArtists.length === 0) {
        showParallelError(`No valid artists found: ${notFound.join(', ')}`);
        Plotly.newPlot('parallelPlot', [], {})
        document.getElementById('scoreList').innerHTML = '';
        return;
    }
    
    if (notFound.length > 0) {
        showParallelError(`Warning: ${notFound.join(', ')} not found. Drawing only for ${foundArtists.map(a => a.artist_name).join(', ')}.`);
    } else {
        clearParallelError();
    }
    
    renderSelectedScores(foundArtists, weights);
    
    const factorsList = foundArtists.map(a => getFactors(a)).filter(f => f !== null);
    if (factorsList.length === 0) {
        showParallelError('Could not compute factors for selected artists.');
        return;
    }
    
    const dimNames = Object.keys(factorsList[0]);
    const globalRanges = {};
    dimNames.forEach(dim => {
        const values = factorsList.map(f => f[dim]);
        const minVal = Math.min(...values, 0);
        const maxVal = Math.max(...values, 1);
        let range = [minVal, maxVal];
        if (minVal === maxVal) range = [minVal - 0.5, minVal + 0.5];
        globalRanges[dim] = range;
    });
    
    // Single trace with colorscale
    const trace = {
        type: 'parcoords',
        line: {
            color: foundArtists.map((_, i) => i / (foundArtists.length - 1)),
            colorscale: [
                [0, '#FFD700'],
                [0.5, '#00BFFF'],
                [1, '#E65C4A']
            ],
            showscale: false
        },
        dimensions: dimNames.map(dim => {
            const values = factorsList.map(f => f[dim]);
            return {
                label: dim.replace(/_/g, ' ').toUpperCase(),
                values: values,
                tickformat: '.1f',
                range: globalRanges[dim]
            };
        }),
        customdata: foundArtists.map(a => a.artist_name),
        hovertemplate: '<b>%{customdata}</b><br>' + dimNames.map((d, idx) => `${d}: %{dimensions[${idx}].value}`).join('<br>') + '<extra></extra>'
    };
    
    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: 'white' },
        parcoords: {
            labelfont: { color: '#FFD700', size: 12 },
            tickfont: { color: 'white' },
            rangefont: { color: 'white' }
        }
    };
    
    Plotly.newPlot('parallelPlot', [trace], layout, { responsive: true }).catch(err => showParallelError("Plot error: " + err.message));
}

function createWeightControls(defaultWeights) {
    const panel = document.getElementById('weightPanel');
    panel.innerHTML = '';
    const factorNames = {
        total_oceanus_works: "Total Oceanus Folk Songs",
        works_last_5_years: "Works in Last 5 Years",
        notable_oceanus_works: "Notable Oceanus Folk Songs",
        role_performer: "Performer Role Count",
        role_lyricist: "Lyricist Role Count",
        total_influenced_artists: "Influenced Artists (all)",
        total_collaborators: "Collaborators Count",
        oceanus_last_5_years: "Oceanus Works in Last 5 Years"
    };
    for (let dim in defaultWeights) {
        const div = document.createElement('div');
        div.className = 'weight-item';
        const labelText = factorNames[dim] || dim.replace(/_/g, ' ');
        div.innerHTML = `<label>${labelText} weight</label><input type="number" id="weight_${dim}" value="${defaultWeights[dim]}" step="0.1" min="0" max="10">`;
        panel.appendChild(div);
        currentWeights[dim] = defaultWeights[dim];
    }
}

function getCurrentWeights() {
    const weights = {};
    for (let dim in currentWeights) {
        const input = document.getElementById(`weight_${dim}`);
        weights[dim] = input ? parseFloat(input.value) : currentWeights[dim];
    }
    return weights;
}

function updateAll() {
    if (!currentEligibleArtists) return;
    const weights = getCurrentWeights();
    renderRanking(currentEligibleArtists, weights);
    renderParallelForSelected(weights);
}

async function init() {
    const ok = await loadData();
    if (!ok || !artistData) return;
    globalMaxYear = computeGlobalMaxYear();
    console.log(`Global maximum year: ${globalMaxYear}`);
    currentEligibleArtists = artistData.filter(isEligible);
    console.log(`Artists with Oceanus Folk works: ${currentEligibleArtists.length}`);
    if (currentEligibleArtists.length === 0) {
        showError("No artists with Oceanus Folk works found.");
        return;
    }
    // Default weights (adjusted for the new factors)
   const defaultWeights = {
        total_oceanus_works: 5.0,
        notable_oceanus_works: 4,
        role_performer: 2.0,
        role_lyricist: 1.5,
        total_influenced_artists: 0.8,
        total_collaborators: 0.5,
        works_last_5_years: 1.5,
        oceanus_last_5_years: 2.0
    };
    createWeightControls(defaultWeights);
    currentWeights = defaultWeights;
    updateAll();
    document.getElementById('updateBtn').onclick = () => {
        updateAll();
    };
}

init();