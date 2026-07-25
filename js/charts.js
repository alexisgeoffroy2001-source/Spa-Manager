let subChartsInstances = [];
let currentChartDays = 0;

export function setChartFilter(days, renderCallback) {
    currentChartDays = days;
    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.style.background = 'var(--border)';
        btn.style.color = 'var(--text)';
    });
    
    const activeBtn = document.getElementById(`filter-${days}`);
    if (activeBtn) {
        activeBtn.style.background = 'var(--primary)';
        activeBtn.style.color = 'white';
    }
    
    if (renderCallback) renderCallback();
}

export function renderHistory() {
    const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
    const headerRow = document.getElementById('historyTableHeader');
    const tbody = document.querySelector('#historyTable tbody');
    if (!headerRow || !tbody) return;
    
    const cols = [
        { id: 'Temp', label: '🌡️ T°' }, 
        { id: 'Ph', label: '🧪 pH' },
        { id: 'ChlLibre', label: '✨ Cl. Libre' }, 
        { id: 'ChlTotal', label: '🧪 Cl. Total' }, 
        { id: 'Tac', label: '⚖️ TAC' }, 
        { id: 'Stab', label: '🛡️ Stab' },
        { id: 'Th', label: '💎 TH' }
    ];

    let headerHTML = '<th>Date</th>';
    cols.forEach(c => { 
        if (localStorage.getItem(`spa_enable${c.id}`) !== 'false') {
            headerHTML += `<th>${c.label}</th>`;
        } 
    });
    headerHTML += '<th>📝</th>';
    headerRow.innerHTML = headerHTML;

    const rowsHTML = history.slice(0, 10).map(item => {
        let row = `<tr><td>${item.date}</td>`;
        if (localStorage.getItem('spa_enableTemp') !== 'false') row += `<td>${item.temp ?? '-'}</td>`;
        if (localStorage.getItem('spa_enablePh') !== 'false') row += `<td>${item.ph ?? '-'}</td>`;
        if (localStorage.getItem('spa_enableChlLibre') !== 'false') row += `<td>${item.chlLibre ?? '-'}</td>`;
        if (localStorage.getItem('spa_enableChlTotal') !== 'false') row += `<td>${item.chlTotal ?? '-'}</td>`;
        if (localStorage.getItem('spa_enableTac') !== 'false') row += `<td>${item.tac ?? '-'}</td>`;
        if (localStorage.getItem('spa_enableStab') !== 'false') row += `<td>${item.stab ?? '-'}</td>`;
        if (localStorage.getItem('spa_enableTh') !== 'false') row += `<td>${item.th ?? '-'}</td>`;
        row += `<td>${item.note ? `<span title="${item.note}">🚩</span>` : '-'}</td></tr>`;
        return row;
    }).join('');

    tbody.innerHTML = rowsHTML;
}

export function clearHistory(callback) {
    if (confirm("Attention : cela effacera tout l'historique des mesures.")) {
        localStorage.removeItem('spa_history');
        renderHistory();
        renderSingleChart();
        if (callback) callback();
    }
}

export function renderSingleChart() {
    const container = document.querySelector('.chart-container');
    if (!container) return;

    // --- FILTRAGE DYNAMIQUE DES OPTIONS DE SÉLECTION ---
    const paramKeyMap = {
        temp: 'spa_enableTemp',
        ph: 'spa_enablePh',
        chlLibre: 'spa_enableChlLibre',
        chlTotal: 'spa_enableChlTotal',
        tac: 'spa_enableTac',
        stab: 'spa_enableStab',
        th: 'spa_enableTh'
    };

    const checkboxes = document.querySelectorAll('#chartSelectors input[type="checkbox"]');
    checkboxes.forEach(chk => {
        const localStorageKey = paramKeyMap[chk.value];
        const isEnabled = localStorageKey ? localStorage.getItem(localStorageKey) !== 'false' : true;
        
        // On masque le conteneur parent (label ou bouton) si la mesure n'est pas activée
        const parentLabel = chk.closest('label') || chk.parentElement;
        if (parentLabel) {
            parentLabel.style.display = isEnabled ? 'inline-flex' : 'none';
        }

        // Si le paramètre est désactivé dans les réglages, on le décoche
        if (!isEnabled) {
            chk.checked = false;
        }
    });

    // Nettoyage complet des anciennes instances Chart.js
    subChartsInstances.forEach(instance => {
        if (instance && typeof instance.destroy === 'function') {
            instance.destroy();
        }
    });
    subChartsInstances = [];
    container.innerHTML = '';

    let history = JSON.parse(localStorage.getItem('spa_history') || '[]').slice().reverse();
    
    if (currentChartDays > 0) {
        const cutoffTime = new Date().getTime() - (currentChartDays * 24 * 60 * 60 * 1000);
        history = history.filter(h => new Date(h.date).getTime() >= cutoffTime);
    }

    const labels = history.map(h => h.date);
    const isDarkMode = document.body.classList.contains('dark-mode');
    const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
    const textColor = isDarkMode ? '#94a3b8' : '#64748b';

    const definitions = {
        temp: { label: '🌡️ Température (°C)', color: '#f97316', dataKey: 'temp' },
        ph: { label: '🧪 pH', color: '#0284c7', dataKey: 'ph' },
        chlLibre: { label: '✨ Chlore libre', color: '#f59e0b', dataKey: 'chlLibre' },
        chlTotal: { label: '🧪 Chlore total', color: '#d97706', dataKey: 'chlTotal' },
        tac: { label: '⚖️ Alcalinité (TAC)', color: '#10b981', dataKey: 'tac' },
        stab: { label: '🛡️ Stabilisant', color: '#8b5cf6', dataKey: 'stab' },
        th: { label: '💎 Dureté (TH)', color: '#3b82f6', dataKey: 'th' }
    };
    
    const activeDefs = [];
    checkboxes.forEach(chk => {
        if (chk.checked && definitions[chk.value]) {
            activeDefs.push(definitions[chk.value]);
        }
    });

    if (activeDefs.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px;">Aucun paramètre sélectionné.</p>`;
        return;
    }

    // Hauteur dynamique du conteneur en fonction du nombre de graphiques empilés
    container.style.height = `${activeDefs.length * 150}px`;

    activeDefs.forEach((def, index) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `position: relative; width: 100%; height: 140px; margin-bottom: 10px;`;
        
        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        const data = history.map(h => (h[def.dataKey] !== '' && h[def.dataKey] !== undefined) ? h[def.dataKey] : null);
        
        // Points plus gros pour les entrées avec une note
        const pointRadii = history.map(h => h.note ? 6 : 3);
        const pointColors = history.map(h => h.note ? '#ffffff' : def.color);

        const chartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: def.label,
                    data: data,
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
                                if (note) { 
                                    label += ` | 📝 Note: ${note}`; 
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        display: index === activeDefs.length - 1, // Visible seulement sur le dernier graphique en bas
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