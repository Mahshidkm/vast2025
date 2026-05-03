/**
 * sankey.js – Three Sankey diagrams with identical visual style.
 * - genres_out: Oceanus Folk → genres (original)
 * - artists_out: Oceanus Folk → artists (original, top 25)
 * - genres_in: Genres → Oceanus Folk (before/after)
 * All use nodeWidth = 80, nodePadding = 25, same fonts and colors.
 * Source nodes in genres_in are ordered by the influence on "after" target.
 */

// Data file mapping
const dataFiles = {
    genres_out: "../data/data_task2-2.json",
    artists_out: "../data/data_task2-2.json",
    genres_in: "../data/influence_to_oceanus_sankey.json"
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

            if (viewType === "genres_out" || viewType === "artists_out") {
                // ----- Original outflow logic -----
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
                // ----- Inflow view (before/after) -----
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

                // Order source nodes by the influence on "Oceanus Folk (after)"
                const targetName = "Oceanus Folk (after)";
                const afterNode = nodes.find(n => n.name === targetName);
                if (!afterNode) {
                    console.warn("Could not find target node 'Oceanus Folk (after)'");
                }
                // Get all source nodes (excluding the two target nodes)
                const targetNames = ["Oceanus Folk (before)", "Oceanus Folk (after)"];
                const sourceNodes = nodes.filter(n => !targetNames.includes(n.name));
                // Compute the flow to the "after" target for each source
                const afterFlow = new Map();
                sources: for (let src of sourceNodes) {
                    const linkToAfter = links.find(l => l.source === src && l.target === afterNode);
                    afterFlow.set(src, linkToAfter ? linkToAfter.value : 0);
                }
                // Sort sources by after flow descending
                const sortedSources = sourceNodes.sort((a, b) => afterFlow.get(b) - afterFlow.get(a));
                const targetNodes = nodes.filter(n => targetNames.includes(n.name));
                nodes = [...sortedSources, ...targetNodes];
            }

            // ------------------------------------------------------------
            // Unify layout parameters for all views (same as original)
            // ------------------------------------------------------------
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
            // Colors (same as original)
            // ------------------------------------------------------------
            const colorScale = d3.scaleOrdinal(d3.schemeTableau10);
            const getNodeColor = (d) => {
                if (viewType === "genres_out" || viewType === "artists_out") {
                    return d.type === "source" ? "#2c5f2d" : colorScale(d.name);
                } else { // genres_in
                    if (d.name === "Oceanus Folk (before)") return "#2c5f2d";
                    if (d.name === "Oceanus Folk (after)") return "#8B8000";
                    return colorScale(d.name);
                }
            };

            // ------------------------------------------------------------
            // Draw links (identical style)
            // ------------------------------------------------------------
            svg.append("g")
                .attr("fill", "none")
                .selectAll("path")
                .data(sankeyLinks)
                .enter()
                .append("path")
                .attr("class", "link")
                .attr("d", d3.sankeyLinkHorizontal())
                .attr("stroke", d => getNodeColor(d.target))
                .attr("stroke-width", d => Math.max(2, d.width))
                .attr("stroke-opacity", 0.6)
                .on("mouseenter", function(event, d) {
                    d3.select(this).attr("stroke-opacity", 1);
                    const original = d.originalValue !== undefined ? d.originalValue : d.value;
                    tooltip.html(`<strong>${d.source.name} → ${d.target.name}</strong><br>Influence count: ${original}`)
                        .style("left", (event.pageX + 15) + "px")
                        .style("top", (event.pageY - 30) + "px")
                        .style("opacity", 1);
                })
                .on("mousemove", function(event) {
                    tooltip.style("left", (event.pageX + 15) + "px")
                        .style("top", (event.pageY - 30) + "px");
                })
                .on("mouseleave", function() {
                    d3.select(this).attr("stroke-opacity", 0.6);
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
            // Node labels – all horizontal (no rotation) for all views
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

            // Optional legend for inflow view
            if (viewType === "genres_in") {
                svg.append("text")
                    .attr("x", innerWidth - 200)
                    .attr("y", innerHeight + 25)
                    .attr("text-anchor", "start")
                    .style("fill", "#aaa")
                    .style("font-size", "11px")
                    .text("🔹 Dark green: before Sailor | 🔸 Olive: after Sailor");
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
