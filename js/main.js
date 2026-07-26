import { exportData, importData, requestStoragePersistence, initTheme, changeTheme, updateOnlineStatus, getLastMeasurement } from './storage.js';
import { loadTargets, saveTargets, toggleTargetVisibility, toggleDisinfectantOptions, onProductTypeChange, addNewProductRow, buildDynamicMeasuresForm, computeDose, renderInventory, updateLSIUI, updateBiologicalStatusUI, updateGlobalHeaderStatus } from './calculator.js';
import { renderMaintenanceTasks, saveMaintenanceSettings, markTaskDone, openAddTaskModal, confirmAddTask, onPresetChange, requestNotificationPermission, checkMaintenanceAlerts } from './maintenance.js';
import { setChartFilter, renderHistory, clearHistory, renderSingleChart } from './charts.js';

// --- ÉTAT DE NAVIGATION & PAGINATION ---
let currentTreatmentPage = 1;
window.currentMeasuresPage = 1;
const itemsPerPage = 5;

// --- GESTION PWA ---
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    toggleInstallButton(true);
});

window.addEventListener('DOMContentLoaded', () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) {
        toggleInstallButton(false);
    }
});

function toggleInstallButton(show) {
    const installBtn = document.getElementById('btnInstallApp');
    const installedNotice = document.getElementById('pwaInstalledNotice');
    if (installBtn) installBtn.style.display = show ? 'block' : 'none';
    if (installedNotice) installedNotice.style.display = show ? 'none' : 'block';
}

async function installPWA() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    if (isIOS) {
        alert("Pour installer l'application sur iOS :\n\n1. Appuyez sur le bouton de partage [↑]\n2. Sélectionnez 'Sur l'écran d'accueil' 📲");
        return;
    }

    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            toggleInstallButton(false);
        }
        deferredPrompt = null;
    } else {
        alert("Installation directe non supportée. Utilisez le menu du navigateur (⋮) pour 'Ajouter à l'écran d'accueil'.");
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error('Échec SW:', err));
    }
}

// --- INITIALISATION ---
window.onload = function() {
    initTheme();
    registerServiceWorker();
    requestStoragePersistence();
    updateOnlineStatus();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Nettoyage ancien stockage obsolète
    localStorage.removeItem('spa_last_measurements');

    if (!localStorage.getItem('spa_initialized')) {
        saveTargets();
        localStorage.setItem('spa_initialized', 'true');
    }
    
    loadTargets();

    buildDynamicMeasuresForm();
    renderMaintenanceTasks();
    renderTreatmentLogs();
    checkMaintenanceAlerts();

    if (localStorage.getItem('spa_results_visible') === 'block') {
        restoreLastResults();
    }

    refreshGlobalUI();
};

function refreshGlobalUI() {
    const lastMeasurements = getLastMeasurement() || {};
    updateLSIUI(lastMeasurements);
    updateBiologicalStatusUI(lastMeasurements);
    updateGlobalHeaderStatus(lastMeasurements);
}

function restoreLastResults() {
    const resultsCard = document.getElementById('resultsCard');
    const stepsContainer = document.getElementById('treatmentSteps');
    const banner = document.getElementById('balancedWaterBanner');

    if (resultsCard) resultsCard.style.display = 'block';
    if (stepsContainer && localStorage.getItem('spa_last_steps')) {
        stepsContainer.innerHTML = localStorage.getItem('spa_last_steps');
    }
    if (banner && localStorage.getItem('spa_last_banner')) {
        banner.style.display = localStorage.getItem('spa_last_banner');
    }
}

function switchPage(pageId, title, element) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active');
    if (element) element.classList.add('active');
    
    // Correction : Utilisation de la classe .app-title présente dans le HTML d'origine
    const headerTitle = document.querySelector('.app-title');
    if (headerTitle && title) headerTitle.innerText = title;

    switch (pageId) {
        case 'measures':
            buildDynamicMeasuresForm();
            break;
        case 'charts':
            renderSingleChart();
            renderHistory();
            break;
        case 'maintenance':
            renderMaintenanceTasks();
            refreshGlobalUI();
            break;
        case 'treatment':
            renderTreatmentLogs();
            renderInventory();
            break;
    }
}

// --- CALCULATEUR & TRAITEMENTS ---

function formatDoseLabel(doseObj) {
    if (doseObj.unit === 'kg') return `${doseObj.value} kg`;
    if (doseObj.unit === 'tablet') return `${doseObj.value} ${doseObj.value > 1 ? 'pastilles' : 'pastille'}`;
    return `${doseObj.value}g`;
}

