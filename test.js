// Define constants at the top
const constantBranchThickness = 0.9;

// Seeded random generator for reproducibility
function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
const rng = mulberry32(69); // fixed seed -> deterministic layout

// Load both left and right JSON files
Promise.all([
    d3.json("data/data_task1-1.json"),
    d3.json("data/data_task1-2.json"),
    d3.json("data/data_task1-3.json")
]).then(([leftData, rightData, SlopeData]) => {
    console.log("Left data loaded. First link:", leftData.links[0]);
    console.log("Right data loaded. First link:", rightData.links[0]);

    // --- Process left side (influencers) ---
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
    leftInfluencers.forEach(inf => { const t = getLeftCumulativeScore(inf, leftYearMax); if (t > leftMaxCumulative) leftMaxCumulative = t; });

    // --- Process right side (collaborators and influenced) ---
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
    const allRightNodes = [...rightCollaborators, ...rightInfluenced];

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

    const allYears = [...new Set([...leftAllYears, ...rightLinks.map(l => l.year)])].sort((a,b)=>a-b);
    const yearMin = d3.min(allYears), yearMax = d3.max(allYears);

    // Compute maxima for each group
    let collaboratorMaxUnique = 0;
    let influencedMaxCumulative = 0;
    rightCollaborators.forEach(node => {
        const uniqueCount = getRightCumulativeUniqueWorks(node.id, yearMax);
        if (uniqueCount > collaboratorMaxUnique) collaboratorMaxUnique = uniqueCount;
    });
    rightInfluenced.forEach(node => {
        const total = getRightCumulativeScore(node.id, yearMax);
        if (total > influencedMaxCumulative) influencedMaxCumulative = total;
    });

    // --- SINGLE GLOBAL POWER SCALE for all node types ---
    const globalMaxValue = Math.max(
        leftMaxCumulative,
        influencedMaxCumulative,
        collaboratorMaxUnique
    );
    console.log("Global max value for circle scaling:", globalMaxValue);

    const minRadius = 5;
    const maxRadius = 22;
    const exponent = 0.5;
    const globalRadiusScale = (value) => {
        if (value <= 0) return minRadius;
        const t = Math.pow(value / globalMaxValue, exponent);
        return minRadius + (maxRadius - minRadius) * t;
    };

    // --- Angular sector allocation (proportional to number of nodes, with extra space for influenced) ---
    const totalNodesRaw = leftInfluencers.length + rightCollaborators.length + rightInfluenced.length;
    const influencerWeight = leftInfluencers.length;
    const collaboratorWeight = rightCollaborators.length;
    const influencedWeight = rightInfluenced.length * 2;
    const totalWeight = influencerWeight + collaboratorWeight + influencedWeight;
    const influencerAngle = (influencerWeight / totalWeight) * 2 * Math.PI;
    const collaboratorAngle = (collaboratorWeight / totalWeight) * 2 * Math.PI;
    const influencedAngle = (influencedWeight / totalWeight) * 2 * Math.PI;

    const startAngleBase = -Math.PI / 2;
    let currentAngle = startAngleBase;

    const influencerStart = currentAngle;
    currentAngle += influencerAngle;
    const influencerEnd = currentAngle;
    const collaboratorStart = currentAngle;
    currentAngle += collaboratorAngle;
    const collaboratorEnd = currentAngle;
    const influencedStart = currentAngle;
    currentAngle += influencedAngle;
    const influencedEnd = currentAngle;

    // Angular margin for point placement (keeps circles away from separators)
    const marginRad = 0.14;
    const influencerStartAdjusted = influencerStart + marginRad;
    const influencerEndAdjusted = influencerEnd - marginRad;
    const collaboratorStartAdjusted = collaboratorStart + marginRad;
    const collaboratorEndAdjusted = collaboratorEnd - marginRad;
    const influencedStartAdjusted = influencedStart + marginRad;
    const influencedEndAdjusted = influencedEnd - marginRad;

    // Darker inactive colors
    const influencerColor = "#8E44AD";      // dark purple
    const collaboratorColor = "#006C8F";    // dark cyan
    const influencedColor = "#E65C4A";      // dark coral

    // Lighter active colors
    const activeInfluencerColor = "#F2CFFF";   // very light purple
    const activeCollaboratorColor = "#A0F0FF"; // light cyan
    const activeInfluencedColor = "#FFD1B3";   // light coral

    // --- Non‑overlapping point generation (unchanged) ---
    const width = 1200, height = 1200;
    const centerX = width/2, centerY = height/2;
    const sailorRadius = 47;
    const bigCircleRadius = 380;
    const maxAttempts = 2000;

    function generateNonOverlappingPoints(N, radii, centerX, centerY, bigRadius, startAngle, endAngle, sailorRadius, margin, rng, maxAttempts) {
        const points = [];
        const angleRange = endAngle - startAngle;
        const indices = Array.from(Array(N).keys());
        indices.sort((a,b) => radii[b] - radii[a]);
        
        for (let idx of indices) {
            const r = radii[idx];
            const minDistFromSailor = sailorRadius + r + margin;
            const maxDistFromCenter = bigRadius - r - margin;
            let placed = false;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const u = rng();
                const v = rng();
                const angle = startAngle + u * angleRange;
                const rad = Math.sqrt(v) * bigRadius;
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
                    const minSep = r + otherRadius + margin;
                    if (Math.hypot(dx, dy) < minSep) {
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
                console.warn(`Could not place point ${idx} after ${maxAttempts} attempts. Using fallback.`);
                const angle = startAngle + rng() * angleRange;
                const rad = Math.min(maxDistFromCenter, Math.max(minDistFromSailor, Math.sqrt(rng()) * bigRadius));
                const x = centerX + rad * Math.cos(angle);
                const y = centerY + rad * Math.sin(angle);
                points.push({ x, y, idx });
            }
        }
        const orderedPoints = new Array(N);
        for (let p of points) orderedPoints[p.idx] = { x: p.x, y: p.y };
        return orderedPoints;
    }

    const leftRadii = leftInfluencers.map(name => globalRadiusScale(getLeftCumulativeScore(name, yearMax)) + 2);
    const collaboratorRadii = rightCollaborators.map(node => globalRadiusScale(getRightCumulativeUniqueWorks(node.id, yearMax)) + 2);
    const influencedRadii = rightInfluenced.map(node => globalRadiusScale(getRightCumulativeScore(node.id, yearMax)) + 2);

    const leftPoints = generateNonOverlappingPoints(leftInfluencers.length, leftRadii, centerX, centerY, bigCircleRadius, influencerStartAdjusted, influencerEndAdjusted, sailorRadius, 17, rng, maxAttempts);
    const collaboratorPoints = generateNonOverlappingPoints(rightCollaborators.length, collaboratorRadii, centerX, centerY, bigCircleRadius, collaboratorStartAdjusted, collaboratorEndAdjusted, sailorRadius, 17, rng, maxAttempts);
    const influencedPoints = generateNonOverlappingPoints(rightInfluenced.length, influencedRadii, centerX, centerY, bigCircleRadius, influencedStartAdjusted, influencedEndAdjusted, sailorRadius, 17, rng, maxAttempts);

    // --- Build combined nodes array (unchanged) ---
    const nodes = [];
    nodes.push({ id: "sailor", type: "sailor", x: centerX, y: centerY, firstYear: yearMin, radius: sailorRadius });

    leftInfluencers.forEach((name, idx) => {
        nodes.push({
            id: name,
            type: "influencer",
            side: "influencer",
            x: leftPoints[idx].x,
            y: leftPoints[idx].y,
            firstYear: leftInfluencerFirstYear.get(name),
            radius: 5
        });
    });

    rightCollaborators.forEach((node, idx) => {
        nodes.push({
            id: node.id,
            type: "collaborator",
            side: "collaborator",
            x: collaboratorPoints[idx].x,
            y: collaboratorPoints[idx].y,
            firstYear: node.firstYear,
            name: node.name,
            originalId: node.id,
            radius: 5
        });
    });

    rightInfluenced.forEach((node, idx) => {
        nodes.push({
            id: node.id,
            type: "influenced",
            side: "influenced",
            x: influencedPoints[idx].x,
            y: influencedPoints[idx].y,
            firstYear: node.firstYear,
            name: node.name,
            originalId: node.id,
            radius: 5
        });
    });

    // --- SVG setup with colored outer arcs ---
    const svg = d3.select("#viz").append("svg").attr("width", width).attr("height", height)
        .call(d3.zoom().on("zoom", (event) => { g.attr("transform", event.transform); }))
        .append("g").attr("id", "viz-group");

    // Function to draw an arc from angle start to end (in radians) with given color
    function drawArc(startAngle, endAngle, color, radius) {
        const start = { x: centerX + radius * Math.cos(startAngle), y: centerY + radius * Math.sin(startAngle) };
        const end = { x: centerX + radius * Math.cos(endAngle), y: centerY + radius * Math.sin(endAngle) };
        const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0;
        const path = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
        svg.append("path")
            .attr("d", path)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 3);
    }

    // Draw the three outer arcs (big circle) with inactive colors
    drawArc(influencerStart, influencerEnd, influencerColor, bigCircleRadius);
    drawArc(collaboratorStart, collaboratorEnd, collaboratorColor, bigCircleRadius);
    drawArc(influencedStart, influencedEnd, influencedColor, bigCircleRadius);

    // Draw radial separator lines as two adjacent lines (one for each adjacent sector)
    function drawSeparator(angle, colorLeft, colorRight) {
        const r = bigCircleRadius;
        const delta = 0.006;
        const angle1 = angle - delta;
        const angle2 = angle + delta;
        const x1 = centerX + r * Math.cos(angle1);
        const y1 = centerY + r * Math.sin(angle1);
        const x2 = centerX + r * Math.cos(angle2);
        const y2 = centerY + r * Math.sin(angle2);
        svg.append("line")
            .attr("x1", centerX).attr("y1", centerY)
            .attr("x2", x1).attr("y2", y1)
            .attr("stroke", colorLeft)
            .attr("stroke-width", 2.5)
            .attr("stroke-linecap", "round");
        svg.append("line")
            .attr("x1", centerX).attr("y1", centerY)
            .attr("x2", x2).attr("y2", y2)
            .attr("stroke", colorRight)
            .attr("stroke-width", 4.5)
            .attr("stroke-linecap", "round");
    }

    drawSeparator(influencerStart, influencedColor, influencerColor);
    drawSeparator(influencerEnd, influencerColor, collaboratorColor);
    drawSeparator(collaboratorEnd, collaboratorColor, influencedColor);

    // Arrow markers for active colors
    const defs = svg.append("defs");
    defs.append("marker")
        .attr("id", "arrowPurple")
        .attr("viewBox", "0 -3 6 6")
        .attr("refX", 6)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("polygon")
        .attr("points", "0,-3 6,0 0,3")
        .attr("fill", activeInfluencerColor)
        .attr("stroke", "none");
    defs.append("marker")
        .attr("id", "arrowCyan")
        .attr("viewBox", "0 -3 6 6")
        .attr("refX", 6)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("polygon")
        .attr("points", "0,-3 6,0 0,3")
        .attr("fill", activeCollaboratorColor)
        .attr("stroke", "none");
    defs.append("marker")
        .attr("id", "arrowCoral")
        .attr("viewBox", "0 -3 6 6")
        .attr("refX", 6)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("polygon")
        .attr("points", "0,-3 6,0 0,3")
        .attr("fill", activeInfluencedColor)
        .attr("stroke", "none");

    const nodeGroup = svg.append("g").attr("class", "nodes");
    const linkGroup = svg.append("g").attr("class", "links");

    const style = svg.append("style");
    style.text(`
        .node circle { transition: stroke 0.2s ease, stroke-width 0.2s ease; }
        .node circle:hover { stroke: white !important; stroke-width: 3px !important; filter: none !important; }
        .node text { fill: white; font-weight: bold; }
        #viz { background: transparent; }
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
                g.append("circle").attr("r", sailorRadius)
                    .style("fill", "#FFD700").style("stroke", "white").style("stroke-width", 2);
                g.append("text")
                    .attr("dy", "-0.3em")
                    .attr("text-anchor", "middle")
                    .style("font-size", "24px")
                    .style("fill", "white")
                    .style("font-weight", "bold")
                    .text("Sailor");
                g.append("text")
                    .attr("class", "sailor-year")
                    .attr("dy", "0.8em")
                    .attr("text-anchor", "middle")
                    .style("font-size", "18px")
                    .style("fill", "white")
                    .style("font-weight", "bold")
                    .text(yearMin);
            } else {
                let fillColor;
                if (d.type === "influencer") fillColor = influencerColor;
                else if (d.type === "collaborator") fillColor = collaboratorColor;
                else fillColor = influencedColor;
                g.append("circle").attr("r", 4)
                    .style("fill", fillColor).style("stroke", "white").style("stroke-width", 1.5);
                g.append("text")
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "middle")
                    .style("font-size", "0px")
                    .style("fill", "white")
                    .style("font-weight", "bold")
                    .text(d.name || d.id);
            }
        });
    }
    drawInitial();

    // --- Update function (with active colors per sector) ---
    function update(year) {
        nodeGroup.selectAll(".node").transition().duration(400)
            .style("opacity", d => d.type === "sailor" ? 1 : (d.firstYear <= year ? 1 : 0))
            .style("visibility", d => d.type === "sailor" ? "visible" : (d.firstYear <= year ? "visible" : "hidden"));
        
        const activeInfluencer = new Set();
        const activeCollaborator = new Set();
        const activeInfluenced = new Set();
        leftData.links.forEach(l => { if (l.year === year) activeInfluencer.add(l.source); });
        rightLinks.forEach(l => { 
            if (l.year === year) {
                const targetNode = nodes.find(n => n.id === l.target);
                if (targetNode.type === "collaborator") activeCollaborator.add(l.target);
                else if (targetNode.type === "influenced") activeInfluenced.add(l.target);
            }
        });

        const leftScores = leftInfluencers.map(inf => ({ id: inf, score: getLeftCumulativeScore(inf, year) }));
        leftScores.sort((a,b) => b.score - a.score);
        const topInfluencer = new Set(leftScores.slice(0,5).map(d => d.id));

        const collaboratorUnique = rightCollaborators.map(node => ({ id: node.id, count: getRightCumulativeUniqueWorks(node.id, year) }));
        collaboratorUnique.sort((a,b) => b.count - a.count);
        const topCollaborator = new Set(collaboratorUnique.slice(0,5).map(d => d.id));

        const influencedScores = rightInfluenced.map(node => ({ id: node.id, score: getRightCumulativeScore(node.id, year) }));
        influencedScores.sort((a,b) => b.score - a.score);
        const topInfluenced = new Set(influencedScores.slice(0,5).map(d => d.id));

        nodes.forEach(node => {
            if (node.type === "sailor") return;
            let targetRadius = 4;
            let fillColor;
            let isTop = false;
            let value = 0;
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
            } else if (node.type === "influenced") {
                value = getRightCumulativeScore(node.id, year);
                targetRadius = value > 0 ? globalRadiusScale(value) : minRadius;
                fillColor = activeInfluenced.has(node.id) ? activeInfluencedColor : influencedColor;
                isTop = topInfluenced.has(node.id);
            }
            const circle = nodeGroup.selectAll(".node").filter(d => d.id === node.id).select("circle");
            if (circle.size()) {
                circle.transition().duration(400)
                    .attr("r", targetRadius)
                    .style("fill", fillColor)
                    .style("stroke", "white")
                    .style("stroke-width", isTop ? "4px" : "0px");
            }
        });

        nodes.forEach(node => {
            if (node.type === "sailor") return;
            let isTop = false;
            let targetRadius = 4;
            if (node.type === "influencer") {
                const value = getLeftCumulativeScore(node.id, year);
                targetRadius = value > 0 ? globalRadiusScale(value) : minRadius;
                isTop = topInfluencer.has(node.id);
            } else if (node.type === "collaborator") {
                const value = getRightCumulativeUniqueWorks(node.id, year);
                targetRadius = value > 0 ? globalRadiusScale(value) : minRadius;
                isTop = topCollaborator.has(node.id);
            } else if (node.type === "influenced") {
                const value = getRightCumulativeScore(node.id, year);
                targetRadius = value > 0 ? globalRadiusScale(value) : minRadius;
                isTop = topInfluenced.has(node.id);
            }
            const text = nodeGroup.selectAll(".node").filter(d => d.id === node.id).select("text");
            if (text.size()) {
                const side = node.x < centerX ? -1 : 1;
                const offset = targetRadius + 6;
                const dx = side * offset;
                const anchor = side === -1 ? "end" : "start";
                text.transition().duration(400)
                    .attr("dx", dx)
                    .attr("text-anchor", anchor)
                    .style("font-size", isTop ? "20px" : "0px")
                    .style("opacity", isTop ? 1 : 0)
                    .style("visibility", isTop ? "visible" : "hidden")
                    .style("fill", "white")
                    .style("font-weight", "bold")
                    .text(node.name || node.id);
            }
        });

        nodeGroup.selectAll(".node").filter(d => d.type === "sailor").select(".sailor-year").text(year);
        linkGroup.selectAll("*").remove();
        const sailorNode = nodes.find(n => n.id === "sailor");

        // LEFT edges (influencer → sailor) – use light purple
        leftData.links.forEach(link => {
            if (link.year !== year) return;
            const sourceNode = nodes.find(n => n.id === link.source && n.type === "influencer");
            if (!sourceNode || sourceNode.firstYear > year) return;
            const value = getLeftCumulativeScore(link.source, year);
            const start = pointOnCircle(sourceNode.x, sourceNode.y, globalRadiusScale(value), sailorNode.x, sailorNode.y);
            const end = pointOnCircle(sailorNode.x, sailorNode.y, sailorRadius, sourceNode.x, sourceNode.y);
            linkGroup.append("line")
                .attr("class", "link")
                .attr("stroke-linecap", "round")
                .attr("stroke-width", constantBranchThickness)
                .attr("stroke", activeInfluencerColor)
                .attr("x1", start.x).attr("y1", start.y)
                .attr("x2", end.x).attr("y2", end.y)
                .attr("marker-end", "url(#arrowPurple)");
        });

        // RIGHT edges (sailor → collaborator/influenced) – use light cyan or light coral
        rightLinks.forEach(link => {
            if (link.year !== year) return;
            const targetNode = nodes.find(n => n.id === link.target);
            if (!targetNode || targetNode.firstYear > year) return;
            if (targetNode.type === "collaborator" || targetNode.type === "influenced") {
                let value;
                if (targetNode.type === "collaborator") {
                    value = getRightCumulativeUniqueWorks(link.target, year);
                } else {
                    value = getRightCumulativeScore(link.target, year);
                }
                const targetRadius = value > 0 ? globalRadiusScale(value) : minRadius;
                const start = pointOnCircle(sailorNode.x, sailorNode.y, sailorRadius, targetNode.x, targetNode.y);
                const end = pointOnCircle(targetNode.x, targetNode.y, targetRadius, sailorNode.x, sailorNode.y);
                const edgeColor = (targetNode.type === "collaborator") ? activeCollaboratorColor : activeInfluencedColor;
                const arrowId = (targetNode.type === "collaborator") ? "url(#arrowCyan)" : "url(#arrowCoral)";
                linkGroup.append("line")
                    .attr("class", "link")
                    .attr("stroke-linecap", "round")
                    .attr("stroke-width", constantBranchThickness)
                    .attr("stroke", edgeColor)
                    .attr("x1", start.x).attr("y1", start.y)
                    .attr("x2", end.x).attr("y2", end.y)
                    .attr("marker-end", arrowId);
            }
        });
    }

    const slider = document.getElementById("yearSlider");
    const yearLabel = document.getElementById("yearLabel");
    slider.min = yearMin; slider.max = yearMax; slider.value = yearMin;
    yearLabel.innerText = yearMin;
    slider.addEventListener("input", ()=>{
        const y = parseInt(slider.value);
        yearLabel.innerText = y;
        update(y);
    });
    update(yearMin);

    const tooltip = d3.select(".tooltip");
    nodeGroup.selectAll("circle").on("mouseenter", function(event, d) {
        if (d.type === "sailor") return;
        if (d3.select(this.parentNode).style("opacity") === "0") return;
        const currentYear = parseInt(slider.value);
        let html = `<strong>${d.name || d.id}</strong><br>`;
        if (d.type === "influencer") {
            const influences = leftData.links.filter(l => l.source === d.id);
            if (influences.length) {
                html += `First year: ${d.firstYear}<br>`;
                influences.forEach(inf => {
                    html += `📅 ${inf.year} | Score: ${inf.score}<br>`;
                });
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
                    const uniqueCount = byYear.get(yr).size;
                    html += `📅 ${yr}: ${uniqueCount} unique work${uniqueCount !== 1 ? 's' : ''}<br>`;
                }
                const totalUnique = getRightCumulativeUniqueWorks(d.id, currentYear);
                html += `<br>Total unique works: ${totalUnique}`;
            }
        } else if (d.type === "influenced") {
            const contributions = rightLinks.filter(l => l.target === d.id && l.year <= currentYear);
            if (contributions.length) {
                html += `First year: ${d.firstYear}<br>`;
                contributions.forEach(cont => {
                    html += `📅 ${cont.year} | Influence score: ${cont.score}<br>`;
                });
                const total = getRightCumulativeScore(d.id, currentYear);
                html += `<br>Total influence score: ${total.toFixed(1)}`;
            }
        }
        tooltip.html(html)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 30) + "px")
            .style("opacity", 1);
    }).on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 30) + "px");
    }).on("mouseleave", () => tooltip.style("opacity", 0));

    svg.append("text").attr("x",20).attr("y",30).attr("fill","white").style("font-size","11px")
        .text(`🌿 Three proportional sectors | Power‑law scaling | Active = lighter tone | Black background`);
}).catch(error => {
    console.error("Error loading data:", error);
    document.getElementById("viz").innerHTML = `<p style='color:red'>Error loading data: ${error.message}</p>`;
});