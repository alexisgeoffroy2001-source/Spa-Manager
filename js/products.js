import { saveSettingsAndInventory } from './storage.js';
import { convertDoseUnits } from './calculator.js';

// --- Déclaration de productTypes ---
export const productTypes = [
    { id: 'ph_minus', name: 'pH Minus (pH-)' },
    { id: 'ph_plus', name: 'pH Plus (pH+)' },
    { id: 'tac_plus', name: 'TAC Plus' },
    { id: 'chlore_choc', name: 'Chlore Choc' },
    { id: 'brome', name: 'Brome' },
    { id: 'oxygene', name: 'Oxygène Actif' },
    { id: 'salt_electrolysis', name: 'Sel / Électrolyseur' }
];

export function syncSaltElectrolysisWithDisinfectant() {
    const disinfectant = document.getElementById('disinfectantType')?.value;
    const container = document.getElementById('dynamicProductsList');
    if (!container) return;

    const saltCard = Array.from(container.querySelectorAll('.product-config-box')).find(box => 
        box.querySelector('.prod-type')?.value === 'salt_electrolysis'
    );

    if (disinfectant === 'sel' && !saltCard) {
        addNewProductRow({ type: 'salt_electrolysis', m: 500, d: 1.0, v: 2.0, stock: 0, unit: 'kg' });
        saveSettingsAndInventory();
    } else if (disinfectant !== 'sel' && saltCard) {
        saltCard.remove();
        saveSettingsAndInventory();
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
            <select class="prod-type product-type-select">${optionsHTML}</select>
            <button type="button" class="btn-danger product-delete-btn">❌</button>
        </div>
        <div class="product-row-flex product-row-gap">
            <div class="form-group product-input-group">
                <label class="lbl-m product-input-label">${isElectrolysis ? 'Sel (g)' : 'Dose (g)'}</label>
                <input type="number" inputmode="decimal" class="prod-m" value="${mVal}" step="10">
            </div>
            <div class="form-group product-input-group">
                <label class="lbl-d product-input-label">${isElectrolysis ? 'Delta (ppm)' : 'Delta'}</label>
                <input type="number" inputmode="decimal" class="prod-d" value="${dVal}" step="0.1">
            </div>
            <div class="form-group product-input-group">
                <label class="lbl-v product-input-label">${isElectrolysis ? 'Temps (h)' : 'Vol. (m³)'}</label>
                <input type="number" inputmode="decimal" class="prod-v" value="${vVal}" step="0.5">
            </div>
        </div>

        <div class="stock-container">
            <div class="form-group product-stock-group">
                <label class="product-input-label">📦 Stock restant</label>
                <input type="number" inputmode="decimal" class="prod-stock" value="${stockVal}" step="0.1">
            </div>
            <div class="form-group product-unit-group">
                <label class="product-input-label">Unité</label>
                <select class="prod-unit product-unit-select">
                    <option value="g" ${unitVal === 'g' ? 'selected' : ''}>Grammes (g)</option>
                    <option value="kg" ${unitVal === 'kg' ? 'selected' : ''}>Kilogrammes (kg)</option>
                    <option value="tablet" ${unitVal === 'tablet' ? 'selected' : ''}>Pastilles</option>
                </select>
            </div>
        </div>
    `;

    // --- ATTRIBUTION DES ÉCOUTEURS D'ÉVÉNEMENTS EN JS PROPRE ---
    const typeSelect = rowDiv.querySelector('.prod-type');
    const deleteBtn = rowDiv.querySelector('.product-delete-btn');
    const inputM = rowDiv.querySelector('.prod-m');
    const inputD = rowDiv.querySelector('.prod-d');
    const inputV = rowDiv.querySelector('.prod-v');
    const inputStock = rowDiv.querySelector('.prod-stock');
    const unitSelect = rowDiv.querySelector('.prod-unit');

    typeSelect.addEventListener('change', () => {
        updateProductRowLabelsOnTypeChange(typeSelect);
        saveSettingsAndInventory();
    });

    deleteBtn.addEventListener('click', () => {
        rowDiv.remove();
        saveSettingsAndInventory();
    });

    [inputM, inputD, inputV].forEach(input => {
        input.addEventListener('input', saveSettingsAndInventory);
    });

    inputStock.addEventListener('input', () => {
        saveSettingsAndInventory();
        renderInventory();
    });

    unitSelect.addEventListener('change', () => {
        saveSettingsAndInventory();
        renderInventory();
    });
    
    container.appendChild(rowDiv);
}

export function updateProductRowLabelsOnTypeChange(selectElem) {
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

    saveSettingsAndInventory();
}

export function evaluateProductStockAlert(cardElement) {
    if (!cardElement) return;

    const type = cardElement.querySelector('.prod-type')?.value;
    const m = parseFloat(cardElement.querySelector('.prod-m')?.value) || 0;
    const d = parseFloat(cardElement.querySelector('.prod-d')?.value) || 1;
    const v = parseFloat(cardElement.querySelector('.prod-v')?.value) || 1;
    const currentStock = parseFloat(cardElement.querySelector('.prod-stock')?.value) || 0;
    const unit = cardElement.querySelector('.prod-unit')?.value || 'g';
    const spaVol = parseFloat(localStorage.getItem('spa_vol')) || 1.5;

    let referenceDelta = (type === 'tac_plus') ? 20 : (['chlore_choc', 'brome', 'oxygene'].includes(type) ? 2.0 : 0.3);

    let singleDoseGrams = 0;
    if (m > 0 && d > 0 && v > 0) {
        singleDoseGrams = (m / (d * v)) * referenceDelta * spaVol;
    }

    const singleDoseInStockUnit = convertDoseUnits(singleDoseGrams, 'g', unit, m);
    let alertThreshold = singleDoseInStockUnit * 3;

    if (['unit', 'tablet'].includes(unit)) {
        alertThreshold = Math.max(1, Math.round(alertThreshold));
    }

    cardElement.classList.remove('stock-warning', 'out-of-stock');
    if (currentStock <= alertThreshold / 3) {
        cardElement.classList.add('out-of-stock');
    } else if (currentStock <= alertThreshold) {
        cardElement.classList.add('stock-warning');
    }
}

export function renderInventory() {
    document.querySelectorAll('#dynamicProductsList .product-config-box').forEach(evaluateProductStockAlert);
}