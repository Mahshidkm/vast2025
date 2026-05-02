/**
 * sankey.js – Sankey diagram for Oceanus Folk influences
 * Loads ../data/data_task2-2.json and draws a Sankey diagram.
 * Shows flow from a source genre (Oceanus Folk) to either genres or artists.
 * A dropdown allows switching between the two views.
 */

// Load the data and initialise
d3.json("vast2025/data/data_task2-2.json")
    .then(data => {
        console.log("Data loaded:", data);
        if (!data.source_genre) {
            throw new Error("Missing source_genre in JSON");
        }

        // ------------------------------------------------------------
        // 1. Constants and dimensions
        // ------------------------------------------------------------
        const width = 1200;
        const height = 800;
        const margin = { top: 40, right: 30, bottom: 40, left: 30 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        let tooltip = null;

        // ------------------------------------------------------------
        // 2. Function to build the Sankey diagram for a given view
        // ------------------------------------------------------------
        function buildSankey(viewType) {
            const container = d3.select("#sankey-container");
            container.selectAll("*").remove();   // clear previous drawing

            // Create SVG group
            const svg = container
                .append("svg")
                .attr("width", width)
                .attr("height", height)
                .append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);

            // --------------------------------------------------------
            // 2a. Prepare target data (genres or artists)
            // --------------------------------------------------------
            let targetItems;
            if (viewType === "genres") {
                targetItems = data.genres;
                targetItems.sort((a, b) => b.count - a.count);
            } else {
                targetItems = data.artists;
                targetItems.sort((a, b) => b.count - a.count);
                // Limit to top 25 artists to keep diagram readable
                targetItems = targetItems.slice(0, 25);
                console.log(`Artists limited to top 25, showing ${targetItems.length} artists`);
            }

            // Error handling if no valid data
            if (!targetItems || targetItems.length === 0) {
                svg.append("text")
                    .attr("x", innerWidth / 2)
                    .attr("y", innerHeight / 2)
                    .attr("text-anchor", "middle")
                    .style("fill", "red")
                    .text(`No ${viewType} data available`);
                return;
            }

            const validTargets = targetItems.filter(item => item.count > 0);
            if (validTargets.length === 0) {
                svg.append("text")
                    .attr("x", innerWidth / 2)
                    .attr("y", innerHeight / 2)
                    .attr("text-anchor", "middle")
                    .text(`All ${viewType} have zero count`);
                return;
            }

            // --------------------------------------------------------
            // 2b. Apply power transformation to make small differences visible
            //     exponent > 1 exaggerates differences; <1 compresses them
            // --------------------------------------------------------
            const exponent = 2;
            const transformedTargets = validTargets.map(item => ({
                name: item.name,
                originalCount: item.count,
                transformedValue: Math.pow(item.count, exponent)
            }));

            // Source node gets a fixed large value to make it properly tall
            const sourceNode = {
                name: data.source_genre,
                type: "source",
                value: 1000
            };

            const targetNodes = transformedTargets.map(item => ({
                name: item.name,
                value: item.transformedValue,
                originalCount: item.originalCount,
                type: "target"
            }));

            const nodes = [sourceNode, ...targetNodes];
            const nodeMap = new Map();
            nodes.forEach(node => nodeMap.set(node.name, node));

            // Build links: from source to each target
            const links = targetNodes.map(target => ({
                source: nodeMap.get(data.source_genre),
                target: target,
                value: target.value,          // link width uses transformed value
                originalValue: target.originalCount
            }));

            console.log(`Building ${viewType} sankey with ${nodes.length} nodes, ${links.length} links`);

            // --------------------------------------------------------
            // 2c. Apply Sankey layout
            // --------------------------------------------------------
            const sankey = d3.sankey()
                .nodeWidth(80)
                .nodePadding(25)
                .extent([[0, 0], [innerWidth, innerHeight]])
                .nodeSort((a, b) => b.value - a.value);   // larger nodes at the top

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

            if (!sankeyNodes || sankeyNodes.length === 0) {
                svg.append("text")
                    .attr("x", innerWidth / 2)
                    .attr("y", innerHeight / 2)
                    .attr("text-anchor", "middle")
                    .text("No nodes to display");
                return;
            }

            // Color scale for target nodes (source node gets fixed color)
            const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

            // --------------------------------------------------------
            // 2d. Draw links
            // --------------------------------------------------------
            svg.append("g")
                .attr("fill", "none")
                .selectAll("path")
                .data(sankeyLinks)
                .enter()
                .append("path")
                .attr("class", "link")
                .attr("d", d3.sankeyLinkHorizontal())
                .attr("stroke", d => colorScale(d.target.name))
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

            // --------------------------------------------------------
            // 2e. Draw nodes
            // --------------------------------------------------------
            const nodeGroup = svg.append("g")
                .selectAll("g")
                .data(sankeyNodes)
                .enter()
                .append("g")
                .attr("transform", d => `translate(${d.x0},${d.y0})`);

            // Node rectangles
            nodeGroup.append("rect")
                .attr("height", d => d.y1 - d.y0)
                .attr("width", d => d.x1 - d.x0)
                .attr("fill", d => d.type === "source" ? "#2c5f2d" : colorScale(d.name))
                .attr("stroke", "#333")
                .attr("stroke-width", 1.5)
                .attr("rx", 4)
                .on("mouseenter", function(event, d) {
                    const total = d.type === "source"
                        ? sankeyLinks.filter(l => l.source === d).reduce((sum, l) => sum + (l.originalValue || l.value), 0)
                        : (d.originalCount || d.value);
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

            // Node labels
            nodeGroup.append("text")
                .attr("x", d => (d.x1 - d.x0) / 2)
                .attr("y", d => (d.y1 - d.y0) / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("transform", d => d.type === "source"
                    ? `rotate(-90, ${(d.x1 - d.x0) / 2}, ${(d.y1 - d.y0) / 2})`
                    : null)
                .style("font-size", d => {
                    if (d.type === "source") return "14px";
                    const nameLen = d.name.length;
                    if (nameLen <= 20) return "12px";
                    return "10px";
                })
                .style("fill", "white")
                .style("font-weight", "bold")
                .style("text-shadow", "0px 0px 2px black")
                .text(d => d.name.length > 35 ? d.name.slice(0, 32) + "…" : d.name);
        }

        // ------------------------------------------------------------
        // 3. Initialise tooltip and draw the default view (genres)
        // ------------------------------------------------------------
        tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("opacity", 0);

        buildSankey("genres");

        // ------------------------------------------------------------
        // 4. Listen to dropdown changes
        // ------------------------------------------------------------
        d3.select("#viewSelector").on("change", function() {
            const selected = d3.select(this).property("value");
            buildSankey(selected);
        });
    })
    .catch(error => {
        console.error("Error loading data:", error);
        document.getElementById("sankey-container").innerHTML = `<p style='color:red'>Error loading data: ${error.message}</p>`;
    });
