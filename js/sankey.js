/**
 * sankey.js – Three Sankey diagrams with identical visual style.
 * - genres_out: Oceanus Folk → genres (original)
 * - artists_out: Oceanus Folk → artists (original, top 25)
 * - genres_in: Genres → Oceanus Folk (before/after)
 *   - Ordered by total influence to "after Sailor" (descending)
 *   - Most influential genre (highest after‑Sailor) highlighted in red
 *   - Target nodes: before = blue, after = red
 *   - Links with highest flow to before/after are highlighted in gold.
 */

// Data file mapping
const dataFiles = {
    genres_out: "/vast2025/data/data_task2-2.json",
    artists_out: "/vast2025/data/data_task2-2.json",
    genres_in: "/vast2025/data/influence_to_oceanus_sankey.json"
};

let tooltip;

function buildSankey(viewType) {
    const file = dataFiles[viewType];
    if (!file) {
        console.error("Unknown view type");
        return;
    }

    d3.json(file)
        .then(data => {
            console.log(`Loaded ${viewType} data:`, data);

            // Dimensions (same as original)
            const width = 1200, height = 800;
            const margin = { top: 40, right: 30, bottom: 40, left: 30 };
            const innerWidth = width - margin.left - margin.right;
            const innerHeight = height - margin.top - margin.bottom;

            const container = d3.select("#sankey-container");
            container.html("");

            const svg = container
                .append("svg")
                .attr("width", width)
                .attr("height", height)
                .append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);

            // ------------------------------------------------------------
            // Prepare nodes and links
            // ------------------------------------------------------------
            let nodes, links;
            let topSource = null;
            let maxBeforeLink = null;
            let maxAfterLink = null;

            if (viewType === "genres_out" || viewType === "artists_out") {
                // ----- Original outflow logic (unchanged) -----
                const sourceGenre = data.source_genre;
                let targetItems = (viewType === "genres_out") ? data.genres : data.artists;
                if (!targetItems) throw new Error(`Missing target data`);

                targetItems.sort((a, b) => b.count - a.count);
                if (viewType === "artists_out") targetItems = targetItems.slice(0, 25);

                const validTargets = targetItems.filter(item => item.count > 0);
                if (validTargets.length === 0) {
                    svg.append("text")
                        .attr("x", innerWidth / 2)
                        .attr("y", innerHeight / 2)
                        .attr("text-anchor", "middle")
                        .style("fill", "red")
                        .text(`No ${viewType === "genres_out" ? "genres" : "artists"} with positive count`);
                    return;
                }

                const exponent = 2;
                const transformedTargets = validTargets.map(item => ({
                    name: item.name,
                    originalCount: item.count,
                    transformedValue: Math.pow(item.count, exponent)
                }));

                const sourceNode = {
                    name: sourceGenre,
                    type: "source",
                    value: 1000
                };

                const targetNodes = transformedTargets.map(item => ({
                    name: item.name,
                    value: item.transformedValue,
                    originalCount: item.originalCount,
                    type: "target"
                }));

                nodes = [sourceNode, ...targetNodes];
                const nodeMap = new Map(nodes.map(n => [n.name, n]));

                links = targetNodes.map(target => ({
                    source: nodeMap.get(sourceGenre),
                    target: target,
                    value: target.value,
                    originalValue: target.originalCount
                }));
            }
            else if (viewType === "genres_in") {
                // ----- Inflow view (before/after) with ordering by "after" value and red highlighting -----
                if (!data.nodes || !data.links) throw new Error("Invalid inflow JSON");
                nodes = data.nodes.map(node => ({ ...node }));
                links = data.links.map(link => ({ ...link }));

                // Convert indices to node references
                const nodeMap = new Map();
                nodes.forEach((node, i) => {
                    nodeMap.set(i, node);
                    node.index = i;
                });
                links = links.map(link => ({
                    source: nodeMap.get(link.source),
                    target: nodeMap.get(link.target),
                    value: link.value
                }));

                // Identify target nodes
                const beforeTarget = nodes.find(n => n.name === "Oceanus Folk (before)");
                const afterTarget = nodes.find(n => n.name === "Oceanus Folk (after)");
                if (!beforeTarget || !afterTarget) throw new Error("Target nodes not found");

                // Compute for each source node: total value to "after" target
                const sourceAfterMap = new Map();
                links.forEach(link => {
                    if (link.target === afterTarget) {
                        sourceAfterMap.set(link.source, (sourceAfterMap.get(link.source) || 0) + link.value);
                    }
                });

                // Determine the source with maximum after value (for red coloring)
                let maxAfter = 0;
                sourceAfterMap.forEach((val, src) => {
                    if (val > maxAfter) {
                        maxAfter = val;
                        topSource = src;
                    }
                });

                // Find the link with maximum value to beforeTarget and afterTarget
                let maxBeforeValue = 0;
                let maxAfterValue = 0;
                links.forEach(link => {
                    if (link.target === beforeTarget && link.value > maxBeforeValue) {
                        maxBeforeValue = link.value;
                        maxBeforeLink = link;
                    }
                    if (link.target === afterTarget && link.value > maxAfterValue) {
                        maxAfterValue = link.value;
                        maxAfterLink = link;
                    }
                });

                // Order source nodes by after value descending
                const sourceNodes = nodes.filter(n => n !== beforeTarget && n !== afterTarget);
                sourceNodes.sort((a, b) => (sourceAfterMap.get(b) || 0) - (sourceAfterMap.get(a) || 0));
                const orderedNodes = [...sourceNodes, beforeTarget, afterTarget];
                nodes = orderedNodes;
            }

            // Unified layout parameters
            const nodeWidth = 80;
            const nodePadding = 25;

            const sankey = d3.sankey()
                .nodeWidth(nodeWidth)
                .nodePadding(nodePadding)
                .extent([[0, 0], [innerWidth, innerHeight]])
                .nodeSort((a, b) => nodes.indexOf(a) - nodes.indexOf(b));

            let sankeyNodes, sankeyLinks;
            try {
                const graph = { nodes, links };
                const result = sankey(graph);
                sankeyNodes = result.nodes;
                sankeyLinks = result.links;
            } catch (err) {
                console.error("Sankey layout failed:", err);
                svg.append("text")
                    .attr("x", innerWidth / 2)
                    .attr("y", innerHeight / 2)
                    .attr("text-anchor", "middle")
                    .style("fill", "red")
                    .text("Sankey layout error – check data");
                return;
            }

            // ------------------------------------------------------------
            // Colors
            // ------------------------------------------------------------
            const colorScale = d3.scaleOrdinal(d3.schemeTableau10);
            const getNodeColor = (d) => {
                if (viewType === "genres_out" || viewType === "artists_out") {
                    return d.type === "source" ? "#2c5f2d" : colorScale(d.name);
                } else { // genres_in
                    if (d.name === "Oceanus Folk (before)") return "#1f77b4"; // blue
                    if (d.name === "Oceanus Folk (after)") return "#d62728";  // red
                    if (topSource && d === topSource) return "#d62728";
                    return colorScale(d.name);
                }
            };

            // ------------------------------------------------------------
            // Draw links (identical style, but highlight max before/after links)
            // ------------------------------------------------------------
            svg.append("g")
                .attr("fill", "none")
                .selectAll("path")
                .data(sankeyLinks)
                .enter()
                .append("path")
                .attr("class", "link")
                .attr("d", d3.sankeyLinkHorizontal())
                .attr("stroke", d => {
                    if (viewType === "genres_in" && (d === maxBeforeLink || d === maxAfterLink)) {
                        return "#FFD700"; // gold highlight
                    }
                    return getNodeColor(d.target);
                })
                .attr("stroke-width", d => {
                    if (viewType === "genres_in" && (d === maxBeforeLink || d === maxAfterLink)) {
                        return Math.max(3, d.width * 1.2);
                    }
                    return Math.max(2, d.width);
                })
                .attr("stroke-opacity", 0.7)
                .on("mouseenter", function(event, d) {
                    d3.select(this).attr("stroke-opacity", 1);
                    const original = d.originalValue !== undefined ? d.originalValue : d.value;
                    let highlightMsg = "";
                    if (viewType === "genres_in") {
                        if (d === maxBeforeLink) highlightMsg = " ★ Most influential before Sailor";
                        if (d === maxAfterLink) highlightMsg = " ★ Most influential after Sailor";
                    }
                    tooltip.html(`<strong>${d.source.name} → ${d.target.name}</strong><br>Influence count: ${original}${highlightMsg}`)
                        .style("left", (event.pageX + 15) + "px")
                        .style("top", (event.pageY - 30) + "px")
                        .style("opacity", 1);
                })
                .on("mousemove", function(event) {
                    tooltip.style("left", (event.pageX + 15) + "px")
                        .style("top", (event.pageY - 30) + "px");
                })
                .on("mouseleave", function() {
                    d3.select(this).attr("stroke-opacity", 0.7);
                    tooltip.style("opacity", 0);
                });

            // ------------------------------------------------------------
            // Draw nodes (identical style)
            // ------------------------------------------------------------
            const nodeGroup = svg.append("g")
                .selectAll("g")
                .data(sankeyNodes)
                .enter()
                .append("g")
                .attr("transform", d => `translate(${d.x0},${d.y0})`);

            nodeGroup.append("rect")
                .attr("height", d => d.y1 - d.y0)
                .attr("width", d => d.x1 - d.x0)
                .attr("fill", getNodeColor)
                .attr("stroke", "#333")
                .attr("stroke-width", 1.5)
                .attr("rx", 4)
                .on("mouseenter", function(event, d) {
                    let total;
                    if (viewType === "genres_out" || viewType === "artists_out") {
                        total = d.type === "source"
                            ? sankeyLinks.filter(l => l.source === d).reduce((sum, l) => sum + (l.originalValue || l.value), 0)
                            : (d.originalCount || d.value);
                    } else {
                        total = d.targetLinks ? d.targetLinks.reduce((s, l) => s + l.value, 0) : d.value;
                    }
                    tooltip.html(`<strong>${d.name}</strong><br>Total influence: ${total}`)
                        .style("left", (event.pageX + 15) + "px")
                        .style("top", (event.pageY - 30) + "px")
                        .style("opacity", 1);
                })
                .on("mousemove", function(event) {
                    tooltip.style("left", (event.pageX + 15) + "px")
                        .style("top", (event.pageY - 30) + "px");
                })
                .on("mouseleave", function() {
                    tooltip.style("opacity", 0);
                });

            // ------------------------------------------------------------
            // Node labels – horizontal for all nodes (no rotation)
            // ------------------------------------------------------------
            nodeGroup.append("text")
                .attr("x", d => (d.x1 - d.x0) / 2)
                .attr("y", d => (d.y1 - d.y0) / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .style("font-size", d => {
                    const nameLen = d.name.length;
                    if (nameLen <= 20) return "12px";
                    return "10px";
                })
                .style("fill", "white")
                .style("font-weight", "bold")
                .style("text-shadow", "0px 0px 2px black")
                .text(d => d.name.length > 35 ? d.name.slice(0, 32) + "…" : d.name);

            // Legend for genres_in view (blue and red swatches)
            if (viewType === "genres_in") {
                svg.append("text")
                    .attr("x", innerWidth - 220)
                    .attr("y", innerHeight + 25)
                    .attr("text-anchor", "start")
                    .style("fill", "#aaa")
                    .style("font-size", "11px")
                    .html("🔵 Blue: before Sailor &nbsp;&nbsp; 🔴 Red: after Sailor");
                if (maxBeforeLink || maxAfterLink) {
                    svg.append("text")
                        .attr("x", innerWidth - 220)
                        .attr("y", innerHeight + 40)
                        .attr("text-anchor", "start")
                        .style("fill", "#FFD700")
                        .style("font-size", "11px")
                        .html("⭐ Gold links = most influential in each period");
                }
            }
        })
        .catch(error => {
            console.error(`Error loading ${file}:`, error);
            document.getElementById("sankey-container").innerHTML = `<p style='color:red'>Failed to load data: ${error.message}</p>`;
        });
}

// Initialise tooltip and draw default view (genres_out)
tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("opacity", 0);

buildSankey("genres_out");

// Listen to dropdown changes
d3.select("#viewSelector").on("change", function() {
    const selected = d3.select(this).property("value");
    buildSankey(selected);
});
