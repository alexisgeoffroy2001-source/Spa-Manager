export const productTypes = [
    { id: 'ph_minus', name: 'pH -' },
    { id: 'ph_plus', name: 'pH +' },
    { id: 'tac_plus', name: 'TAC +' },
    { id: 'chlore_choc', name: 'Chlore Choc' },
    { id: 'brome', name: 'Brome' },
    { id: 'oxygene', name: 'Oxygène Actif' },
    { id: 'salt_electrolysis', name: 'Sel / ⚡ Électrolyseur' }
];

const DEFAULT_RANGES = {
    ph: { min: 7.2, max: 7.6 },
    tac: { min: 80, max: 120 },
    chlLibre: { min: 2.0, max: 4.0 },
    chlTotal: { min: 2.0, max: 4.5 },
    stab: { min: 20, max: 50 },
    th: { min: 150, max: 250 }
};

export function toggleTargetVisibility() {
    ['Ph', 'ChlLibre', 'ChlTotal', 'Tac', 'Stab', 'Th'].forEach(param => {
        const el = document.getElementById(`target${param}Container`);
        const chk = document.getElementById(`enable${param}`);
        if (el && chk) el.style.display = chk.checked ? 'block' : 'none';
    });
}

export function toggleDisinfectantOptions() {
    const disinfectant = document.getElementById('disinfectantType')?.value;
    const container = document.getElementById('dynamicProductsList');
    if (!container) return;

    const saltCard = Array.from(container.querySelectorAll('.product-config-box')).find(box => 
        box.querySelector('.prod-type')?.value === 'salt_electrolysis'
    );

    if (disinfectant === 'sel' && !saltCard) {
        addNewProductRow({ type: 'salt_electrolysis', m: 500, d: 1.0, v: 2.0, stock: 0, unit: 'g' });
        window.spaApp?.saveTargets?.();
    } else if (disinfectant !== 'sel' && saltCard) {
        saltCard.remove();
        window.spaApp?.saveTargets?.();
    }
}

function updateSingleCardStockStatus(cardElement) {
    if (!cardElement) return;

    const type = cardElement.querySelector('.prod-type')?.value;
    const m = parseFloat(cardElement.querySelector('.prod-m')?.value) || 0;
    const d = parseFloat(cardElement.querySelector('.prod-d')?.value) || 1;
    const v = parseFloat(cardElement.querySelector('.prod-v')?.value) || 1;
    const currentStock = parseFloat(cardElement.querySelector('.prod-stock')?.value) || 0;
    const unit = cardElement.querySelector('.prod-unit')?.value || 'g';
    const spaVol = parseFloat(localStorage.getItem('spa_vol')) || 1.5;

    let referenceDelta = (type === 'tac_plus') ? 20 : (['chlore_choc', 'brome', 'oxygene'].includes(type) ? 2.0 : 0.3);

    let singleDose = 0;
    if (m > 0 && d > 0 && v > 0) {
        singleDose = (m / (d * v)) * referenceDelta * spaVol;
    }

    if (['unit', 'bag'].includes(unit)) {
        singleDose = Math.max(1, Math.round(singleDose / m));
    }

    let alertThreshold = singleDose * 3;
    if (unit === 'kg') alertThreshold /= 1000;

    cardElement.classList.remove('stock-warning', 'out-of-stock');
    if (currentStock <= 0) {
        cardElement.classList.add('out-of-stock');
    } else if (currentStock <= alertThreshold) {
        cardElement.classList.add('stock-warning');
    }
}