export function calculateAndSave() {
    const measurements = {
        date: new Date().toISOString().split('T')[0],
        temp: parseFloat(document.getElementById('tempVal')?.value),
        ph: parseFloat(document.getElementById('phVal')?.value),
        chlLibre: parseFloat(document.getElementById('chlLibreVal')?.value),
        chlTotal: parseFloat(document.getElementById('chlTotalVal')?.value),
        tac: parseFloat(document.getElementById('tacVal')?.value),
        stab: parseFloat(document.getElementById('stabVal')?.value),
        th: parseFloat(document.getElementById('thVal')?.value),
        note: document.getElementById('eventNote')?.value.trim() || ''
    };
    
    updateLSIUI(measurements);

    const hasValues = Object.entries(measurements).some(([key, val]) => key !== 'date' && !isNaN(val)) || measurements.note !== '';
    if (!hasValues) {
        alert("Veuillez saisir au moins une mesure ou une note.");
        return;
    }

    const stepsContainer = document.getElementById('treatmentSteps');
    if (!stepsContainer) return;
    stepsContainer.innerHTML = '';
    
    let actionsCount = 0;
    const savedProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');
    const disinfectantType = localStorage.getItem('spa_disinfectant') || 'chlore';

    const limits = {
        phMin: parseFloat(localStorage.getItem('spa_phTargetMin')) || 7.2,
        phMax: parseFloat(localStorage.getItem('spa_phTargetMax')) || 7.6,
        tacMin: parseFloat(localStorage.getItem('spa_tacTargetMin')) || 80,
        tacMax: parseFloat(localStorage.getItem('spa_tacTargetMax')) || 120,
        chlMin: parseFloat(localStorage.getItem('spa_chlLibreTargetMin')) || 2.0
    };

    function generateStepHTML(stepNum, title, prodKey, prodName, diffVal, advice, customDoseData = null) {
        const product = savedProducts.find(p => p.type === prodKey);
        
        if (!product || (!customDoseData && (!product.m || !product.d || !product.v))) {
            return `<div class="treatment-step" style="border-left: 4px var(--danger);"><div><strong>${stepNum}. ${title}</strong><br><span style="color: var(--danger);">⚠️ Produit "${prodName}" non configuré.</span></div></div>`;
        }

        const doseObj = customDoseData || computeDose(prodKey, diffVal);
        const currentStock = parseFloat(product.stock) || 0;
        let requiredInStockUnit = doseObj.value;

        if (doseObj.unit === 'g' && product.unit === 'kg') requiredInStockUnit /= 1000;

        if (currentStock <= 0) {
            actionsCount++;
            return `<div class="treatment-step" style="border-left: 4px solid var(--danger);" data-prod-type="${prodKey}" data-dose="0">
                <input type="checkbox" disabled>
                <div><strong>${stepNum}. ${title} - Stock épuisé !</strong><br><span style="color: var(--danger);">⚠️ Stock de ${prodName} vide (0). Requis : ${formatDoseLabel(doseObj)}.</span></div>
            </div>`;
        }

        actionsCount++;
        const isInsufficient = currentStock < requiredInStockUnit;
        const borderColor = isInsufficient ? 'var(--warning, #f59e0b)' : 'var(--success, #10b981)';
        
        let doseToApply = doseObj;
        if (isInsufficient) {
            doseToApply = { value: currentStock, unit: product.unit };
        }

        return `<div class="treatment-step" style="border-left: 4px solid ${borderColor};" data-prod-type="${prodKey}" data-dose="${doseToApply.value}" data-unit="${doseToApply.unit}">
            <input type="checkbox" checked>
            <div><strong>${stepNum}. ${title}</strong><br>Ajouter <strong>${formatDoseLabel(doseToApply)}</strong> de ${prodName} ${isInsufficient ? '<span style="color: var(--warning);">⚠️ Stock partiel</span>' : ''}. <em>(${advice})</em></div>
        </div>`;
    }

    let stepsHTML = '';

    // 1. TAC
    if (!isNaN(measurements.tac) && measurements.tac < limits.tacMin && localStorage.getItem('spa_enableTac') !== 'false') {
        stepsHTML += generateStepHTML(1, `TAC trop bas (${measurements.tac})`, 'tac_plus', 'TAC+', limits.tacMin - measurements.tac, "Attendre 2-4h avant le pH");
    }

    // 2. pH
    if (!isNaN(measurements.ph) && localStorage.getItem('spa_enablePh') !== 'false') {
        if (measurements.ph > limits.phMax) {
            stepsHTML += generateStepHTML(2, `pH trop haut (${measurements.ph})`, 'ph_minus', 'pH-', Math.round((measurements.ph - limits.phMax) * 10) / 10, "Attendre 30 min-1h");
        } else if (measurements.ph < limits.phMin) {
            stepsHTML += generateStepHTML(2, `pH trop bas (${measurements.ph})`, 'ph_plus', 'pH+', Math.round((limits.phMin - measurements.ph) * 10) / 10, "Attendre 30 min-1h");
        }
    }

    // 3. Désinfectant
    if (!isNaN(measurements.chlLibre) && measurements.chlLibre < limits.chlMin && localStorage.getItem('spa_enableChlLibre') !== 'false') {
        const diffChl = limits.chlMin - measurements.chlLibre;
        if (disinfectantType === 'sel') {
            const saltProduct = savedProducts.find(p => p.type === 'salt_electrolysis');
            const spaVol = parseFloat(localStorage.getItem('spa_vol')) || 1.5;
            
            // 1. Calcul de la masse de sel en grammes (ex: m / d * diff * volume)
            const calcSalt = saltProduct && saltProduct.d > 0 
                ? Math.round((saltProduct.m / saltProduct.d) * diffChl * spaVol) 
                : Math.round(500 * diffChl);
            
            // 2. Calcul du temps d'électrolyse en heures (ex: temps de base v ajusté selon le delta et le volume)
            const baseHours = saltProduct ? parseFloat(saltProduct.v) || 2.0 : 2.0;
            const baseDelta = saltProduct ? parseFloat(saltProduct.d) || 1.0 : 1.0;
            
            let calcHours = 0;
            if (baseDelta > 0) {
                calcHours = Math.round((baseHours / baseDelta) * diffChl * spaVol * 10) / 10;
            }
            if (calcHours <= 0) calcHours = 0.5; // Minimum d'affichage si l'écart est infime

            const saltAdvice = `Ajouter ${calcSalt}g de sel, puis lancer l'électrolyse pendant ${calcHours}h`;
            stepsHTML += generateStepHTML(3, `Traitement Sel & Électrolyse`, 'salt_electrolysis', 'Électrolyseur / Sel', diffChl, saltAdvice, { value: calcSalt, unit: 'g' });
        } else {
            const prodConfig = {
                brome: { key: 'brome', name: 'Brome', wait: 'Dissolution complète' },
                oxygene: { key: 'oxygene', name: 'Oxygène Actif', wait: 'Baignade après 15 min' },
                chlore: { key: 'chlore_choc', name: 'Chlore Choc', wait: '15-30 min' }
            }[disinfectantType] || { key: 'chlore_choc', name: 'Chlore', wait: '15-30 min' };

            stepsHTML += generateStepHTML(3, `Désinfectant bas (${measurements.chlLibre} ppm)`, prodConfig.key, prodConfig.name, diffChl, prodConfig.wait);
        }
    }

    stepsContainer.innerHTML = stepsHTML;

    // Enregistrement historique
    const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
    history.unshift(measurements);
    localStorage.setItem('spa_history', JSON.stringify(history));

    const banner = document.getElementById('balancedWaterBanner');
    const validateBtn = document.getElementById('validateTreatmentBtn');

    if (actionsCount === 0) {
        if (banner) banner.style.display = 'block';
        if (validateBtn) validateBtn.style.display = 'none';
    } else {
        if (banner) banner.style.display = 'none';
        if (validateBtn) {
            validateBtn.style.display = 'block';
            validateBtn.innerText = "✅ Enregistrer les produits appliqués";
            validateBtn.style.background = "var(--success)";
            validateBtn.disabled = false;
        }
    }

    // Reset du formulaire de mesures
    document.getElementById('eventNote').value = '';
    ['tempVal', 'phVal', 'chlLibreVal', 'chlTotalVal', 'tacVal', 'stabVal', 'thVal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    localStorage.setItem('spa_last_steps', stepsContainer.innerHTML);
    if (banner) localStorage.setItem('spa_last_banner', banner.style.display);
    localStorage.setItem('spa_results_visible', 'block');

    const treatmentNavItem = document.querySelectorAll('nav .nav-item')[1];
    switchPage('treatment', 'Actions & Produits', treatmentNavItem);
}

// --- VALIDATION ET MISE À JOUR DU STOCK ---
function validateAppliedTreatment() {
    const steps = document.querySelectorAll('.treatment-step');
    if (steps.length === 0) return;

    const appliedList = [];
    const stockUpdates = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');

    steps.forEach(step => {
        const checkbox = step.querySelector('input[type="checkbox"]');
        if (!checkbox || !checkbox.checked) return;

        const targetType = step.dataset.prodType;
        const doseVal = parseFloat(step.dataset.dose);
        const doseUnit = step.dataset.unit;
        const textDiv = step.querySelector('div');

        if (targetType && !isNaN(doseVal)) {
            appliedList.push(textDiv.innerText.replace(/\n/g, ' - '));
            const prodConfig = stockUpdates.find(p => p.type === targetType);
            
            if (prodConfig) {
                if (prodConfig.unit === 'unit' || prodConfig.unit === 'tablet') {
                    prodConfig.stock = Math.max(0, Math.round((prodConfig.stock - doseVal) * 10) / 10);
                } else if (prodConfig.unit === 'kg') {
                    const doseInKg = doseUnit === 'g' ? doseVal / 1000 : doseVal;
                    prodConfig.stock = Math.max(0, Math.round((prodConfig.stock - doseInKg) * 10) / 10);
                } else {
                    const doseInGrams = doseUnit === 'kg' ? doseVal * 1000 : doseVal;
                    prodConfig.stock = Math.max(0, Math.round(prodConfig.stock - doseInGrams));
                }
            }
        }
    });

    localStorage.setItem('spa_dynamic_products', JSON.stringify(stockUpdates));
    loadTargets();      
    renderInventory();  

    if (appliedList.length > 0) {
        const treatmentSummary = appliedList.join(" | ");
        const treatmentLogs = JSON.parse(localStorage.getItem('spa_treatment_logs') || '[]');
        
        treatmentLogs.unshift({
            date: new Date().toLocaleDateString('fr-FR') + ' ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            details: treatmentSummary
        });
        localStorage.setItem('spa_treatment_logs', JSON.stringify(treatmentLogs));
        renderTreatmentLogs();

        // Mettre à jour la note de la dernière mesure
        const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
        if (history.length > 0) {
            const noteText = "Traitement appliqué : " + treatmentSummary;
            history[0].note = history[0].note ? `${history[0].note} | ${noteText}` : noteText;
            localStorage.setItem('spa_history', JSON.stringify(history));
        }

        document.getElementById('treatmentSteps').innerHTML = '';
        const btn = document.getElementById('validateTreatmentBtn');
        if (btn) btn.style.display = 'none';

        localStorage.setItem('spa_last_steps', '');
        alert("✅ Traitement enregistré et stock mis à jour avec succès !");
    }
}

// --- PAGINATION (MUTUALISÉE) ---
function changePage(direction, type) {
    const isTreatment = type === 'treatment';
    const logs = JSON.parse(localStorage.getItem(isTreatment ? 'spa_treatment_logs' : 'spa_history') || '[]');
    const totalPages = Math.ceil(logs.length / itemsPerPage);

    if (isTreatment) {
        currentTreatmentPage = Math.max(1, Math.min(totalPages, currentTreatmentPage + direction));
        renderTreatmentLogs();
    } else {
        window.currentMeasuresPage = Math.max(1, Math.min(totalPages, window.currentMeasuresPage + direction));
        renderHistory();
    }
}

function renderTreatmentLogs() {
    const container = document.getElementById('treatmentLogsContainer');
    const paginationEl = document.getElementById('treatmentPagination');
    const indicatorEl = document.getElementById('treatmentPageIndicator');
    if (!container) return;
    
    const logs = JSON.parse(localStorage.getItem('spa_treatment_logs') || '[]');
    if (logs.length === 0) {
        container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">Aucun traitement enregistré.</p>`;
        if (paginationEl) paginationEl.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(logs.length / itemsPerPage);
    if (currentTreatmentPage > totalPages) currentTreatmentPage = totalPages;

    const paginatedLogs = logs.slice((currentTreatmentPage - 1) * itemsPerPage, currentTreatmentPage * itemsPerPage);

    container.innerHTML = paginatedLogs.map(log => `
        <div class="treatment-log-item"><div><strong>${log.date}</strong><br>${log.details}</div></div>
    `).join('');

    if (paginationEl && indicatorEl) {
        paginationEl.style.display = logs.length > itemsPerPage ? 'flex' : 'none';
        indicatorEl.textContent = `Page ${currentTreatmentPage}/${totalPages}`;
    }
}

// --- EXPORT GLOBAL POUR LE DOM ---
window.spaApp = {
    switchPage,
    calculateAndSave,
    validateAppliedTreatment,
    saveTargets,
    toggleTargetVisibility,
    toggleDisinfectantOptions,
    onProductTypeChange,
    addNewProductRow,
    changeTheme,
    requestNotificationPermission,
    exportData,
    importData,
    clearHistory: () => clearHistory(renderHistory),
    setChartFilter: (days) => setChartFilter(days, renderSingleChart),
    renderSingleChart,
    saveMaintenanceSettings,
    markTaskDone,
    openAddTaskModal,
    confirmAddTask,
    onPresetChange,
    installPWA,
    nextTreatmentPage: () => changePage(1, 'treatment'),
    prevTreatmentPage: () => changePage(-1, 'treatment'),
    nextMeasuresPage: () => changePage(1, 'measures'),
    prevMeasuresPage: () => changePage(-1, 'measures')
};