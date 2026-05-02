// Global variable to store loaded JSON data
let artistData = null;

// Helper: extract year entries from artist info (filter invalid years)
function getYearData(artist) {
    return artist.info.filter(item => item.year !== undefined && item.year >= 1900 && item.year <= 2050);
}

// Helper: extract genre entries
function getGenreData(artist) {
    return artist.info.filter(item => item.genre !== undefined);
}

// Get global min and max year across all selected artists
function getGlobalYearRange(artists) {
    let minYear = Infinity;
    let maxYear = -Infinity;
    artists.forEach(artist => {
        getYearData(artist).forEach(entry => {
            if (entry.year < minYear) minYear = entry.year;
            if (entry.year > maxYear) maxYear = entry.year;
        });
    });
    if (minYear === Infinity) return { min: 2000, max: 2020 };
    return { min: minYear, max: maxYear };
}

// Generate continuous years from min to max
function getContinuousYears(artists) {
    const { min, max } = getGlobalYearRange(artists);
    const years = [];
    for (let y = min; y <= max; y++) years.push(y);
    return years;
}

// Build data for a line chart using continuous years (fills missing with 0)
function prepareYearlyDataContinuous(artists, key, continuousYears) {
    const lineWidths = [4, 4, 4];
    const xJitter = 0.08;
    
    const traces = [];
    artists.forEach((artist, idx) => {
        const yearMap = new Map();
        getYearData(artist).forEach(entry => yearMap.set(entry.year, entry[key]));
        
        const realValues = continuousYears.map(y => yearMap.get(y) || 0);
        const shiftedYears = continuousYears.map(y => y + idx * xJitter);
        
        traces.push({
            x: shiftedYears,
            y: realValues,
            name: artist.artist_name,
            type: 'scatter',
            mode: 'lines',
            line: { width: lineWidths[idx % lineWidths.length], dash: 'solid' },
            hoverinfo: 'text',
            text: continuousYears.map((y, i) => {
                return `${artist.artist_name}, ${y}: ${realValues[i]}`;
            })
        });
    });
    
    traces.sort((a, b) => b.line.width - a.line.width);
    return traces;
}

// Build grouped bar charts for genres (total works per genre, summed over years)
function prepareGenreData(artists, key) {
    const allGenres = new Set();
    artists.forEach(artist => {
        getGenreData(artist).forEach(entry => allGenres.add(entry.genre));
    });
    const genres = Array.from(allGenres).sort();
    const traces = [];
    artists.forEach((artist, idx) => {
        const genreMap = new Map();
        getGenreData(artist).forEach(entry => genreMap.set(entry.genre, entry[key]));
        const values = genres.map(g => genreMap.get(g) || 0);
        traces.push({
            x: genres,
            y: values,
            name: artist.artist_name,
            type: 'bar',
            text: values.map(v => v.toString()),
            textposition: 'auto'
        });
    });
    return { traces, genres };
}

// Prepare bar chart for role counts
function prepareRoleData(artists) {
    const allRoles = new Set();
    artists.forEach(artist => {
        if (artist.role_counts) {
            Object.keys(artist.role_counts).forEach(role => allRoles.add(role));
        }
    });
    const roles = Array.from(allRoles).sort();
    const traces = [];
    artists.forEach(artist => {
        const roleMap = artist.role_counts || {};
        const values = roles.map(r => roleMap[r] || 0);
        traces.push({
            x: roles,
            y: values,
            name: artist.artist_name,
            type: 'bar',
            text: values.map(v => v.toString()),
            textposition: 'auto'
        });
    });
    return { traces, roles };
}

// Helper: apply dark theme to Plotly layout
function getDarkLayout(baseLayout) {
    return {
        ...baseLayout,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: 'white', family: 'Segoe UI, sans-serif' },
        xaxis: {
            ...baseLayout.xaxis,
            gridcolor: '#333',
            linecolor: '#555',
            tickcolor: '#555',
            title: { font: { color: 'white' } }
        },
        yaxis: {
            ...baseLayout.yaxis,
            gridcolor: '#333',
            linecolor: '#555',
            tickcolor: '#555',
            title: { font: { color: 'white' } }
        },
        legend: {
            font: { color: 'white' },
            bgcolor: 'rgba(0,0,0,0.6)',
            bordercolor: '#FFD700',
            borderwidth: 0.5
        }
    };
}