export function addNewProductRow(data = null) {
    const container = document.getElementById('dynamicProductsList');
    if (!container) return;

    const typeVal = data?.type || 'ph_minus';
    const mVal = data?.m ?? 500;   
    const dVal = data?.d ?? 1;     
    const vVal = data?.v ?? 2;     
    const stockVal = data?.stock ?? 1000;
    const initialStockVal = data?.initialStock || stockVal;
    const unitVal = data?.unit || (typeVal === 'salt_electrolysis' ? 'kg' : 'g');

    const optionsHTML = productTypes.map(pt => 
        `<option value="${pt.id}" ${typeVal === pt.id ? 'selected' : ''}>${pt.name}</option>`
    ).join('');

    const rowDiv = document.createElement('div');
    rowDiv.className = 'product-config-box';
    rowDiv.dataset.initialStock = initialStockVal;

    const isElectrolysis = typeVal === 'salt_electrolysis';

    rowDiv.innerHTML = `
        <div class="product-row-flex product-row-spaced">
            <select class="prod-type product-type-select" onchange="window.spaApp.onProductTypeChange(this)">${optionsHTML}</select>
            <button type="button" class="btn-danger product-delete-btn" onclick="this.closest('.product-config-box').remove(); window.spaApp.saveTargets();">❌ Supprimer</button>
        </div>
        <div class="product-row-flex product-row-gap">
            <div class="form-group product-input-group">
                <label class="lbl-m product-input-label">${isElectrolysis ? 'Sel (g)' : 'Dose (g)'}</label>
                <input type="number" inputmode="decimal" class="prod-m" value="${mVal}" step="10" oninput="window.spaApp.saveTargets()">
            </div>
            <div class="form-group product-input-group">
                <label class="lbl-d product-input-label">${isElectrolysis ? 'Delta (ppm)' : 'Delta'}</label>
                <input type="number" inputmode="decimal" class="prod-d" value="${dVal}" step="0.1" oninput="window.spaApp.saveTargets()">
            </div>
            <div class="form-group product-input-group">
                <label class="lbl-v product-input-label">${isElectrolysis ? 'Temps (h)' : 'Vol. (m³)'}</label>
                <input type="number" inputmode="decimal" class="prod-v" value="${vVal}" step="0.5" oninput="window.spaApp.saveTargets()">
            </div>
        </div>
        <div class="stock-container">
            <div class="form-group product-stock-group">
                <label class="product-input-label">📦 Stock restant</label>
                <input type="number" inputmode="decimal" class="prod-stock" value="${stockVal}" step="0.1" oninput="window.spaApp.saveTargets()">
            </div>
            <div class="form-group product-unit-group">
                <label class="product-input-label">Unité</label>
                <select class="prod-unit product-unit-select" onchange="window.spaApp.saveTargets()">
                    <option value="g" ${unitVal === 'g' ? 'selected' : ''}>Grammes (g)</option>
                    <option value="kg" ${unitVal === 'kg' ? 'selected' : ''}>Kilogrammes (kg)</option>
                    <option value="tablet" ${unitVal === 'tablet' ? 'selected' : ''}>Pastilles</option>
                </select>
            </div>
        </div>
    `;
    container.appendChild(rowDiv);
}

export function onProductTypeChange(selectElem) {
    const card = selectElem.closest('.product-config-box');
    if (!card) return;

    const isElectrolysis = selectElem.value === 'salt_electrolysis';
    card.querySelector('.lbl-m').textContent = isElectrolysis ? 'Sel (g)' : 'Dose (g/unit)';
    card.querySelector('.lbl-d').textContent = isElectrolysis ? 'Delta (ppm)' : 'Delta';
    card.querySelector('.lbl-v').textContent = isElectrolysis ? 'Temps (h)' : 'Vol. (m³)';
    
    const unitSelect = card.querySelector('.prod-unit');
    if (unitSelect && isElectrolysis && unitSelect.value === 'g') {
        unitSelect.value = 'kg';
    }

    window.spaApp?.saveTargets?.();
}

