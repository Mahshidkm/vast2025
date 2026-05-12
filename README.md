# Sailor’s Musical Network – Oceanus Folk Data Visualization(VAST2025,Mini-Challenge 1)

**Live demo:** [https://mahshidkm.github.io/vast2025/](https://mahshidkm.github.io/vast2025/)
An interactive web application that visualizes the influence, collaboration, and evolution of the fictional **Oceanus Folk** music genre. The project uses **D3.js** and **Plotly** to create a multi‑view dashboard that lets users explore artists, their relationships, and genre trends over time.

## 🎯 Key Features

- **Circular Network** – Shows Sailor (centre), influencers (purple), collaborators (blue), and nfluenced artists (red).  
  - Circle size reflects cumulative score.  
  - Hover for detailed tooltips.  
  - Year slider fades artists who were not yet active.

- **Cumulative Line Chart (Right Panel)** – Displays the total number of Oceanus Folk works produced by all Sailor's collaborators over time.  
  - Hover over a **blue collaborator** circle to switch to that artist’s individual, non‑cumulative line chart.  
  - A yellow dashed line marks the start of Sailor’s career (or the artist’s first collaboration).

- **Tabbed Views** – Switch between:
  - **Network View** (main visualisation)
  - **Oceanus Folk Trends** – three lines (all works, Sailor’s works, Sailor’s notable works) with toggle checkboxes.
  - **Genre & Artist Influence** – Sankey diagram showing how Oceanus Folk influenced other genres and artists.

- **Superstar Predictor** – Parallel coordinates plot allowing users to adjust factor weights and rank artists by a custom “superstar score”.  
  - Factors include total Oceanus works, notable works, role counts, recent activity (last 5 years), etc.  
  - Select up to three artists to compare their profiles.

## 📁 Project Structure
```
├── index.html # Main entry point – network view + tabs
├── css/
│ ├── style.css
│ ├── linechart.css 
│ └── sankey.css 
  └── superstar_predictor.css 
├── js/
│ ├── viz.js # Network + cumulative/individual line charts
│ ├── tabs.js # Dynamic tab switching (loads HTML fragments)
│ ├── linechart.js # Standalone line chart for the Trends tab
│ ├── sankey.js # Sankey diagram for the influence page
│ └── superstar_predictor.js # Superstar predictor (Plotly parallel coordinates)
├── data/
│ ├── data_task1-1.json # Left side (influencers) – links & scores
│ ├── data_task1-2.json # Right side (collaborators & influenced)
│ ├── data_task1-3.json # Additional metadata (not used directly)
│ ├── collaborator_yearly.json# Per‑collaborator yearly Oceanus counts
│ ├── oceanus_trends.json # Yearly aggregates (all, Sailor, notable)
│ ├── artist_career.json # Full career data for the predictor
│ └── data_task2-2.json # the first two sankey diagrams
  └── influence_to_oceanus_sankey.json # third sankey diagram
└── pages/ # Secondary pages loaded via tabs
| ├── oceanus_trends.html # HTML fragment for the Trends tab
| ├── genres_and_artists_influenced_by.html # Sankey container
| └── superstar_predictor.html # Standalone predictor page
| └── artist_career.html
 ``` 
## 🛠️ How to Run Locally

1. **Clone the repository**  
   ```bash
   git clone https://github.com/Mahshidkm/vast2025.git
   cd vast2025
2. Serve the files – because of JavaScript modules and fetch requests, you need a local web server.
   python -m http.server 8080
3. Open your browser and go to http://localhost:8080 (or the port you used).
4. **Explore** – use the year slider, hover over circles, switch tabs, and adjust weights in the predictor.
