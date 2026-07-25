export const productTypes = [
    { id: 'ph_minus', name: 'pH Moins (g)' },
    { id: 'ph_plus', name: 'pH Plus (g)' },
    { id: 'tac_plus', name: 'TAC Plus (g)' },
    { id: 'chlore_choc', name: 'Chlore Choc (g)' },
    { id: 'brome', name: 'Brome (g)' },
    { id: 'oxygene', name: 'Oxygène Actif (g)' },
    { id: 'salt_electrolysis', name: 'Sel / ⚡ Électrolyseur' }
];

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

    const saltCard = Array.from(container.querySelectorAll('.product-config-box')).find(box => {
        const select = box.querySelector('.prod-type');
        return select && select.value === 'salt_electrolysis';
    });

    if (disinfectant === 'sel') {
        if (!saltCard) {
            addNewProductRow({
                type: 'salt_electrolysis',
                m: 500,  
                d: 1.0,  
                v: 2.0,  
                stock: 0,
                unit: 'g'
            });
            
            if (window.spaApp?.saveTargets) {
                window.spaApp.saveTargets();
            }
        }
    } else {
        if (saltCard) {
            saltCard.remove();
            if (window.spaApp?.saveTargets) {
                window.spaApp.saveTargets();
            }
        }
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

    let referenceDelta = 0.3;
    if (type === 'tac_plus') {
        referenceDelta = 20;
    } else if (['chlore_choc', 'brome', 'oxygene'].includes(type)) {
        referenceDelta = 2.0;
    }

    let singleDose = 0;
    if (m > 0 && d > 0 && v > 0) {
        singleDose = (m / (d * v)) * referenceDelta * spaVol;
    }

    if (unit === 'unit' || unit === 'bag') {
        singleDose = Math.max(1, Math.round(singleDose / m));
    }

    let alertThreshold = singleDose * 3;
    if (unit === 'kg') {
        alertThreshold /= 1000;
    }

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
    const index = container.children.length;

    const typeVal = data ? data.type : 'ph_minus';
    const mVal = data ? data.m : 500;   
    const dVal = data ? data.d : 1;     
    const vVal = data ? data.v : 2;     
    const stockVal = data ? (data.stock !== undefined ? data.stock : 1000) : 1000;
    const initialStockVal = data ? (data.initialStock || stockVal) : stockVal;
    const unitVal = data ? (data.unit || (typeVal === 'salt_electrolysis' ? 'kg' : 'g')) : 'g';

    const optionsHTML = productTypes.map(pt => 
        `<option value="${pt.id}" ${typeVal === pt.id ? 'selected' : ''}>${pt.name}</option>`
    ).join('');

    const rowDiv = document.createElement('div');
    rowDiv.className = 'product-config-box';
    rowDiv.dataset.index = index;
    rowDiv.dataset.initialStock = initialStockVal;

    const isElectrolysis = typeVal === 'salt_electrolysis';

    rowDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <select class="prod-type" style="width: 70%; font-weight: bold;" onchange="window.spaApp.onProductTypeChange(this)">
                ${optionsHTML}
            </select>
            <button type="button" class="btn-danger" style="width: auto; padding: 6px 10px; margin:0; font-size: 0.8rem;" onclick="this.closest('.product-config-box').remove(); window.spaApp.saveTargets();">❌ Supprimer</button>
        </div>
        
        <div class="grid-3" style="margin-bottom: 8px;">
            <div class="form-group" style="margin:0;">
                <label class="lbl-m">${isElectrolysis ? 'Sel (g)' : 'Dose (g)'}</label>
                <input type="number" inputmode="decimal" class="prod-m" value="${mVal}" step="10" oninput="window.spaApp.saveTargets()">
            </div>
            <div class="form-group" style="margin:0;">
                <label class="lbl-d">${isElectrolysis ? 'Delta (ppm)' : 'Delta'}</label>
                <input type="number" inputmode="decimal" class="prod-d" value="${dVal}" step="0.1" oninput="window.spaApp.saveTargets()">
            </div>
            <div class="form-group" style="margin:0;">
                <label class="lbl-v">${isElectrolysis ? 'Temps (h)' : 'Vol. (m³)'}</label>
                <input type="number" inputmode="decimal" class="prod-v" value="${vVal}" step="0.5" oninput="window.spaApp.saveTargets()">
            </div>
        </div>

        <div class="stock-container" style="display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.03); padding: 6px; border-radius: 4px;">
            <div class="form-group" style="margin:0; flex: 2;">
                <label style="font-size: 0.75rem;">📦 Stock restant</label>
                <input type="number" inputmode="decimal" class="prod-stock" value="${stockVal}" step="0.1" oninput="window.spaApp.saveTargets()">
            </div>
            <div class="form-group" style="margin:0; flex: 1;">
                <label style="font-size: 0.75rem;">Unité</label>
                <select class="prod-unit" style="padding: 6px;" onchange="window.spaApp.saveTargets()">
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
    
    // Si passage en électrolyse, on suggère 'kg' si l'unité était 'g'
    const unitSelect = card.querySelector('.prod-unit');
    if (unitSelect && isElectrolysis && unitSelect.value === 'g') {
        unitSelect.value = 'kg';
    }

    if (window.spaApp?.saveTargets) {
        window.spaApp.saveTargets();
    }
}

