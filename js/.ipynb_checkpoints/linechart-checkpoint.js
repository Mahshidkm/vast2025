/**
 * linechart.js – Oceanus Folk Works Over Time
 * Loads oceanus_trends.json and draws a line chart with:
 *   - Total Oceanus works (magenta)
 *   - Sailor's Oceanus works (gold)
 *   - Sailor's notable Oceanus works (red)
 * Includes checkboxes to toggle each line on/off.
 */

// Load the data and initialise the chart
d3.json("../data/oceanus_trends.json")
    .then(data => {
        const years = data.years;
        const allData = data.all_oceanus;
        const sailorData = data.sailor_oceanus;
        const notableData = data.sailor_notable;

        // Fixed chart dimensions
        const width = 1200, height = 600;
        const margin = { top: 40, right: 80, bottom: 50, left: 60 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Clear any existing content inside #line-chart
        const container = d3.select("#line-chart");
        container.html("");

        // Create SVG group
        const svg = container
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .style("display", "block")
            .style("margin", "0 auto")
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Scales
        const xScale = d3.scaleLinear()
            .domain(d3.extent(years))
            .range([0, innerWidth])
            .nice();

        const yMax = d3.max([...allData, ...sailorData, ...notableData]) || 1;
        const yScale = d3.scaleLinear()
            .domain([0, yMax])
            .range([innerHeight, 0])
            .nice();

        // Axes
        const xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d")).ticks(20);
        const yAxis = d3.axisLeft(yScale);

        const xAxisGroup = svg.append("g")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(xAxis)
            .style("color", "white");

        const yAxisGroup = svg.append("g")
            .call(yAxis)
            .style("color", "white");

        // Style axes: thicker lines, bold labels
        svg.selectAll(".domain").attr("stroke-width", 2.5);
        svg.selectAll(".tick line").attr("stroke-width", 1.5);
        svg.selectAll(".tick text")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .style("fill", "white");

        // Axis labels
        svg.append("text")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + 40)
            .attr("text-anchor", "middle")
            .style("fill", "white")
            .style("font-size", "12px")
            .text("Year");

        svg.append("text")
            .attr("x", -90)
            .attr("y", 15)
            .attr("text-anchor", "middle")
            .attr("transform", "rotate(-90)")
            .style("fill", "white")
            .style("font-size", "12px")
            .text("Number of Oceanus Folk songs");

        // Line generator
        const lineGen = d3.line()
            .x((d, i) => xScale(years[i]))
            .y(d => yScale(d))
            .curve(d3.curveMonotoneX);

        // Data series definitions
        const lines = [
            { id: "all", label: "All Oceanus Folk songs", color: "#e377c2", data: allData, visible: true, path: null },
            { id: "sailor", label: "Sailor's Oceanus Folk Songs", color: "#FFD700", data: sailorData, visible: true, path: null },
            { id: "notable", label: "Sailor's notable Oceanus Folk songs", color: "red", data: notableData, visible: true, path: null }
        ];

        // Draw the paths
        lines.forEach(line => {
            line.path = svg.append("path")
                .datum(line.data)
                .attr("fill", "none")
                .attr("stroke", line.color)
                .attr("stroke-width", 3)
                .attr("d", lineGen);
        });

        // Add circles (points) at each data value (only if visible)
        function addPoints() {
            svg.selectAll(".point").remove();
            lines.forEach(line => {
                if (line.visible) {
                    line.data.forEach((value, idx) => {
                        if (value > 0) {
                            svg.append("circle")
                                .attr("class", "point")
                                .attr("cx", xScale(years[idx]))
                                .attr("cy", yScale(value))
                                .attr("r", 4.5)
                                .attr("fill", line.color)
                                .attr("stroke", "none")
                                .attr("data-year", years[idx])
                                .attr("data-value", value)
                                .attr("data-label", line.label);
                        }
                    });
                }
            });
            attachPointEvents();
        }

        // Tooltip for the points
        const tooltip = d3.select("body").append("div")
            .attr("class", "linechart-tooltip")
            .style("position", "absolute")
            .style("background", "rgba(0,0,0,0.9)")
            .style("color", "white")
            .style("padding", "5px 10px")
            .style("border-radius", "8px")
            .style("pointer-events", "none")
            .style("font-size", "12px")
            .style("opacity", 0);

        // Attach hover events to points
        function attachPointEvents() {
            svg.selectAll(".point")
                .on("mouseenter", function(event) {
                    const year = d3.select(this).attr("data-year");
                    const value = d3.select(this).attr("data-value");
                    const label = d3.select(this).attr("data-label");
                    tooltip.html(`<strong>${year}</strong><br>${label}: ${value}`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 25) + "px")
                        .style("opacity", 1);
                })
                .on("mousemove", function(event) {
                    tooltip.style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 25) + "px");
                })
                .on("mouseleave", function() {
                    tooltip.style("opacity", 0);
                });
        }

        // Update line visibility when checkboxes change
        function updateVisibility() {
            lines.forEach(line => {
                line.path.attr("d", line.visible ? lineGen : null);
            });
            addPoints();
        }

        // Initial drawing of points
        addPoints();

        // Add checkbox controls below the chart
        const controlsWrapper = container.append("div")
            .style("display", "flex")
            .style("justify-content", "center")
            .style("width", "100%")
            .style("margin-top", "20px");

        const shiftWrapper = controlsWrapper.append("div")
            .style("padding-left", "30px");   // adjust this value to shift checkboxes right/left

        const innerDiv = shiftWrapper.append("div")
            .style("display", "inline-flex")
            .style("gap", "20px")
            .style("background", "#111")
            .style("padding", "8px 20px")
            .style("border-radius", "40px")
            .style("align-items", "center");

        lines.forEach(line => {
            const label = innerDiv.append("label")
                .style("display", "inline-flex")
                .style("align-items", "center")
                .style("gap", "8px")
                .style("cursor", "pointer")
                .style("color", "white")
                .style("font-size", "14px")
                .style("margin", "0");

            label.append("input")
                .attr("type", "checkbox")
                .attr("checked", true)
                .on("change", function() {
                    line.visible = this.checked;
                    updateVisibility();
                });

            label.append("span")
                .style("display", "inline-block")
                .style("width", "20px")
                .style("height", "3px")
                .style("background", line.color)
                .style("border-radius", "2px");

            label.append("span").text(line.label);
        });
    })
    .catch(error => {
        console.error("Error loading line chart data:", error);
        document.getElementById("line-chart").innerHTML = `<p style='color:red'>Failed to load data: ${error.message}</p>`;
    });