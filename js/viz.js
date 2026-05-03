/**
 * Sailor's Musical Network Visualization
 * ======================================
 * - Circular network with zoom/pan
 * - Right‑hand cumulative line chart (all collaborators)
 * - On hover over a blue circle: individual non‑cumulative line chart
 * - Year slider controls both network and chart
 */

// Constants
const constantBranchThickness = 0.9;
const SEED = 67;
const rng = mulberry32(SEED);

function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Load all three data files
Promise.all([
    d3.json("data/data_task1-1.json"),
    d3.json("data/data_task1-2.json"),
    d3.json("data/data_task1-3.json")
]).then(([leftData, rightData, slopeData]) => {
    console.log("Data loaded successfully");

    // ------------------------------------------------------------
    // 1. Process left side (influencers)
    // ------------------------------------------------------------
    leftData.links.forEach(link => { link.year = +link.year; link.score = +link.score; });
    const leftInfluencerFirstYear = new Map();
    leftData.links.forEach(link => {
        const name = link.source, year = link.year;
        if (!leftInfluencerFirstYear.has(name) || year < leftInfluencerFirstYear.get(name))
            leftInfluencerFirstYear.set(name, year);
    });

    const leftAllYears = [...new Set(leftData.links.map(l => l.year))].sort((a,b)=>a-b);
    const leftYearMin = d3.min(leftAllYears), leftYearMax = d3.max(leftAllYears);
    const leftInfluencers = Array.from(leftInfluencerFirstYear.keys()).sort();

    const leftLinksMap = new Map();
    leftData.links.forEach(link => {
        const name = link.source;
        if (!leftLinksMap.has(name)) leftLinksMap.set(name, []);
        leftLinksMap.get(name).push({ year: link.year, score: link.score });
    });
    for (let arr of leftLinksMap.values()) arr.sort((a,b)=>a.year-b.year);

    function getLeftCumulativeScore(name, year) {
        const arr = leftLinksMap.get(name) || [];
        let total = 0;
        for (let item of arr) if (item.year <= year) total += item.score; else break;
        return total;
    }

    let leftMaxCumulative = 0;
    leftInfluencers.forEach(inf => {
        const t = getLeftCumulativeScore(inf, leftYearMax);
        if (t > leftMaxCumulative) leftMaxCumulative = t;
    });

    // ------------------------------------------------------------
    // 2. Process right side (collaborators & influenced)
    // ------------------------------------------------------------
    rightData.links.forEach(link => {
        link.year = +link.year;
        link.score = link.score !== undefined ? +link.score : 1;
    });
    const rightNodes = rightData.nodes;
    const rightLinks = rightData.links;

    rightNodes.forEach(node => {
        if (!node.hasOwnProperty("firstYear")) {
            const years = rightLinks.filter(l => l.target === node.id).map(l => l.year);
            node.firstYear = years.length ? d3.min(years) : leftYearMin;
        }
        if (!node.hasOwnProperty("name")) node.name = node.id;
        if (!node.hasOwnProperty("type")) {
            console.warn(`Node ${node.id} missing type; assuming "collaborator".`);
            node.type = "collaborator";
        }
    });

    const rightCollaborators = rightNodes.filter(n => n.type === "collaborator");
    const rightInfluenced = rightNodes.filter(n => n.type === "influenced");

    const rightLinksMap = new Map();
    rightLinks.forEach(link => {
        const targetId = link.target;
        if (!rightLinksMap.has(targetId)) rightLinksMap.set(targetId, []);
        rightLinksMap.get(targetId).push({ year: link.year, score: link.score, work: link.work });
    });
    for (let arr of rightLinksMap.values()) arr.sort((a,b)=>a.year-b.year);

    function getRightCumulativeUniqueWorks(nodeId, year) {
        const arr = rightLinksMap.get(nodeId) || [];
        const works = new Set();
        for (let item of arr) if (item.year <= year) works.add(item.work);
        return works.size;
    }

    function getRightCumulativeScore(nodeId, year) {
        const arr = rightLinksMap.get(nodeId) || [];
        let total = 0;
        for (let item of arr) if (item.year <= year) total += item.score; else break;
        return total;
    }

    const allYearsSet = new Set([...leftAllYears, ...rightLinks.map(l => l.year)]);
    const globalYearMin = d3.min(Array.from(allYearsSet)), globalYearMax = d3.max(Array.from(allYearsSet));

    // Max values for scaling
    let collaboratorMaxUnique = 0;
    let influencedMaxCumulative = 0;
    rightCollaborators.forEach(node => {
        collaboratorMaxUnique = Math.max(collaboratorMaxUnique, getRightCumulativeUniqueWorks(node.id, globalYearMax));
    });
    rightInfluenced.forEach(node => {
        influencedMaxCumulative = Math.max(influencedMaxCumulative, getRightCumulativeScore(node.id, globalYearMax));
    });

    // Global circle scaling (power scale)
    const globalMaxValue = Math.max(leftMaxCumulative, influencedMaxCumulative, collaboratorMaxUnique);
    console.log("Global max value for circle scaling:", globalMaxValue);
    const minRadius = 2, maxRadius = 18, exponent = 0.5;
    const globalRadiusScale = (value) => {
        if (value <= 0) return minRadius;
        const t = Math.pow(value / globalMaxValue, exponent);
        return minRadius + (maxRadius - minRadius) * t;
    };

    // ------------------------------------------------------------
    // 3. Angular sectors for node placement
    // ------------------------------------------------------------
    const influencerWeight = leftInfluencers.length;
    const collaboratorWeight = rightCollaborators.length;
    const influencedWeight = rightInfluenced.length * 2;
    const totalWeight = influencerWeight + collaboratorWeight + influencedWeight;
    const influencerAngle = (influencerWeight / totalWeight) * 2 * Math.PI;
    const collaboratorAngle = (collaboratorWeight / totalWeight) * 2 * Math.PI;
    const influencedAngle = (influencedWeight / totalWeight) * 2 * Math.PI;

    const startAngle = -Math.PI / 2;
    let current = startAngle;
    const influencerStart = current;
    current += influencerAngle;
    const influencerEnd = current;
    const collaboratorStart = current;
    current += collaboratorAngle;
    const collaboratorEnd = current;
    const influencedStart = current;
    current += influencedAngle;
    const influencedEnd = current;

    const marginRad = 0.14;
    const influencerStartAdj = influencerStart + marginRad;
    const influencerEndAdj = influencerEnd - marginRad;
    const collaboratorStartAdj = collaboratorStart + marginRad;
    const collaboratorEndAdj = collaboratorEnd - marginRad;
    const influencedStartAdj = influencedStart + marginRad;
    const influencedEndAdj = influencedEnd - marginRad;

    // Colors – inactive (dark) and active (light)
    const influencerColor = "#8E44AD";
    const collaboratorColor = "#006C8F";
    const influencedColor = "#E65C4A";
    const activeInfluencerColor = "#C39BD3";
    const activeCollaboratorColor = "#A0F0FF";
    const activeInfluencedColor = "#FF9A76";

    // ------------------------------------------------------------
    // 4. Node placement (non‑overlapping circles)
    // ------------------------------------------------------------
    const width = 1000, height = 1000;
    const centerX = width/2 + 15, centerY = height/2 - 170;
    const sailorRadius = 40;
    const bigCircleRadius = 320;
    const maxAttempts = 2000;

    function generateNonOverlappingPoints(N, radii, startAngle, endAngle, margin) {
        const points = [];
        const angleRange = endAngle - startAngle;
        const indices = Array.from(Array(N).keys());
        indices.sort((a,b) => radii[b] - radii[a]);
        
        for (let idx of indices) {
            const r = radii[idx];
            const minDistFromSailor = sailorRadius + r + margin;
            const maxDistFromCenter = bigCircleRadius - r - margin;
            let placed = false;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const u = rng();
                const v = rng();
                const angle = startAngle + u * angleRange;
                const rad = Math.sqrt(v) * bigCircleRadius;
                let x = centerX + rad * Math.cos(angle);
                let y = centerY + rad * Math.sin(angle);
                let dist = Math.hypot(x - centerX, y - centerY);
                if (dist < minDistFromSailor) {
                    const angle2 = Math.atan2(y - centerY, x - centerX);
                    x = centerX + minDistFromSailor * Math.cos(angle2);
                    y = centerY + minDistFromSailor * Math.sin(angle2);
                    dist = minDistFromSailor;
                }
                if (dist > maxDistFromCenter) {
                    const angle2 = Math.atan2(y - centerY, x - centerX);
                    x = centerX + maxDistFromCenter * Math.cos(angle2);
                    y = centerY + maxDistFromCenter * Math.sin(angle2);
                    dist = maxDistFromCenter;
                }
                let collides = false;
                for (let p of points) {
                    const otherRadius = radii[p.idx];
                    const dx = x - p.x, dy = y - p.y;
                    if (Math.hypot(dx, dy) < r + otherRadius + margin) {
                        collides = true;
                        break;
                    }
                }
                if (!collides) {
                    points.push({ x, y, idx });
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                const angle = startAngle + rng() * angleRange;
                const rad = Math.min(maxDistFromCenter, Math.max(minDistFromSailor, Math.sqrt(rng()) * bigCircleRadius));
                const x = centerX + rad * Math.cos(angle);
                const y = centerY + rad * Math.sin(angle);
                points.push({ x, y, idx });
            }
        }
        const orderedPoints = new Array(N);
        for (let p of points) orderedPoints[p.idx] = { x: p.x, y: p.y };
        return orderedPoints;
    }

    const leftRadii = leftInfluencers.map(n => globalRadiusScale(getLeftCumulativeScore(n, globalYearMax)) + 1);
    const collabRadii = rightCollaborators.map(n => globalRadiusScale(getRightCumulativeUniqueWorks(n.id, globalYearMax)) + 1);
    const inflRadii = rightInfluenced.map(n => globalRadiusScale(getRightCumulativeScore(n.id, globalYearMax)) + 1);

    const leftPoints = generateNonOverlappingPoints(leftInfluencers.length, leftRadii, influencerStartAdj, influencerEndAdj, 17);
    const collabPoints = generateNonOverlappingPoints(rightCollaborators.length, collabRadii, collaboratorStartAdj, collaboratorEndAdj, 17);
    const inflPoints = generateNonOverlappingPoints(rightInfluenced.length, inflRadii, influencedStartAdj, influencedEndAdj, 17);

    // Build node list (static positions)
    const nodes = [{ id: "sailor", type: "sailor", x: centerX, y: centerY, firstYear: globalYearMin, radius: sailorRadius }];
    leftInfluencers.forEach((name, i) => {
        nodes.push({ id: name, type: "influencer", x: leftPoints[i].x, y: leftPoints[i].y, firstYear: leftInfluencerFirstYear.get(name), radius: 5 });
    });
    rightCollaborators.forEach((node, i) => {
        nodes.push({ id: node.id, type: "collaborator", x: collabPoints[i].x, y: collabPoints[i].y, firstYear: node.firstYear, name: node.name, radius: 5 });
    });
    rightInfluenced.forEach((node, i) => {
        nodes.push({ id: node.id, type: "influenced", x: inflPoints[i].x, y: inflPoints[i].y, firstYear: node.firstYear, name: node.name, radius: 5 });
    });

    // ------------------------------------------------------------
    // 5. SVG and zoom setup
    // ------------------------------------------------------------
    const svg = d3.select("#network-container").append("svg").attr("width", width).attr("height", height)
        .call(d3.zoom().on("zoom", (event) => { g.attr("transform", event.transform); }))
        .append("g").attr("id", "viz-group");

    function drawArc(start, end, color, radius) {
        const s = { x: centerX + radius * Math.cos(start), y: centerY + radius * Math.sin(start) };
        const e = { x: centerX + radius * Math.cos(end), y: centerY + radius * Math.sin(end) };
        const largeArc = (end - start) > Math.PI ? 1 : 0;
        const path = `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
        svg.append("path").attr("d", path).attr("fill", "none").attr("stroke", color).attr("stroke-width", 3);
    }
    drawArc(influencerStart, influencerEnd, influencerColor, bigCircleRadius);
    drawArc(collaboratorStart, collaboratorEnd, collaboratorColor, bigCircleRadius);
    drawArc(influencedStart, influencedEnd, influencedColor, bigCircleRadius);

    function drawSeparator(angle, colorLeft, colorRight) {
        const r = bigCircleRadius;
        const delta = 0.006;
        const x1 = centerX + r * Math.cos(angle - delta);
        const y1 = centerY + r * Math.sin(angle - delta);
        const x2 = centerX + r * Math.cos(angle + delta);
        const y2 = centerY + r * Math.sin(angle + delta);
        svg.append("line").attr("x1", centerX).attr("y1", centerY).attr("x2", x1).attr("y2", y1).attr("stroke", colorLeft).attr("stroke-width", 2.5);
        svg.append("line").attr("x1", centerX).attr("y1", centerY).attr("x2", x2).attr("y2", y2).attr("stroke", colorRight).attr("stroke-width", 4.5);
    }
    drawSeparator(influencerStart, influencedColor, influencerColor);
    drawSeparator(influencerEnd, influencerColor, collaboratorColor);
    drawSeparator(collaboratorEnd, collaboratorColor, influencedColor);

    const defs = svg.append("defs");
    ["Purple", "Cyan", "Coral"].forEach((col, i) => {
        const color = i === 0 ? activeInfluencerColor : (i === 1 ? activeCollaboratorColor : activeInfluencedColor);
        defs.append("marker").attr("id", `arrow${col}`).attr("viewBox", "0 -3 6 6").attr("refX", 6).attr("refY", 0)
            .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
            .append("polygon").attr("points", "0,-3 6,0 0,3").attr("fill", color).attr("stroke", "none");
    });

    const nodeGroup = svg.append("g").attr("class", "nodes");
    const linkGroup = svg.append("g").attr("class", "links");

    svg.append("style").text(`
        .node circle { transition: stroke 0.2s ease, stroke-width 0.2s ease; }
        .node circle:hover { stroke: white !important; stroke-width: 3px !important; filter: none !important; }
        .node text { fill: white; font-weight: bold; pointer-events: none; }
        #network-container svg { background: transparent; }
    `);

    function pointOnCircle(cx, cy, r, tx, ty) {
        const dx = tx - cx, dy = ty - cy;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) return { x: cx + r, y: cy };
        const ratio = r / len;
        return { x: cx + dx * ratio, y: cy + dy * ratio };
    }

    function drawInitial() {
        const groups = nodeGroup.selectAll(".node").data(nodes, d => d.id).join("g")
            .attr("class","node").attr("transform", d => `translate(${d.x},${d.y})`)
            .style("opacity", d => d.type === "sailor" ? 1 : 0)
            .style("visibility", d => d.type === "sailor" ? "visible" : "hidden");
        groups.each(function(d) {
            const g = d3.select(this);
            if (d.type === "sailor") {
                g.append("circle").attr("r", sailorRadius).style("fill", "#FFD700").style("stroke", "white").style("stroke-width", 2);
                g.append("text").attr("dy", "-0.3em").attr("text-anchor", "middle").style("font-size", "24px").style("fill", "#4A2C00").style("font-weight", "bold").text("Sailor");
                g.append("text").attr("class", "sailor-year").attr("dy", "0.8em").attr("text-anchor", "middle").style("font-size", "22px").style("fill", "#4A2C00").style("font-weight", "bold").text(globalYearMin);
            } else {
                let fillColor = d.type === "influencer" ? influencerColor : (d.type === "collaborator" ? collaboratorColor : influencedColor);
                g.append("circle").attr("r", 4).style("fill", fillColor).style("stroke", "white").style("stroke-width", 1.5);
                g.append("text").attr("dy", "0.35em").attr("text-anchor", "middle").style("font-size", "0px").style("fill", "white").style("font-weight", "bold").text(d.name || d.id);
            }
        });
    }
    drawInitial();

    // ------------------------------------------------------------
    // 6. Update network according to selected year
    // ------------------------------------------------------------
    function updateNetwork(year) {
        nodeGroup.selectAll(".node").transition().duration(400)
            .style("opacity", d => d.type === "sailor" ? 1 : (d.firstYear <= year ? 1 : 0))
            .style("visibility", d => d.type === "sailor" ? "visible" : (d.firstYear <= year ? "visible" : "hidden"));
        
        const activeInfluencer = new Set(leftData.links.filter(l => l.year === year).map(l => l.source));
        const activeCollaborator = new Set();
        const activeInfluenced = new Set();
        rightLinks.forEach(l => {
            if (l.year === year) {
                const targetNode = nodes.find(n => n.id === l.target);
                if (targetNode.type === "collaborator") activeCollaborator.add(l.target);
                else if (targetNode.type === "influenced") activeInfluenced.add(l.target);
            }
        });

        const topInfluencer = new Set(leftInfluencers.map(inf => ({ id: inf, score: getLeftCumulativeScore(inf, year) })).sort((a,b)=>b.score-a.score).slice(0,5).map(d=>d.id));
        const topCollaborator = new Set(rightCollaborators.map(node => ({ id: node.id, count: getRightCumulativeUniqueWorks(node.id, year) })).sort((a,b)=>b.count-a.count).slice(0,5).map(d=>d.id));
        const topInfluenced = new Set(rightInfluenced.map(node => ({ id: node.id, score: getRightCumulativeScore(node.id, year) })).sort((a,b)=>b.score-a.score).slice(0,5).map(d=>d.id));

        nodes.forEach(node => {
            if (node.type === "sailor") return;
            let value, fillColor, isTop = false, targetRadius = 4;
            if (node.type === "influencer") {
                value = getLeftCumulativeScore(node.id, year);
                targetRadius = value > 0 ? globalRadiusScale(value) : minRadius;
                fillColor = activeInfluencer.has(node.id) ? activeInfluencerColor : influencerColor;
                isTop = topInfluencer.has(node.id);
            } else if (node.type === "collaborator") {
                value = getRightCumulativeUniqueWorks(node.id, year);
                targetRadius = value > 0 ? globalRadiusScale(value) : minRadius;
                fillColor = activeCollaborator.has(node.id) ? activeCollaboratorColor : collaboratorColor;
                isTop = topCollaborator.has(node.id);
            } else {
                value = getRightCumulativeScore(node.id, year);
                targetRadius = value > 0 ? globalRadiusScale(value) : minRadius;
                fillColor = activeInfluenced.has(node.id) ? activeInfluencedColor : influencedColor;
                isTop = topInfluenced.has(node.id);
            }
            
            if (isTop) {
                targetRadius += 2.5;   // make top artists stand out
            }
            const circle = nodeGroup.selectAll(".node").filter(d => d.id === node.id).select("circle");
            if (circle.size()) {
                circle.transition().duration(400).attr("r", targetRadius).style("fill", fillColor)
                    .style("stroke", "white").style("stroke-width", isTop ? "4px" : "0px");
            }
        });

        // Update labels for top artists (visible when isTop)
        nodes.forEach(node => {
            if (node.type === "sailor") return;
            let isTop = false, targetRadius = 4;
            if (node.type === "influencer") {
                const v = getLeftCumulativeScore(node.id, year);
                targetRadius = v > 0 ? globalRadiusScale(v) : minRadius;
                isTop = topInfluencer.has(node.id);
            } else if (node.type === "collaborator") {
                const v = getRightCumulativeUniqueWorks(node.id, year);
                targetRadius = v > 0 ? globalRadiusScale(v) : minRadius;
                isTop = topCollaborator.has(node.id);
            } else {
                const v = getRightCumulativeScore(node.id, year);
                targetRadius = v > 0 ? globalRadiusScale(v) : minRadius;
                isTop = topInfluenced.has(node.id);
            }
            const text = nodeGroup.selectAll(".node").filter(d => d.id === node.id).select("text");
            if (text.size()) {
                const side = node.type === "influenced" ? 1 : (node.x < centerX ? -1 : 1);
                const offset = targetRadius + 6;
                text.transition().duration(400)
                    .attr("dx", side * offset).attr("text-anchor", side === -1 ? "end" : "start")
                    .style("font-size", isTop ? "18px" : "0px").style("opacity", isTop ? 1 : 0)
                    .style("visibility", isTop ? "visible" : "hidden")
                    .text(node.name || node.id);
            }
        });

        nodeGroup.selectAll(".node").filter(d => d.type === "sailor").select(".sailor-year").text(year);
        linkGroup.selectAll("*").remove();
        const sailorNode = nodes.find(n => n.id === "sailor");

        leftData.links.forEach(link => {
            if (link.year !== year) return;
            const sourceNode = nodes.find(n => n.id === link.source && n.type === "influencer");
            if (!sourceNode || sourceNode.firstYear > year) return;
            const val = getLeftCumulativeScore(link.source, year);
            const start = pointOnCircle(sourceNode.x, sourceNode.y, globalRadiusScale(val), sailorNode.x, sailorNode.y);
            const end = pointOnCircle(sailorNode.x, sailorNode.y, sailorRadius, sourceNode.x, sourceNode.y);
            linkGroup.append("line").attr("class", "link").attr("stroke-width", constantBranchThickness)
                .attr("stroke", activeInfluencerColor).attr("x1", start.x).attr("y1", start.y)
                .attr("x2", end.x).attr("y2", end.y).attr("marker-end", "url(#arrowPurple)");
        });

        rightLinks.forEach(link => {
            if (link.year !== year) return;
            const targetNode = nodes.find(n => n.id === link.target);
            if (!targetNode || targetNode.firstYear > year) return;
            if (targetNode.type === "collaborator" || targetNode.type === "influenced") {
                let val = targetNode.type === "collaborator" ? getRightCumulativeUniqueWorks(link.target, year) : getRightCumulativeScore(link.target, year);
                const targetRadius = val > 0 ? globalRadiusScale(val) : minRadius;
                const start = pointOnCircle(sailorNode.x, sailorNode.y, sailorRadius, targetNode.x, targetNode.y);
                const end = pointOnCircle(targetNode.x, targetNode.y, targetRadius, sailorNode.x, sailorNode.y);
                const edgeColor = targetNode.type === "collaborator" ? activeCollaboratorColor : activeInfluencedColor;
                const arrowId = targetNode.type === "collaborator" ? "url(#arrowCyan)" : "url(#arrowCoral)";
                linkGroup.append("line").attr("class", "link").attr("stroke-width", constantBranchThickness)
                    .attr("stroke", edgeColor).attr("x1", start.x).attr("y1", start.y)
                    .attr("x2", end.x).attr("y2", end.y).attr("marker-end", arrowId);
            }
        });
    }

    // ------------------------------------------------------------
    // 7. Year slider initialization
    // ------------------------------------------------------------
    const slider = document.getElementById("yearSlider");
    const yearLabel = document.getElementById("yearLabel");
    if (slider) {
        slider.min = globalYearMin;
        slider.max = globalYearMax;
        slider.value = globalYearMax;
        yearLabel.innerText = globalYearMin;
        slider.addEventListener("input", () => {
            const y = parseInt(slider.value);
            yearLabel.innerText = y;
            updateNetwork(y);
            if (hoveredArtistId) {
                renderIndividualLineChart(hoveredArtistId, y);
            } else {
                renderAllCumulativeLineChart(y);
            }
        });
        updateNetwork(globalYearMax);
    } else {
        console.error("Year slider element not found!");
    }

    // ------------------------------------------------------------
    // 8. Line charts (right side)
    // ------------------------------------------------------------
    let collaboratorData = null;
    let hoveredArtistId = null;

    d3.json("data/collaborator_yearly.json").then(data => {
        collaboratorData = data.artists;
        renderAllCumulativeLineChart(parseInt(slider.value));
    }).catch(err => console.error("Error loading collaborator_yearly.json:", err));

    function getAllYearlyCounts() {
        const yearMap = new Map();
        collaboratorData.forEach(artist => {
            artist.data.forEach(d => yearMap.set(d.year, (yearMap.get(d.year) || 0) + d.count));
        });
        const years = Array.from(yearMap.keys()).sort((a,b)=>a-b);
        const counts = years.map(y => yearMap.get(y));
        return { years, counts };
    }

    // Default cumulative line chart (all collaborators)
    function renderAllCumulativeLineChart(selectedYear) {
        if (!collaboratorData) return;
        const { years, counts } = getAllYearlyCounts();
        const idx = years.findIndex(y => y > selectedYear);
        const filteredYears = idx === -1 ? years : years.slice(0, idx);
        const filteredCounts = filteredYears.map(y => counts[years.indexOf(y)]);
        let cum = 0;
        const cumulative = filteredCounts.map(c => { cum += c; return cum; });
        if (filteredYears.length === 0) {
            d3.select("#slope-chart").html(`<p style='color:gray'>No data for years ≤ ${selectedYear}</p>`);
            return;
        }
        const chartWidth = 540, chartHeight = 700;
        const margin = { top: 90, right: 40, bottom: 80, left: 35 };
        const innerW = chartWidth - margin.left - margin.right;
        const innerH = chartHeight - margin.top - margin.bottom;
        const svgChart = d3.select("#slope-chart").html("").append("svg").attr("width", chartWidth).attr("height", chartHeight)
            .style("background", "black").append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const xScale = d3.scaleLinear().domain(d3.extent(filteredYears)).range([0, innerW]).nice();
        const yScale = d3.scaleLinear().domain([0, d3.max(cumulative) || 1]).range([innerH, 0]).nice();
        const tickStep = 5;
        const tickVals = [];
        for (let y = filteredYears[0]; y <= filteredYears[filteredYears.length-1]; y += tickStep) tickVals.push(y);
        svgChart.append("g").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(xScale).tickValues(tickVals).tickFormat(d3.format("d"))).style("color", "white");
        svgChart.append("g").call(d3.axisLeft(yScale)).style("color", "white");
        svgChart.selectAll(".tick text").style("font-weight", "bold").style("font-size", "14px");
        svgChart.selectAll(".domain").attr("stroke-width", 3.5);
        svgChart.selectAll(".tick line").attr("stroke-width", 3.5);
        svgChart.append("text").attr("x", innerW/2).attr("y", innerH + 40).attr("text-anchor", "middle").style("fill", "white").text("Year");
        svgChart.append("text").attr("x", -85).attr("y", 15).attr("text-anchor", "middle").attr("transform", "rotate(-90)").style("fill", "white").text("Cumulative Oceanus Folk Songs");
        svgChart.append("text").attr("x", innerW/2).attr("y", innerH + 70).attr("text-anchor", "middle").style("fill", "white").style("font-size", "16px").style("font-weight", "bold")
            .text("Cumulative Songs in Oceanus Folk Genre Before & After Sailor");
        const lineGen = d3.line().x((d,i) => xScale(filteredYears[i])).y(d => yScale(d)).curve(d3.curveMonotoneX);
        svgChart.append("path").datum(cumulative).attr("fill", "none").attr("stroke", "#006C8F").attr("stroke-width", 4.5).attr("d", lineGen);
        if (globalYearMin >= filteredYears[0] && globalYearMin <= filteredYears[filteredYears.length-1]) {
            const x = xScale(globalYearMin);
            svgChart.append("line").attr("x1", x).attr("y1", 0).attr("x2", x).attr("y2", innerH).attr("stroke", "#FFD700").attr("stroke-width", 4.5).attr("stroke-dasharray", "6,4");
            svgChart.append("text").attr("x", x - 105).attr("y", 15).attr("fill", "#FFD700").style("font-size", "12px").text("Sailor’s career start");
        }
    }

    // Individual non‑cumulative line chart for the hovered collaborator
    function renderIndividualLineChart(artistId, selectedYear) {
        const artist = collaboratorData.find(a => a.id === artistId);
        if (!artist) return;
        let yearlyData = artist.data.filter(d => d.year <= selectedYear);
        if (yearlyData.length === 0) {
            d3.select("#slope-chart").html(`<p style='color:gray'>No data for ${artist.name} up to year ${selectedYear}</p>`);
            return;
        }
        const years = yearlyData.map(d => d.year);
        const counts = yearlyData.map(d => d.count);
        const chartWidth = 540, chartHeight = 700;
        const margin = { top: 100, right: 40, bottom: 60, left: 35 };
        const innerW = chartWidth - margin.left - margin.right;
        const innerH = chartHeight - margin.top - margin.bottom;
        const svgChart = d3.select("#slope-chart").html("").append("svg").attr("width", chartWidth).attr("height", chartHeight)
            .style("background", "black").append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const xScale = d3.scaleLinear().domain(d3.extent(years)).range([0, innerW]).nice();
        const yScale = d3.scaleLinear().domain([0, d3.max(counts) || 1]).range([innerH, 0]).nice();
        const tickStep = 5;
        const tickVals = [];
        for (let y = years[0]; y <= years[years.length-1]; y += tickStep) tickVals.push(y);
        svgChart.append("g").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(xScale).tickValues(tickVals).tickFormat(d3.format("d"))).style("color", "white");
        svgChart.append("g").call(d3.axisLeft(yScale)).style("color", "white");
        svgChart.selectAll(".tick text").style("font-weight", "bold").style("font-size", "14px");
        svgChart.selectAll(".domain").attr("stroke-width", 3.5);
        svgChart.selectAll(".tick line").attr("stroke-width", 3.5);
        svgChart.append("text").attr("x", innerW/2).attr("y", innerH + 40).attr("text-anchor", "middle").style("fill", "white").text("Year");
        svgChart.append("text").attr("x", -45).attr("y", 15).attr("text-anchor", "middle").attr("transform", "rotate(-90)").style("fill", "white").text("Oceanus Folk Songs");
        svgChart.append("text").attr("x", innerW/2).attr("y", -20).attr("text-anchor", "middle").style("fill", "white").style("font-size", "16px").style("font-weight", "bold")
            .text(`Oceanus Folk Songs per Year – ${artist.name}`);
        const lineGen = d3.line().x((d,i) => xScale(years[i])).y(d => yScale(d)).curve(d3.curveMonotoneX);
        svgChart.append("path").datum(counts).attr("fill", "none").attr("stroke", "#006C8F").attr("stroke-width", 4.5).attr("d", lineGen);
        years.forEach((year, idx) => {
            svgChart.append("circle").attr("cx", xScale(year)).attr("cy", yScale(counts[idx])).attr("r", 4).attr("fill", "#00BFFF").attr("stroke", "none").attr("opacity", 0.8);
        });
        const collabYear = artist.firstCollaborationYear;
        if (collabYear >= years[0] && collabYear <= years[years.length-1]) {
            const x = xScale(collabYear);
            svgChart.append("line").attr("x1", x).attr("y1", 0).attr("x2", x).attr("y2", innerH).attr("stroke", "#FFD700").attr("stroke-width", 2.5).attr("stroke-dasharray", "6,4");
            svgChart.append("text").attr("x", x - 160).attr("y", 10).attr("fill", "#FFD700").style("font-size", "12px").text("First collaboration with Sailor");
        }
    }

    // ------------------------------------------------------------
    // 9. Tooltips and hover switching for network circles
    // ------------------------------------------------------------
    const tooltip = d3.select(".tooltip");
    nodeGroup.selectAll("circle").on("mouseenter", function(event, d) {
        if (d.type === "sailor") return;
        if (d3.select(this.parentNode).style("opacity") === "0") return;
        const currentYear = parseInt(slider.value);
        let html = `<strong>${d.name || d.id}</strong><br>`;
        if (d.type === "influencer") {
            const influences = leftData.links.filter(l => l.source === d.id);
            if (influences.length) {
                html += `First appearance in Sailor's life: ${d.firstYear}<br>`;
                influences.forEach(inf => {
                    html += `📅 ${inf.year} (${inf.role || "unknown"}): “${inf.work_influencer || "unknown"}” → “${inf.sailor_work || "unknown"}”<br>`;
                });
                html += `<br>Total cumulative score: ${getLeftCumulativeScore(d.id, currentYear).toFixed(1)}`;
            }
        } else if (d.type === "collaborator") {
            hoveredArtistId = d.id;
            renderIndividualLineChart(d.id, currentYear);   // switch to individual chart
            const contributions = rightLinks.filter(l => l.target === d.id && l.year <= currentYear);
            if (contributions.length) {
                html += `First appearance in Sailor's life: ${d.firstYear}<br>`;
                const byYear = new Map();
                contributions.forEach(c => {
                    if (!byYear.has(c.year)) byYear.set(c.year, []);
                    byYear.get(c.year).push(c.work);
                });
                const yearsSorted = Array.from(byYear.keys()).sort((a,b)=>a-b);
                for (let yr of yearsSorted) {
                    html += `📅 ${yr}: ${byYear.get(yr).join(', ')}<br>`;
                }
                html += `<br>Total collaboration works: ${getRightCumulativeUniqueWorks(d.id, currentYear)}`;
            }
        } else if (d.type === "influenced") {
            const contributions = rightLinks.filter(l => l.target === d.id && l.year <= currentYear);
            if (contributions.length) {
                html += `First appearance in Sailor's life: ${d.firstYear}<br>`;
                contributions.forEach(cont => {
                    html += `📅 ${cont.year} | Influence score: ${cont.score}<br>`;
                });
                html += `<br>Total influence score: ${getRightCumulativeScore(d.id, currentYear).toFixed(1)}`;
            }
        }
        tooltip.html(html).style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 30) + "px").style("opacity", 1);
    }).on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 30) + "px");
    }).on("mouseleave", function(event, d) {
        tooltip.style("opacity", 0);
        if (d.type === "collaborator") {
            hoveredArtistId = null;
            renderAllCumulativeLineChart(parseInt(slider.value));   // revert to cumulative chart
        }
    });

    // Text hover – tooltip only (no chart switching)
    nodeGroup.selectAll(".node text").on("mouseenter", function(event, d) {
        if (d.type === "sailor") return;
        const currentYear = parseInt(slider.value);
        let html = `<strong>${d.name || d.id}</strong><br>`;
        if (d.type === "influencer") {
            const influences = leftData.links.filter(l => l.source === d.id);
            if (influences.length) {
                html += `First year: ${d.firstYear}<br>`;
                influences.forEach(inf => { html += `📅 ${inf.year} | Score: ${inf.score}<br>`; });
                html += `<br>Total cumulative score: ${getLeftCumulativeScore(d.id, currentYear).toFixed(1)}`;
            }
        } else if (d.type === "collaborator") {
            const contributions = rightLinks.filter(l => l.target === d.id && l.year <= currentYear);
            if (contributions.length) {
                html += `First year: ${d.firstYear}<br>`;
                const byYear = new Map();
                contributions.forEach(c => {
                    if (!byYear.has(c.year)) byYear.set(c.year, new Set());
                    byYear.get(c.year).add(c.work);
                });
                const yearsSorted = Array.from(byYear.keys()).sort((a,b)=>a-b);
                for (let yr of yearsSorted) {
                    html += `📅 ${yr}: ${byYear.get(yr).size} unique work${byYear.get(yr).size !== 1 ? 's' : ''}<br>`;
                }
                html += `<br>Total collaboration works: ${getRightCumulativeUniqueWorks(d.id, currentYear)}`;
            }
        } else {
            const contributions = rightLinks.filter(l => l.target === d.id && l.year <= currentYear);
            if (contributions.length) {
                html += `First year: ${d.firstYear}<br>`;
                contributions.forEach(cont => { html += `📅 ${cont.year} | Influence score: ${cont.score}<br>`; });
                html += `<br>Total influence score: ${getRightCumulativeScore(d.id, currentYear).toFixed(1)}`;
            }
        }
        tooltip.html(html).style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 30) + "px").style("opacity", 1);
    }).on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 30) + "px");
    }).on("mouseleave", () => tooltip.style("opacity", 0));

}).catch(error => {
    console.error("Error loading data:", error);
    document.getElementById("network-container").innerHTML = `<p style='color:red'>Error loading data: ${error.message}</p>`;
});