export function loadTargets() {
    const vol = document.getElementById('vol');
    if (vol) vol.value = localStorage.getItem('spa_vol') || 1.5;
    
    const dis = document.getElementById('disinfectantType');
    if (dis) dis.value = localStorage.getItem('spa_disinfectant') || 'chlore';

    toggleDisinfectantOptions();

    ['Temp', 'Ph', 'ChlLibre', 'ChlTotal', 'Tac', 'Stab', 'Th'].forEach(param => {
        const checkbox = document.getElementById(`enable${param}`);
        if (checkbox) checkbox.checked = localStorage.getItem(`spa_enable${param}`) !== 'false';
    });

    ['ph', 'tac', 'chlLibre', 'chlTotal', 'stab', 'th'].forEach(param => {
        const minEl = document.getElementById(`${param}TargetMin`);
        const maxEl = document.getElementById(`${param}TargetMax`);
        if (minEl) minEl.value = localStorage.getItem(`spa_${param}TargetMin`) ?? DEFAULT_RANGES[param]?.min ?? '';
        if (maxEl) maxEl.value = localStorage.getItem(`spa_${param}TargetMax`) ?? DEFAULT_RANGES[param]?.max ?? '';
    });

    const container = document.getElementById('dynamicProductsList');
    if (container) {
        container.innerHTML = '';
        const savedProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || 'null');
        
        if (savedProducts?.length > 0) {
            savedProducts.forEach(p => addNewProductRow(p));
        } else {
            [
                { type: 'ph_minus', m: 15, d: 0.1, v: 1 },
                { type: 'ph_plus', m: 15, d: 0.1, v: 1 },
                { type: 'tac_plus', m: 18, d: 10, v: 1 },
                { type: 'chlore_choc', m: 2, d: 1, v: 1 }
            ].forEach(p => addNewProductRow(p));
        }
    }

    toggleTargetVisibility();
    renderInventory();
}

export function saveTargets() {
    const vol = document.getElementById('vol');
    if (vol) localStorage.setItem('spa_vol', vol.value);
    const dis = document.getElementById('disinfectantType');
    if (dis) localStorage.setItem('spa_disinfectant', dis.value);

    ['Temp', 'Ph', 'ChlLibre', 'ChlTotal', 'Tac', 'Stab', 'Th'].forEach(param => {
        const checkbox = document.getElementById(`enable${param}`);
        if (checkbox) localStorage.setItem(`spa_enable${param}`, checkbox.checked);
    });

    ['ph', 'tac', 'chlLibre', 'chlTotal', 'stab', 'th'].forEach(param => {
        const minEl = document.getElementById(`${param}TargetMin`);
        const maxEl = document.getElementById(`${param}TargetMax`);
        if (minEl) localStorage.setItem(`spa_${param}TargetMin`, minEl.value);
        if (maxEl) localStorage.setItem(`spa_${param}TargetMax`, maxEl.value);
    });

    const productBoxes = document.querySelectorAll('#dynamicProductsList .product-config-box');
    const existingProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');
    const productsArray = Array.from(productBoxes).map(box => {
        const type = box.querySelector('.prod-type').value;
        const currentStock = parseFloat(box.querySelector('.prod-stock')?.value) || 0;
        const previousProduct = existingProducts.find(p => p.type === type);
        
        return {
            type,
            m: parseFloat(box.querySelector('.prod-m').value) || 0,
            d: parseFloat(box.querySelector('.prod-d').value) || 1,
            v: parseFloat(box.querySelector('.prod-v').value) || 1,
            stock: currentStock,
            initialStock: previousProduct?.initialStock || currentStock || 1000,
            unit: box.querySelector('.prod-unit')?.value || 'g'
        };
    });

    localStorage.setItem('spa_dynamic_products', JSON.stringify(productsArray));
    renderInventory();
}

