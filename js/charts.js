import { getOrEstimateLSI, getConsecutiveLowCount } from './calculator.js';

let subChartsInstances = [];
let currentChartDays = 0;

const HISTORY_COLUMNS = [
    { id: 'Temp', label: '🌡️ T°', key: 'temp' }, 
    { id: 'Ph', label: '🍋 pH', key: 'ph' },
    { id: 'ChlLibre', label: '✨ Cl. Libre', key: 'chlLibre' }, 
    { id: 'ChlTotal', label: '🔬 Cl. Total', key: 'chlTotal' }, 
    { id: 'Tac', label: '⚖️ TAC', key: 'tac' }, 
    { id: 'Stab', label: '🛡️ Stab', key: 'stab' },
    { id: 'Th', label: '💎 TH', key: 'th' }
];

const CHART_DEFINITIONS = {
    temp: { label: '🌡️ Température (°C)', color: '#f97316', dataKey: 'temp' },
    ph: { label: '🍋 pH', color: '#0284c7', dataKey: 'ph' },
    chlLibre: { label: '✨ Chlore libre', color: '#f59e0b', dataKey: 'chlLibre' },
    chlTotal: { label: '🔬 Chlore total', color: '#d97706', dataKey: 'chlTotal' },
    tac: { label: '⚖️ Alcalinité (TAC)', color: '#10b981', dataKey: 'tac' },
    stab: { label: '🛡️ Stabilisant', color: '#8b5cf6', dataKey: 'stab' },
    th: { label: '💎 Dureté (TH)', color: '#3b82f6', dataKey: 'th' }
};

// --- GESTION DES JAUGUES ET UI ---

export function updateLSIUI(measurements) {
    const cursor = document.getElementById('lsiGaugeCursor');
    const textDisplay = document.getElementById('lsiHeaderValue');
    if (!cursor) return;

    const lsi = getOrEstimateLSI(measurements);
    if (lsi === null || isNaN(lsi)) {
        cursor.style.left = '50%';
        cursor.style.backgroundColor = '#9ca3af';
        if (textDisplay) textDisplay.innerText = "LSI : --";
        return;
    }

    const percent = ((Math.max(-1, Math.min(1, lsi)) + 1) / 2) * 100;
    cursor.style.left = `${percent}%`;
    cursor.style.backgroundColor = lsi < -0.3 ? '#ef4444' : (lsi > 0.3 ? '#f59e0b' : '#10b981');

    if (textDisplay) {
        textDisplay.innerText = `LSI : ${lsi > 0 ? '+' : ''}${lsi.toFixed(2)}`;
    }
}

export function updateBiologicalStatusUI(measurements) {
    const cursor = document.getElementById('bioGaugeCursor');
    const textDisplay = document.getElementById('bioGaugeValue');
    const alertBanner = document.getElementById('biofilmAlertBanner');
    if (!cursor) return;

    const { currentCl, count: consecutiveLowCount } = getConsecutiveLowCount(measurements);
    const historyLength = JSON.parse(localStorage.getItem('spa_history') || '[]').length;

    if (isNaN(currentCl) && historyLength === 0) {
        cursor.style.left = '16.6%';
        cursor.style.backgroundColor = '#9ca3af';
        if (textDisplay) textDisplay.innerText = "Charge bactérienne : Données insuffisantes";
        if (alertBanner) alertBanner.style.display = 'none';
        return;
    }

    if (consecutiveLowCount >= 2 || (currentCl === 0 && consecutiveLowCount >= 1)) {
        cursor.style.left = '83.3%';
        cursor.style.backgroundColor = '#ef4444';
        if (textDisplay) textDisplay.innerText = "Charge bactérienne : ÉLEVÉE (Risque Biofilm)";
        if (alertBanner) alertBanner.style.display = 'block';
    } else if (consecutiveLowCount === 1) {
        cursor.style.left = '50%';
        cursor.style.backgroundColor = '#f59e0b';
        if (textDisplay) textDisplay.innerText = "Charge bactérienne : Vigilance (Sous-dosage récent)";
        if (alertBanner) alertBanner.style.display = 'none';
    } else {
        cursor.style.left = '16.6%';
        cursor.style.backgroundColor = '#10b981';
        if (textDisplay) textDisplay.innerText = "Charge bactérienne : Maîtrisée (Eau Saine)";
        if (alertBanner) alertBanner.style.display = 'none';
    }
}

