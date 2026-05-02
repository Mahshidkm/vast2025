// tabs.js – handles dynamic tab switching (Network / Trends / Sankey)
document.addEventListener('DOMContentLoaded', () => {
    const tabNetwork = document.getElementById('tab-network');
    const tabTrends = document.getElementById('tab-trends');
    const tabSankey = document.getElementById('tab-sankey');
    
    const networkView = document.getElementById('network-view');
    const trendsView = document.getElementById('trends-view');
    const sankeyView = document.getElementById('sankey-view');
    
    // Elements to hide/show when switching tabs
    const mainTitle = document.querySelector('.header-row h1');
    const sliderControls = document.querySelector('.controls');
    const tabsContainer = document.querySelector('.tabs');

    let trendsLoaded = false;
    let sankeyLoaded = false;

    // Helper functions
    function hideAllViews() {
        const views = [networkView, trendsView, sankeyView];
        views.forEach(view => {
            if (view) {
                view.classList.remove('active-view');
                view.style.display = 'none';
            }
        });
    }

    function showView(view) {
        if (!view) return;
        view.classList.add('active-view');
        view.style.display = view.id === 'network-view' ? 'flex' : 'block';
    }

    // Load Oceanus Trends content dynamically
    function loadTrends() {
        if (trendsLoaded) return;
        
        fetch('pages/oceanus_trends.html?t=' + Date.now())
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const loadedContainer = doc.querySelector('.container');

                if (!loadedContainer) {
                    trendsView.innerHTML = '<p style="color:red">Error: Could not find chart container in loaded page.</p>';
                    return;
                }

                const clonedContainer = loadedContainer.cloneNode(true);
                const backBtn = clonedContainer.querySelector('button');
                if (backBtn && backBtn.textContent.includes('Back')) backBtn.remove();
                
                const scripts = clonedContainer.querySelectorAll('script');
                scripts.forEach(script => script.remove());
                
                const wrapper = document.createElement('div');
                wrapper.className = 'linechart-page';
                wrapper.style.width = '100%';
                wrapper.style.overflow = 'visible';
                wrapper.appendChild(clonedContainer);
                
                trendsView.innerHTML = '';
                trendsView.appendChild(wrapper);

                const script = document.createElement('script');
                script.src = 'js/linechart.js?t=' + Date.now();
                script.onload = () => console.log('✅ Trends chart loaded');
                script.onerror = () => console.error('❌ Failed to load linechart.js');
                document.body.appendChild(script);

                trendsLoaded = true;
                console.log('📈 Oceanus Trends loaded successfully');
            })
            .catch(error => {
                console.error('❌ Error loading trends page:', error);
                trendsView.innerHTML = `<p style="color:red">Failed to load Oceanus Trends. Error: ${error.message}</p>`;
            });
    }

    // Load Sankey diagram content
    function loadSankey() {
        if (sankeyLoaded) return;
        
        if (typeof d3.sankey === 'undefined') {
            const sankeyLib = document.createElement('script');
            sankeyLib.src = 'https://cdn.jsdelivr.net/npm/d3-sankey@0.12.3/dist/d3-sankey.min.js';
            sankeyLib.onload = () => console.log('✅ d3-sankey library loaded');
            document.head.appendChild(sankeyLib);
        }
        
        fetch('pages/genres_and_artists_influenced_by.html?t=' + Date.now())
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const loadedContainer = doc.querySelector('.container');

                if (!loadedContainer) {
                    sankeyView.innerHTML = '<p style="color:red">Error: Could not find container in loaded page.</p>';
                    return;
                }

                const clonedContainer = loadedContainer.cloneNode(true);
                const scripts = clonedContainer.querySelectorAll('script');
                scripts.forEach(script => script.remove());
                
                sankeyView.innerHTML = '';
                sankeyView.appendChild(clonedContainer);

                const script = document.createElement('script');
                script.src = 'js/sankey.js?t=' + Date.now();
                script.onload = () => console.log('✅ Sankey diagram loaded');
                script.onerror = () => console.error('❌ Failed to load sankey.js');
                document.body.appendChild(script);

                sankeyLoaded = true;
                console.log('📊 Sankey diagram loaded successfully');
            })
            .catch(error => {
                console.error('❌ Error loading sankey page:', error);
                sankeyView.innerHTML = `<p style="color:red">Failed to load Sankey diagram. Error: ${error.message}</p>`;
            });
    }

    // Tab switching functions
    function showNetwork() {
        hideAllViews();
        showView(networkView);
        if (mainTitle) mainTitle.style.display = 'block';
        if (sliderControls) sliderControls.style.display = 'flex';
        tabNetwork.classList.add('active');
        tabTrends.classList.remove('active');
        tabSankey.classList.remove('active');
        window.dispatchEvent(new Event('resize'));   // trigger re‑layout
        console.log('🌐 Switched to Network View');
    }

    function showTrends() {
        hideAllViews();
        showView(trendsView);
        if (mainTitle) mainTitle.style.display = 'none';
        if (sliderControls) sliderControls.style.display = 'none';
        tabTrends.classList.add('active');
        tabNetwork.classList.remove('active');
        tabSankey.classList.remove('active');
        if (!trendsLoaded) loadTrends();
        console.log('📈 Switched to Trends View');
    }

    function showSankey() {
        hideAllViews();
        showView(sankeyView);
        if (mainTitle) mainTitle.style.display = 'none';
        if (sliderControls) sliderControls.style.display = 'none';
        tabSankey.classList.add('active');
        tabNetwork.classList.remove('active');
        tabTrends.classList.remove('active');
        if (!sankeyLoaded) loadSankey();
        console.log('📊 Switched to Sankey View');
    }

    // Attach event listeners
    if (tabNetwork) tabNetwork.addEventListener('click', showNetwork);
    if (tabTrends) tabTrends.addEventListener('click', showTrends);
    if (tabSankey) tabSankey.addEventListener('click', showSankey);

    // Start with network view
    showNetwork();
});