export function loadTargets() {
    const vol = document.getElementById('vol');
    if (vol) vol.value = localStorage.getItem('spa_vol') || 1.5;
    
    const dis = document.getElementById('disinfectantType');
    if (dis) dis.value = localStorage.getItem('spa_disinfectant') || 'chlore';

    toggleDisinfectantOptions();

    // Activation / Désactivation des paramètres
    ['Temp', 'Ph', 'ChlLibre', 'ChlTotal', 'Tac', 'Stab', 'Th'].forEach(param => {
        const checkbox = document.getElementById(`enable${param}`);
        if (checkbox) checkbox.checked = localStorage.getItem(`spa_enable${param}`) !== 'false';
    });

    // Cibles par défaut (Plages recommandées pour spa)
    const defaultRanges = {
        ph: { min: 7.2, max: 7.6 },
        tac: { min: 80, max: 120 },
        chlLibre: { min: 2.0, max: 4.0 },
        chlTotal: { min: 2.0, max: 4.5 },
        stab: { min: 20, max: 50 },
        th: { min: 150, max: 250 }
    };

    ['ph', 'tac', 'chlLibre', 'chlTotal', 'stab', 'th'].forEach(param => {
        const minEl = document.getElementById(`${param}TargetMin`);
        const maxEl = document.getElementById(`${param}TargetMax`);

        if (minEl) {
            minEl.value = localStorage.getItem(`spa_${param}TargetMin`) ?? defaultRanges[param]?.min ?? '';
        }
        if (maxEl) {
            maxEl.value = localStorage.getItem(`spa_${param}TargetMax`) ?? defaultRanges[param]?.max ?? '';
        }
    });

    // Chargement des produits
    const container = document.getElementById('dynamicProductsList');
    if (container) {
        container.innerHTML = '';
        const savedProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || 'null');
        
        if (savedProducts && savedProducts.length > 0) {
            savedProducts.forEach(p => addNewProductRow(p));
        } else {
            addNewProductRow({ type: 'ph_minus', m: 15, d: 0.1, v: 1 });
            addNewProductRow({ type: 'ph_plus', m: 15, d: 0.1, v: 1 });
            addNewProductRow({ type: 'tac_plus', m: 18, d: 10, v: 1 });
            addNewProductRow({ type: 'chlore_choc', m: 2, d: 1, v: 1 });
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

    // Sauvegarde des produits
    const productBoxes = document.querySelectorAll('#dynamicProductsList .product-config-box');
    const existingProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');
    const productsArray = [];

    productBoxes.forEach(box => {
        const type = box.querySelector('.prod-type').value;
        const currentStock = parseFloat(box.querySelector('.prod-stock')?.value) || 0;
        const previousProduct = existingProducts.find(p => p.type === type);
        const initialStock = previousProduct?.initialStock || currentStock || 1000;

        productsArray.push({
            type,
            m: parseFloat(box.querySelector('.prod-m').value) || 0,
            d: parseFloat(box.querySelector('.prod-d').value) || 1,
            v: parseFloat(box.querySelector('.prod-v').value) || 1,
            stock: currentStock,
            initialStock,
            unit: box.querySelector('.prod-unit')?.value || 'g'
        });
    });
    localStorage.setItem('spa_dynamic_products', JSON.stringify(productsArray));

    renderInventory();
}

export function buildDynamicMeasuresForm() {
    const grid = document.getElementById('measuresFormGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (localStorage.getItem('spa_enableTemp') !== 'false') {
        grid.innerHTML += `<div class="form-group full-width"><label for="tempVal">🌡️ Température (°C)</label><input type="number" inputmode="decimal" id="tempVal" step="0.5"></div>`;
    }
    if (localStorage.getItem('spa_enablePh') !== 'false') {
        grid.innerHTML += `<div class="form-group"><label for="phVal">🧪 pH</label><input type="number" inputmode="decimal" id="phVal" step="0.1"></div>`;
    }
    if (localStorage.getItem('spa_enableChlLibre') !== 'false') {
        grid.innerHTML += `<div class="form-group"><label for="chlLibreVal">✨ Chlore libre (ppm)</label><input type="number" inputmode="decimal" id="chlLibreVal" step="0.1"></div>`;
    }
    if (localStorage.getItem('spa_enableChlTotal') !== 'false') {
        grid.innerHTML += `<div class="form-group"><label for="chlTotalVal">🧪 Chlore total (ppm)</label><input type="number" inputmode="decimal" id="chlTotalVal" step="0.1"></div>`;
    }
    if (localStorage.getItem('spa_enableTac') !== 'false') {
        grid.innerHTML += `<div class="form-group"><label for="tacVal">⚖️ Alcalinité (TAC)</label><input type="number" inputmode="decimal" id="tacVal" step="5"></div>`;
    }
    if (localStorage.getItem('spa_enableStab') !== 'false') {
        grid.innerHTML += `<div class="form-group"><label for="stabVal">🛡️ Stabilisant (ppm)</label><input type="number" inputmode="decimal" id="stabVal" step="5"></div>`;
    }
    if (localStorage.getItem('spa_enableTh') !== 'false') {
        grid.innerHTML += `<div class="form-group"><label for="thVal">💎 Dureté (TH)</label><input type="number" inputmode="decimal" id="thVal" step="10"></div>`;
    }

    // ⚡ MISE À JOUR EN TEMPS RÉEL LORS DE LA SAISIE ⚡
    grid.addEventListener('input', () => {
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
    });
}

export function computeDose(productType, diff) {
    const savedProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');
    const product = savedProducts.find(p => p.type === productType);
    
    if (!product || product.m <= 0 || product.d <= 0 || product.v <= 0) return { value: 0, unit: 'g' };
    
    const spaVol = parseFloat(localStorage.getItem('spa_vol')) || 1.5;
    const rawDose = (product.m / (product.d * product.v)) * diff * spaVol;

    if (product.unit === 'unit' || product.unit === 'tablet') {
        const unitsCount = Math.max(1, Math.round(rawDose / product.m));
        return { value: unitsCount, unit: 'tablet' };
    }

    if (product.unit === 'kg' && rawDose >= 1000) {
        return { value: Math.round((rawDose / 1000) * 100) / 100, unit: 'kg' };
    }

    return { value: Math.round(rawDose), unit: 'g' };
}

export function renderInventory() {
    const cards = document.querySelectorAll('#dynamicProductsList .product-config-box');
    cards.forEach(card => updateSingleCardStockStatus(card));
}

export function calculateLSI(ph, tempC, tac, th, tds = 1000) {
    if (isNaN(ph) || isNaN(tempC) || isNaN(tac) || isNaN(th)) return null;

    // 1. Facteur Température (TF)
    // Formule d'approximation exacte pour l'eau de spa/piscine
    const tf = (tempC * 0.0123) + 0.5;

    // 2. Facteur Dureté TH (CF) - Dureté en ppm (CaCO3)
    const cf = Math.log10(Math.max(th, 1)) - 0.4;

    // 3. Facteur Alcalinité TAC (AF) - Alcalinité en ppm (CaCO3)
    const af = Math.log10(Math.max(tac, 1));

    // 4. Facteur TDS (Solides Dissous Totaux)
    const tdsFactor = tds >= 1000 ? 12.2 : 12.1;

    // Formule LSI : LSI = pH + TF + CF + AF - TDS
    const lsi = ph + tf + cf + af - tdsFactor;

    return Math.round(lsi * 100) / 100;
}

export function getOrEstimateLSI(measurements) {
    if (!measurements?.ph || !measurements?.tac) {
        return null;
    }

    const ph = parseFloat(measurements.ph);
    const tac = parseFloat(measurements.tac);
    // Valeurs de secours si non renseignées : 37°C et TH 200 ppm
    const tempC = measurements.temp ? parseFloat(measurements.temp) : 37;
    const th = measurements.th ? parseFloat(measurements.th) : 200;

    return calculateLSI(ph, tempC, tac, th);
}

// --- Mise à jour de la jauge LSI ---
export function updateLSIUI(measurements) {
    const cursor = document.getElementById('lsiGaugeCursor');
    const textDisplay = document.getElementById('lsiHeaderValue');

    if (!cursor) return;

    // Récupère ou calcule le LSI
    const lsi = getOrEstimateLSI(measurements);

    if (lsi === null || isNaN(lsi)) {
        cursor.style.left = '50%';
        cursor.style.backgroundColor = '#9ca3af'; // Gris par défaut
        if (textDisplay) textDisplay.innerText = "LSI : --";
        return;
    }

    // Borne la valeur entre -1.0 et +1.0
    const clampedLSI = Math.max(-1, Math.min(1, lsi));
    // Convertit [-1, 1] en pourcentage [0%, 100%]
    const percent = ((clampedLSI + 1) / 2) * 100;

    // Déplacement fluide
    cursor.style.left = `${percent}%`;

    // Pastille de couleur au centre du curseur
    if (lsi < -0.3) {
        cursor.style.backgroundColor = '#ef4444'; // Rouge (Corrosif)
    } else if (lsi > 0.3) {
        cursor.style.backgroundColor = '#f59e0b'; // Orange (Entartrant)
    } else {
        cursor.style.backgroundColor = '#10b981'; // Vert (Équilibré)
    }

    if (textDisplay) {
        textDisplay.innerText = `LSI : ${lsi > 0 ? '+' : ''}${lsi.toFixed(2)}`;
    }
}

export function updateBiologicalStatusUI(measurements) {
    const cursor = document.getElementById('bioGaugeCursor');
    const textDisplay = document.getElementById('bioGaugeValue');
    const alertBanner = document.getElementById('biofilmAlertBanner');

    if (!cursor) return;

    const currentCl = parseFloat(measurements?.chlLibre ?? measurements?.chlorine ?? measurements?.bromine);
    const minTarget = parseFloat(localStorage.getItem('spa_chlLibreTargetMin')) || 2.0;

    const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
    const recentLogs = history.slice(0, 3);

    let consecutiveLowCount = 0;
    if (!isNaN(currentCl) && currentCl < minTarget) {
        consecutiveLowCount++;
    }
    
    for (const log of recentLogs) {
        const pastCl = parseFloat(log.chlLibre);
        if (!isNaN(pastCl) && pastCl < minTarget) {
            consecutiveLowCount++;
        } else if (!isNaN(pastCl)) {
            break;
        }
    }

    if (isNaN(currentCl) && recentLogs.length === 0) {
        cursor.style.left = '16.6%';
        cursor.style.backgroundColor = '#9ca3af'; // Gris
        if (textDisplay) textDisplay.innerText = "Charge bactérienne : Données insuffisantes";
        if (alertBanner) alertBanner.style.display = 'none';
        return;
    }

    if (consecutiveLowCount >= 2 || (currentCl === 0 && consecutiveLowCount >= 1)) {
        // 🚨 RISQUE BIOFILM (Zone Rouge - 3ème tiers : 83.3%)
        cursor.style.left = '83.3%';
        cursor.style.backgroundColor = '#ef4444'; // Rouge
        if (textDisplay) textDisplay.innerText = "Charge bactérienne : ÉLEVÉE (Risque Biofilm)";
        if (alertBanner) alertBanner.style.display = 'block';

    } else if (consecutiveLowCount === 1) {
        // ⚠️ VIGILANCE (Zone Orange - 2ème tiers : 50%)
        cursor.style.left = '50%';
        cursor.style.backgroundColor = '#f59e0b'; // Orange
        if (textDisplay) textDisplay.innerText = "Charge bactérienne : Vigilance (Sous-dosage récent)";
        if (alertBanner) alertBanner.style.display = 'none';

    } else {
        // ✅ EAU SAINE (Zone Verte - 1er tiers : 16.6%)
        cursor.style.left = '16.6%';
        cursor.style.backgroundColor = '#10b981'; // Vert
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

    // --- 1. ÉVALUATION DU LSI (Équilibre chimique) ---
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

    // --- 2. ÉVALUATION DU DÉSINFECTANT AVEC INERTIE BACTÉRIENNE ---
    const currentCl = parseFloat(measurements?.chlLibre ?? measurements?.chlorine ?? measurements?.bromine);
    
    // Bornes cibles configurées
    const minTarget = parseFloat(localStorage.getItem('spa_chlLibreTargetMin')) || 2.0;
    const maxTarget = parseFloat(localStorage.getItem('spa_chlLibreTargetMax')) || 4.0;

    // Récupération de l'historique récent (les 3 dernières mesures enregistrées)
    const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
    const recentLogs = history.slice(0, 3);

    // Calcul du nombre de relevés consécutifs sous la cible
    let consecutiveLowCount = 0;
    if (!isNaN(currentCl) && currentCl < minTarget) {
        consecutiveLowCount++; // La valeur actuelle en cours de saisie est basse
    }
    
    for (const log of recentLogs) {
        const pastCl = parseFloat(log.chlLibre);
        if (!isNaN(pastCl) && pastCl < minTarget) {
            consecutiveLowCount++;
        } else if (!isNaN(pastCl)) {
            break; // Stop si une bonne mesure interrompt la série de sous-dosage
        }
    }

    pillSanitizer.className = 'status-pill';

    if (isNaN(currentCl) && recentLogs.length === 0) {
        valSanitizer.innerText = "--";
    } else if (!isNaN(currentCl) && currentCl > maxTarget) {
        pillSanitizer.classList.add('status-warning');
        valSanitizer.innerText = "Surdosé";
    } else if (consecutiveLowCount >= 2) {
        // ⚠️ ALERTE INERTIE : Sous-désinfection répétée / prolongée
        pillSanitizer.classList.add('status-danger');
        valSanitizer.innerText = "Risque Bio";
    } else if (!isNaN(currentCl) && currentCl < minTarget) {
        // Premier relevé bas (Inertie encore sous contrôle si corrigé rapidement)
        pillSanitizer.classList.add('status-warning');
        valSanitizer.innerText = "Bassin Faible";
    } else {
        pillSanitizer.classList.add('status-ok');
        valSanitizer.innerText = "Sain";
    }
}