export function buildDynamicMeasuresForm() {
    const grid = document.getElementById('measuresFormGrid');
    if (!grid) return;
    
    const fields = [
        { key: 'Temp', id: 'tempVal', label: '🌡️ Température (°C)', full: true, step: 0.5 },
        { key: 'Ph', id: 'phVal', label: '🧪 pH', step: 0.1 },
        { key: 'ChlLibre', id: 'chlLibreVal', label: '✨ Chlore libre (ppm)', step: 0.1 },
        { key: 'ChlTotal', id: 'chlTotalVal', label: '🧪 Chlore total (ppm)', step: 0.1 },
        { key: 'Tac', id: 'tacVal', label: '⚖️ Alcalinité (TAC)', step: 5 },
        { key: 'Stab', id: 'stabVal', label: '🛡️ Stabilisant (ppm)', step: 5 },
        { key: 'Th', id: 'thVal', label: '💎 Dureté (TH)', step: 10 }
    ];

    grid.innerHTML = fields
        .filter(f => localStorage.getItem(`spa_enable${f.key}`) !== 'false')
        .map(f => `<div class="form-group ${f.full ? 'full-width' : ''}"><label for="${f.id}">${f.label}</label><input type="number" inputmode="decimal" id="${f.id}" step="${f.step}"></div>`)
        .join('');

    grid.oninput = () => {
        const measurements = {
            temp: parseFloat(document.getElementById('tempVal')?.value),
            ph: parseFloat(document.getElementById('phVal')?.value),
            chlLibre: parseFloat(document.getElementById('chlLibreVal')?.value),
            chlTotal: parseFloat(document.getElementById('chlTotalVal')?.value),
            tac: parseFloat(document.getElementById('tacVal')?.value),
            stab: parseFloat(document.getElementById('stabVal')?.value),
            th: parseFloat(document.getElementById('thVal')?.value)
        };
        updateLSIUI(measurements);
        updateGlobalHeaderStatus(measurements);
    };
}

export function computeDose(productType, diff) {
    const savedProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');
    const product = savedProducts.find(p => p.type === productType);
    
    if (!product || product.m <= 0 || product.d <= 0 || product.v <= 0) return { value: 0, unit: 'g' };
    
    const spaVol = parseFloat(localStorage.getItem('spa_vol')) || 1.5;
    const rawDose = (product.m / (product.d * product.v)) * diff * spaVol;

    if (['unit', 'tablet'].includes(product.unit)) {
        return { value: Math.max(1, Math.round(rawDose / product.m)), unit: 'tablet' };
    }
    if (product.unit === 'kg' && rawDose >= 1000) {
        return { value: Math.round((rawDose / 1000) * 100) / 100, unit: 'kg' };
    }

    return { value: Math.round(rawDose), unit: 'g' };
}

export function renderInventory() {
    document.querySelectorAll('#dynamicProductsList .product-config-box').forEach(updateSingleCardStockStatus);
}

export function calculateLSI(ph, tempC, tac, th, tds = 1000) {
    if ([ph, tempC, tac, th].some(isNaN)) return null;

    const tf = (tempC * 0.0123) + 0.5;
    const cf = Math.log10(Math.max(th, 1)) - 0.4;
    const af = Math.log10(Math.max(tac, 1));
    const tdsFactor = tds >= 1000 ? 12.2 : 12.1;

    return Math.round((ph + tf + cf + af - tdsFactor) * 100) / 100;
}

export function getOrEstimateLSI(measurements) {
    if (!measurements?.ph || !measurements?.tac) return null;
    return calculateLSI(
        parseFloat(measurements.ph),
        measurements.temp ? parseFloat(measurements.temp) : 37,
        parseFloat(measurements.tac),
        measurements.th ? parseFloat(measurements.th) : 200
    );
}

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

function getConsecutiveLowCount(measurements) {
    const currentCl = parseFloat(measurements?.chlLibre ?? measurements?.chlorine ?? measurements?.bromine);
    const minTarget = parseFloat(localStorage.getItem('spa_chlLibreTargetMin')) || 2.0;
    const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
    
    let count = (!isNaN(currentCl) && currentCl < minTarget) ? 1 : 0;
    for (const log of history.slice(0, 3)) {
        const pastCl = parseFloat(log.chlLibre);
        if (!isNaN(pastCl)) {
            if (pastCl < minTarget) count++;
            else break;
        }
    }
    return { currentCl, count };
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