export function updateGlobalHeaderStatus(measurements) {
    const pillLsi = document.getElementById('statusLSI');
    const valLsi = document.getElementById('valLSI');
    const pillSanitizer = document.getElementById('statusSanitizer');
    const valSanitizer = document.getElementById('valSanitizer');
    if (!pillLsi || !pillSanitizer) return;

    const lsi = getOrEstimateLSI(measurements);
    pillLsi.className = 'status-pill';

    if (lsi === null || isNaN(lsi)) {
        valLsi.innerText = "--";
    } else if (lsi >= -0.3 && lsi <= 0.3) {
        pillLsi.classList.add('status-ok');
        valLsi.innerText = "OK";
    } else {
        pillLsi.classList.add('status-warning');
        valLsi.innerText = lsi < -0.3 ? "Corrosif" : "Entartrant";
    }

    const { currentCl, count: consecutiveLowCount } = getConsecutiveLowCount(measurements);
    const maxTarget = parseFloat(localStorage.getItem('spa_chlLibreTargetMax')) || 4.0;
    const minTarget = parseFloat(localStorage.getItem('spa_chlLibreTargetMin')) || 2.0;
    const historyLength = JSON.parse(localStorage.getItem('spa_history') || '[]').length;

    pillSanitizer.className = 'status-pill';

    if (isNaN(currentCl) && historyLength === 0) {
        valSanitizer.innerText = "--";
    } else if (!isNaN(currentCl) && currentCl > maxTarget) {
        pillSanitizer.classList.add('status-warning');
        valSanitizer.innerText = "Surdosé";
    } else if (consecutiveLowCount >= 2) {
        pillSanitizer.classList.add('status-danger');
        valSanitizer.innerText = "Risque Bio";
    } else if (!isNaN(currentCl) && currentCl < minTarget) {
        pillSanitizer.classList.add('status-warning');
        valSanitizer.innerText = "Bassin Faible";
    } else {
        pillSanitizer.classList.add('status-ok');
        valSanitizer.innerText = "Sain";
    }
}

// --- GESTION DES GRAPHIQUES ET TABLEAUX ---

export function updateChartTimeFilter(days, renderCallback) {
    currentChartDays = days;
    document.querySelectorAll('.btn-filter').forEach(btn => {
        const isActive = btn.id === `filter-${days}`;
        btn.style.background = isActive ? 'var(--primary)' : 'var(--border)';
        btn.style.color = isActive ? 'white' : 'var(--text)';
    });
    
    renderCallback?.();
}

export function renderHistoryTable() {
    const headerRow = document.getElementById('historyTableHeader');
    const tbody = document.querySelector('#historyTable tbody');
    const paginationEl = document.getElementById('measuresPagination');
    const indicatorEl = document.getElementById('measuresPageIndicator');
    if (!headerRow || !tbody) return;

    const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
    const activeCols = HISTORY_COLUMNS.filter(c => localStorage.getItem(`spa_enable${c.id}`) !== 'false');

    headerRow.innerHTML = `<th>Date</th>${activeCols.map(c => `<th>${c.label}</th>`).join('')}<th>📝</th>`;

    const itemsPerPage = 5;
    const totalPages = Math.max(1, Math.ceil(history.length / itemsPerPage));
    
    window.currentMeasuresPage = Math.max(1, Math.min(window.currentMeasuresPage || 1, totalPages));
    const startIndex = (window.currentMeasuresPage - 1) * itemsPerPage;
    const paginatedHistory = history.slice(startIndex, startIndex + itemsPerPage);

    tbody.innerHTML = paginatedHistory.map(item => `
        <tr>
            <td>${item.date}</td>
            ${activeCols.map(c => `<td>${item[c.key] ?? '-'}</td>`).join('')}
            <td>${item.note ? `<span title="${item.note}">🚩</span>` : '-'}</td>
        </tr>
    `).join('');

    if (paginationEl && indicatorEl) {
        const showPagination = history.length > itemsPerPage;
        paginationEl.style.display = showPagination ? 'flex' : 'none';
        if (showPagination) indicatorEl.textContent = `Page ${window.currentMeasuresPage}/${totalPages}`;
    }
}