// Render all charts
function renderCharts(artists) {
    const container = document.getElementById("chartsContainer");
    if (!container) {
        console.error("Element #chartsContainer not found!");
        return;
    }
    container.innerHTML = "";

    const continuousYears = getContinuousYears(artists);
    if (continuousYears.length === 0) {
        console.warn("No continuous years found – check artist data");
        container.innerHTML = "<p>No year data available for these artists.</p>";
        return;
    }

    const pxPerYear = 40;
    const chartWidth = continuousYears.length * pxPerYear;
    const minChartWidth = 400;

    const xAxisLayout = {
        title: "Year",
        tickmode: 'linear',
        tick0: continuousYears[0],
        dtick: 1,
        tickangle: -45
    };

    function addChart(title, plotData, layout) {
        const card = document.createElement("div");
        card.className = "chart-card";
        const chartDivId = title.replace(/\s/g, '');
        card.innerHTML = `<h3>${title}</h3><div id="${chartDivId}" style="width:${Math.max(minChartWidth, chartWidth)}px; height:350px;"></div>`;
        container.appendChild(card);
        card.style.overflowX = 'auto';
        const finalLayout = getDarkLayout(layout);
        Plotly.newPlot(chartDivId, plotData, finalLayout, { responsive: true, displayModeBar: false });
    }

    // Line charts
    const worksTraces = prepareYearlyDataContinuous(artists, "total_works", continuousYears);
    addChart("Total Works per Year", worksTraces, { xaxis: xAxisLayout, yaxis: { title: "Works", rangemode: 'tozero' }, showlegend: true });

    // Bar charts (total works by genre)
    let { traces: worksGenreTraces } = prepareGenreData(artists, "total_works");
    addChart("Total Works by Genre", worksGenreTraces, { xaxis: { title: "Genre", tickangle: -45 }, yaxis: { title: "Works", rangemode: 'tozero' }, barmode: "group" });

    const notableTraces = prepareYearlyDataContinuous(artists, "total_notable_works", continuousYears);
    addChart("Notable Works per Year", notableTraces, { xaxis: xAxisLayout, yaxis: { title: "Notable Works", rangemode: 'tozero' } });

    
    let { traces: notableGenreTraces } = prepareGenreData(artists, "total_notable_works");
    addChart("Notable Works by Genre", notableGenreTraces, { xaxis: { title: "Genre", tickangle: -45 }, yaxis: { title: "Notable Works", rangemode: 'tozero' }, barmode: "group" });

    const collabTraces = prepareYearlyDataContinuous(artists, "total_collaborators", continuousYears);
    addChart("Collaborators per Year", collabTraces, { xaxis: xAxisLayout, yaxis: { title: "Collaborators", rangemode: 'tozero' } });


    let { traces: collabGenreTraces } = prepareGenreData(artists, "total_collaborators");
    addChart("Collaborators by Genre", collabGenreTraces, { xaxis: { title: "Genre", tickangle: -45 }, yaxis: { title: "Collaborators", rangemode: 'tozero' }, barmode: "group" });

    let { traces: inflGenreTraces } = prepareGenreData(artists, "total_influenced_artists");
    addChart("Influenced Artists by Genre", inflGenreTraces, { xaxis: { title: "Genre", tickangle: -45 }, yaxis: { title: "Influenced Artists", rangemode: 'tozero' }, barmode: "group" });

    // Role counts bar chart
    const { traces: roleTraces, roles } = prepareRoleData(artists);
    if (roles.length > 0 && roleTraces.length > 0) {
        addChart("Role Counts (Performer, Composer, etc.)", roleTraces, {
            xaxis: { title: "Role", tickangle: -45 },
            yaxis: { title: "Number of times used", rangemode: 'tozero' },
            barmode: "group"
        });
    }
}

// Load JSON data
async function loadData() {
    try {
        const response = await fetch("../data/artist_career.json");
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        artistData = await response.json();
        console.log(`Loaded ${artistData.length} artists. Sample:`, artistData[0]);
        return true;
    } catch (err) {
        console.error("Failed to load artist data:", err);
        const errorDiv = document.getElementById("errorMsg");
        if (errorDiv) errorDiv.innerText = "Error loading artist data: " + err.message;
        return false;
    }
}

// Search artists by name (case‑insensitive partial match)
function findArtists(names) {
    if (!artistData) return [];
    return names.map(name => {
        if (!name) return null;
        const found = artistData.find(a => a.artist_name.toLowerCase().includes(name.toLowerCase()));
        if (!found) console.warn(`Artist "${name}" not found.`);
        return found || null;
    }).filter(a => a !== null);
}

// Main compare function
async function compareArtists(namesArray) {
    const loadingDiv = document.getElementById("loadingMsg");
    const errorDiv = document.getElementById("errorMsg");
    if (loadingDiv) loadingDiv.style.display = "block";
    if (errorDiv) errorDiv.innerText = "";

    if (!artistData) {
        const ok = await loadData();
        if (!ok) {
            if (loadingDiv) loadingDiv.style.display = "none";
            return;
        }
    }

    const artists = findArtists(namesArray);
    if (artists.length === 0) {
        if (errorDiv) errorDiv.innerText = "No matching artists found. Please check names.";
        if (loadingDiv) loadingDiv.style.display = "none";
        return;
    }

    renderCharts(artists);
    if (loadingDiv) loadingDiv.style.display = "none";
}

// Event listener for the Compare button
const compareBtn = document.getElementById("compareBtn");
if (compareBtn) {
    compareBtn.addEventListener("click", () => {
        const name1 = document.getElementById("artist1")?.value.trim() || "";
        const name2 = document.getElementById("artist2")?.value.trim() || "";
        const name3 = document.getElementById("artist3")?.value.trim() || "";
        compareArtists([name1, name2, name3]);
    });
}

// Preload data and set default artists on page load
window.addEventListener("load", () => {
    loadData().then(() => {
        // Set default names
        const defaultNames = ["Sailor Shift", "Beatrice Albright", "Genevieve Bell"];
        const input1 = document.getElementById("artist1");
        const input2 = document.getElementById("artist2");
        const input3 = document.getElementById("artist3");
        if (input1) input1.value = defaultNames[0];
        if (input2) input2.value = defaultNames[1];
        if (input3) input3.value = defaultNames[2];
        
        // Automatically compare the default names
        compareArtists(defaultNames);
    });
});