export function wipeHistoryData(callback) {
    if (confirm("Attention : cela effacera tout l'historique des mesures.")) {
        localStorage.removeItem('spa_history');
        renderHistoryTable();
        renderMultiMetricsCharts();
        callback?.();
    }
}

export function renderMultiMetricsCharts() {
    const container = document.querySelector('.chart-container');
    if (!container) return;

    const checkboxes = document.querySelectorAll('#chartSelectors input[type="checkbox"]');
    
    checkboxes.forEach(chk => {
        const isEnabled = localStorage.getItem(`spa_enable${chk.value.charAt(0).toUpperCase() + chk.value.slice(1)}`) !== 'false';
        const parentLabel = chk.closest('label') || chk.parentElement;
        if (parentLabel) parentLabel.style.display = isEnabled ? 'inline-flex' : 'none';
        if (!isEnabled) chk.checked = false;
    });

    subChartsInstances.forEach(instance => instance?.destroy?.());
    subChartsInstances = [];
    container.innerHTML = '';

    let history = JSON.parse(localStorage.getItem('spa_history') || '[]').slice().reverse();
    
    if (currentChartDays > 0) {
        const cutoffTime = Date.now() - (currentChartDays * 86400000);
        history = history.filter(h => new Date(h.date).getTime() >= cutoffTime);
    }

    const labels = history.map(h => h.date);
    const isDarkMode = document.body.classList.contains('dark-mode');
    const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
    const textColor = isDarkMode ? '#94a3b8' : '#64748b';

    const activeDefs = Array.from(checkboxes)
        .filter(chk => chk.checked && CHART_DEFINITIONS[chk.value])
        .map(chk => CHART_DEFINITIONS[chk.value]);

    if (activeDefs.length === 0) {
        container.style.height = 'auto';
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px;">Aucun paramètre sélectionné.</p>`;
        return;
    }

    container.style.height = `${activeDefs.length * 150}px`;

    activeDefs.forEach((def, index) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position: relative; width: 100%; height: 140px; margin-bottom: 10px;';
        
        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        const data = history.map(h => (h[def.dataKey] !== '' && h[def.dataKey] !== undefined) ? h[def.dataKey] : null);
        const pointRadii = history.map(h => h.note ? 6 : 3);
        const pointColors = history.map(h => h.note ? '#ffffff' : def.color);

        const chartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: def.label,
                    data,
                    borderColor: def.color,
                    backgroundColor: `${def.color}1a`,
                    pointBackgroundColor: pointColors,
                    pointRadius: pointRadii,
                    fill: true,
                    tension: 0.3,
                    spanGaps: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: true, 
                        position: 'top', 
                        labels: { color: textColor, font: { size: 11 }, boxWidth: 10 } 
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = `${context.dataset.label}: ${context.parsed.y}`;
                                const note = history[context.dataIndex]?.note;
                                if (note) label += ` | 📝 Note: ${note}`;
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        display: index === activeDefs.length - 1, 
                        ticks: { color: textColor, font: { size: 9 } }, 
                        grid: { color: gridColor } 
                    },
                    y: { 
                        ticks: { color: textColor, font: { size: 9 } }, 
                        grid: { color: gridColor } 
                    }
                }
            }
        });

        subChartsInstances.push(chartInstance);
    });
}