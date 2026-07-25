import { exportData, importData, requestStoragePersistence, initTheme, changeTheme, updateOnlineStatus } from './storage.js';
import { loadTargets, saveTargets, toggleTargetVisibility, toggleDisinfectantOptions, onProductTypeChange, addNewProductRow, buildDynamicMeasuresForm, computeDose, renderInventory, updateLSIUI, updateBiologicalStatusUI, updateGlobalHeaderStatus } from './calculator.js';
import { renderMaintenanceTasks, saveMaintenanceSettings, markTaskDone, openAddTaskModal, confirmAddTask, onPresetChange, requestNotificationPermission, checkMaintenanceAlerts } from './maintenance.js';
import { setChartFilter, renderHistory, clearHistory, renderSingleChart } from './charts.js';

// --- LOGIQUE PWA (INSTALLATION APPLI) ---
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    const installBtn = document.getElementById('btnInstallApp');
    if (installBtn) {
        installBtn.style.display = 'block';
    }
});

window.addEventListener('DOMContentLoaded', () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (isStandalone) {
        const installBtn = document.getElementById('btnInstallApp');
        const installedNotice = document.getElementById('pwaInstalledNotice');
        if (installBtn) installBtn.style.display = 'none';
        if (installedNotice) installedNotice.style.display = 'block';
    }
});

async function installPWA() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    if (isIOS) {
        alert("Pour installer l'application sur iOS :\n\n1. Appuyez sur le bouton de partage en bas de votre écran [↑]\n2. Défilez vers le bas et sélectionnez 'Sur l'écran d'accueil' 📲");
        return;
    }

    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            const installBtn = document.getElementById('btnInstallApp');
            const installedNotice = document.getElementById('pwaInstalledNotice');
            if (installBtn) installBtn.style.display = 'none';
            if (installedNotice) installedNotice.style.display = 'block';
        }
        deferredPrompt = null;
    } else {
        alert("L'installation directe n'est pas supportée sur ce navigateur ou l'application est déjà installée.\n\nUtilisez le menu de votre navigateur (3 petits points ⋮) puis 'Installer l'application' ou 'Ajouter à l'écran d'accueil'.");
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW enregistré avec succès', reg))
            .catch(err => console.error('Échec enregistrement SW:', err));
    }
}

// --- INITIALISATION DE L'APPLICATION ---
window.onload = function() {
    initTheme();
    registerServiceWorker();
    requestStoragePersistence();
    updateOnlineStatus();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    if (!localStorage.getItem('spa_initialized')) {
        saveTargets();
        localStorage.setItem('spa_initialized', 'true');
    } else {
        loadTargets();
    }

    buildDynamicMeasuresForm();
    renderMaintenanceTasks();
    renderTreatmentLogs();
    checkMaintenanceAlerts();

    const savedResultsVisible = localStorage.getItem('spa_results_visible');
    if (savedResultsVisible === 'block') {
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

    const lastMeasurements = JSON.parse(localStorage.getItem('spa_last_measurements') || 'null');
    updateLSIUI(lastMeasurements || {});
    updateBiologicalStatusUI(lastMeasurements || {});
    updateGlobalHeaderStatus(lastMeasurements || {});
};

function switchPage(pageId, title, element) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active');
    if (element) element.classList.add('active');
    
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
        headerTitle.innerText = title;
    }

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
            const lastMeasures = getLastSavedMeasures();
            updateLSIUI(lastMeasures);
            updateBiologicalStatusUI(lastMeasures);
            break;
        case 'treatment':
            renderTreatmentLogs();
            renderInventory();
            break;
    }
}

export function calculateAndSave() {
    const ph = parseFloat(document.getElementById('phVal')?.value);
    const chlLibre = parseFloat(document.getElementById('chlLibreVal')?.value);
    const chlTotal = parseFloat(document.getElementById('chlTotalVal')?.value);
    const temp = parseFloat(document.getElementById('tempVal')?.value);
    const tac = parseFloat(document.getElementById('tacVal')?.value);
    const stab = parseFloat(document.getElementById('stabVal')?.value);
    const th = parseFloat(document.getElementById('thVal')?.value);
    const note = document.getElementById('eventNote')?.value.trim();

    const currentMeasurements = { temp, ph, chlLibre, chlTotal, tac, stab, th };
    
    updateLSIUI(currentMeasurements);
    localStorage.setItem('spa_last_measurements', JSON.stringify(currentMeasurements));

    if (isNaN(temp) && isNaN(ph) && isNaN(tac) && isNaN(chlLibre) && isNaN(chlTotal) && isNaN(stab) && isNaN(th) && !note) {
        alert("Veuillez saisir au moins une mesure ou une note."); 
        return;
    }

    const disinfectantType = localStorage.getItem('spa_disinfectant') || 'chlore';
    const savedProducts = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');

    const stepsContainer = document.getElementById('treatmentSteps');
    if (!stepsContainer) return;
    
    stepsContainer.innerHTML = '';
    let actionsCount = 0;

    // Récupération des plages Min / Max depuis le localStorage
    const phMin = parseFloat(localStorage.getItem('spa_phTargetMin')) || 7.2;
    const phMax = parseFloat(localStorage.getItem('spa_phTargetMax')) || 7.6;

    const tacMin = parseFloat(localStorage.getItem('spa_tacTargetMin')) || 80;
    const tacMax = parseFloat(localStorage.getItem('spa_tacTargetMax')) || 120;

    const chlMin = parseFloat(localStorage.getItem('spa_chlLibreTargetMin')) || 2.0;
    const chlMax = parseFloat(localStorage.getItem('spa_chlLibreTargetMax')) || 4.0;

    function formatDoseLabel(doseObj) {
        if (doseObj.unit === 'kg') return `${doseObj.value} kg`;
        if (doseObj.unit === 'tablet') return `${doseObj.value} ${doseObj.value > 1 ? 'pastilles' : 'pastille'}`;
        return `${doseObj.value}g`;
    }

    function renderStepWithStockCheck(stepNum, titleText, prodKey, prodName, diffVal, adviceText) {
        const product = savedProducts.find(p => p.type === prodKey);
        
        if (!product || !product.m || !product.d || !product.v) {
            return `
                <div class="treatment-step" style="border-left: 4px solid var(--danger);">
                    <div><strong>${stepNum}. ${titleText}</strong><br><span style="color: var(--danger);">⚠️ Aucun produit "${prodName}" configuré.</span></div>
                </div>`;
        }

        const doseObj = computeDose(prodKey, diffVal);
        const requiredDose = doseObj.value; 
        const currentStock = parseFloat(product.stock) || 0;

        let requiredInStockUnit = requiredDose;
        if (doseObj.unit === 'g' && product.unit === 'kg') {
            requiredInStockUnit = requiredDose / 1000;
        }

        if (currentStock <= 0) {
            return `
                <div class="treatment-step" style="border-left: 4px solid var(--danger, #ef4444);">
                    <input type="checkbox" disabled>
                    <div>
                        <strong>${stepNum}. ${titleText} - Stock épuisé !</strong><br>
                        <span style="color: var(--danger, #ef4444); font-weight: 600;">
                            ⚠️ Votre stock de ${prodName} est vide (0). Impossible d'effectuer l'ajout (${formatDoseLabel(doseObj)} requis).
                        </span><br>
                        <em>Pensez à réapprovisionner votre produit.</em>
                    </div>
                </div>`;
        }

        if (currentStock < requiredInStockUnit) {
            const currentStockFormatted = product.unit === 'kg' ? `${currentStock} kg` : formatDoseLabel({ value: currentStock, unit: product.unit });
            const missingDoseVal = Math.round((requiredInStockUnit - currentStock) * 100) / 100;
            const missingDoseFormatted = product.unit === 'kg' ? `${missingDoseVal} kg` : formatDoseLabel({ value: missingDoseVal, unit: product.unit });

            return `
                <div class="treatment-step" style="border-left: 4px solid var(--warning, #f59e0b);">
                    <input type="checkbox" checked>
                    <div>
                        <strong>${stepNum}. ${titleText} - Stock insuffisant !</strong><br>
                        Ajouter <strong>${currentStockFormatted}</strong> de ${prodName} <em>(totalité de votre stock restant)</em>.<br>
                        <span style="color: var(--warning, #f59e0b); font-weight: 600;">
                            ⚠️ Stock insuffisant : il manquera ${missingDoseFormatted} pour atteindre la cible.
                        </span><br>
                        <em>(${adviceText})</em>
                    </div>
                </div>`;
        }

        const doseLabel = formatDoseLabel(doseObj);
        return `
            <div class="treatment-step">
                <input type="checkbox" checked>
                <div><strong>${stepNum}. ${titleText}</strong><br>Ajouter <strong>${doseLabel}</strong> de ${prodName}. <em>(${adviceText})</em></div>
            </div>`;
    }

    // 1. TAC (Gestion par plage Min - Max)
    let tacStepHTML = '';
    if (!isNaN(tac) && localStorage.getItem('spa_enableTac') !== 'false') {
        if (tac < tacMin) {
            const diffTac = tacMin - tac;
            actionsCount++;
            tacStepHTML = renderStepWithStockCheck(1, `Alcalinité (TAC) trop basse (${tac} mg/L, cible: ${tacMin}-${tacMax})`, 'tac_plus', 'TAC+', diffTac, "Attendre 2 à 4h filtration active avant d'ajuster le pH");
        }
    }

    // 2. pH (Gestion par plage Min - Max)
    let phStepHTML = '';
    if (!isNaN(ph) && localStorage.getItem('spa_enablePh') !== 'false') {
        if (ph > phMax) {
            const diffPh = Math.round((ph - phMax) * 10) / 10;
            actionsCount++;
            phStepHTML = renderStepWithStockCheck(2, `pH trop haut (${ph}, cible: ${phMin}-${phMax})`, 'ph_minus', 'pH-', diffPh, "Attendre 30 min à 1h avant le désinfectant");
        } else if (ph < phMin) {
            const diffPh = Math.round((phMin - ph) * 10) / 10;
            actionsCount++;
            phStepHTML = renderStepWithStockCheck(2, `pH trop bas (${ph}, cible: ${phMin}-${phMax})`, 'ph_plus', 'pH+', diffPh, "Attendre 30 min à 1h avant le désinfectant");
        }
    }

    // 3. Désinfectant (Gestion par plage Min - Max)
    let disinStepHTML = '';
    if (!isNaN(chlLibre) && localStorage.getItem('spa_enableChlLibre') !== 'false') {
        if (chlLibre < chlMin) {
            const diffChl = chlMin - chlLibre;
            actionsCount++;

            if (disinfectantType === 'sel') {
                const saltProduct = savedProducts.find(p => p.type === 'salt_electrolysis');
                if (!saltProduct || !saltProduct.m || !saltProduct.d || !saltProduct.v) {
                    disinStepHTML = `
                        <div class="treatment-step" style="border-left: 4px solid var(--danger);">
                            <div><strong>3. Désinfectant bas (${chlLibre} ppm, cible: ${chlMin}-${chlMax})</strong><br><span style="color: var(--danger);">⚠️ Produit "Électrolyseur / Sel" non configuré.</span></div>
                        </div>`;
                } else {
                    const sMass = parseFloat(saltProduct.m) || 500;
                    const sDelta = parseFloat(saltProduct.d) || 1;
                    const sHours = parseFloat(saltProduct.v) || 2;
                    const spaVol = parseFloat(localStorage.getItem('spa_vol')) || 1.5;

                    const calcSalt = Math.round((sMass / sDelta) * diffChl * spaVol);
                    const calcHours = Math.round(((sHours / sDelta) * diffChl) * 10) / 10;

                    disinStepHTML = `
                        <div class="treatment-step">
                            <input type="checkbox" checked>
                            <div><strong>3. Désinfectant bas (${chlLibre} ppm, cible: ${chlMin}-${chlMax}) - Électrolyse</strong><br>Ajouter <strong>${calcSalt}g</strong> de sel et/ou <strong>${calcHours}h</strong> de marche forcée.</div>
                        </div>`;
                }
            } else {
                let prodKey = 'chlore_choc';
                let prodName = 'Chlore / Choc';
                let waitTime = "Attendre 15 à 30 min avant la baignade";

                if (disinfectantType === 'brome') { prodKey = 'brome'; prodName = 'Brome'; waitTime = "Attendre dissolution complète"; }
                else if (disinfectantType === 'oxygene') { prodKey = 'oxygene'; prodName = 'Oxygène Actif'; waitTime = "Baignade possible après 15 min"; }

                disinStepHTML = renderStepWithStockCheck(3, `Désinfectant bas (${chlLibre} ppm, cible: ${chlMin}-${chlMax})`, prodKey, prodName, diffChl, `⏱️ ${waitTime}`);
            }
        }
    }

    stepsContainer.innerHTML = tacStepHTML + phStepHTML + disinStepHTML;

    const now = new Date().toISOString().split('T')[0];
    const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
    history.unshift({
        date: now,
        temp: isNaN(temp) ? '' : temp,
        ph: isNaN(ph) ? '' : ph,
        chlLibre: isNaN(chlLibre) ? '' : chlLibre,
        chlTotal: isNaN(chlTotal) ? '' : chlTotal,
        tac: isNaN(tac) ? '' : tac,
        stab: isNaN(stab) ? '' : stab,
        th: isNaN(th) ? '' : th,
        note: note || ''
    });
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

    const eventNote = document.getElementById('eventNote');
    if (eventNote) eventNote.value = '';
    
    ['tempVal', 'phVal', 'chlLibreVal', 'chlTotalVal', 'tacVal', 'stabVal', 'thVal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    localStorage.setItem('spa_last_steps', stepsContainer.innerHTML);
    if (banner) localStorage.setItem('spa_last_banner', banner.style.display);
    localStorage.setItem('spa_results_visible', 'block');

    const treatmentNavBtn = document.querySelectorAll('nav .nav-item')[1];
    switchPage('treatment', 'Actions & Produits', treatmentNavBtn);
}

// --- MISE À JOUR DU STOCK LORS DE LA VALIDATION DU TRAITEMENT ---
function validateAppliedTreatment() {
    const steps = document.querySelectorAll('.treatment-step');
    if (steps.length === 0) return;

    const appliedList = [];
    const stockUpdates = JSON.parse(localStorage.getItem('spa_dynamic_products') || '[]');

    steps.forEach(step => {
        const checkbox = step.querySelector('input[type="checkbox"]');
        const textDiv = step.querySelector('div');

        if (checkbox && checkbox.checked && textDiv) {
            const text = textDiv.innerText;
            appliedList.push(text.replace(/\n/g, ' - '));

            let targetType = null;
            if (text.includes('pH-')) targetType = 'ph_minus';
            else if (text.includes('pH+')) targetType = 'ph_plus';
            else if (text.includes('TAC+')) targetType = 'tac_plus';
            else if (text.includes('Brome')) targetType = 'brome';
            else if (text.includes('Oxygène')) targetType = 'oxygene';
            else if (text.includes('Chlore') || text.includes('Choc')) targetType = 'chlore_choc';
            else if (text.includes('Électrolyse') || text.includes('sel')) targetType = 'salt_electrolysis';

            if (targetType) {
                const prodConfig = stockUpdates.find(p => p.type === targetType);
                if (prodConfig) {
                    const matchDose = text.match(/Ajouter\s+(\d+(?:[,.]\d+)?)\s*(g|kg|unité|unités|pastille|pastilles|tablet|tablets|sac|sacs)/i);
                    
                    if (matchDose) {
                        const val = parseFloat(matchDose[1].replace(',', '.'));
                        const unitMentioned = matchDose[2].toLowerCase();

                        if (prodConfig.unit === 'unit' || prodConfig.unit === 'tablet') {
                            prodConfig.stock = Math.max(0, Math.round((prodConfig.stock - val) * 10) / 10);
                        } else if (prodConfig.unit === 'kg') {
                            let valInKg = val;
                            if (unitMentioned === 'g') valInKg = val / 1000;
                            prodConfig.stock = Math.max(0, Math.round((prodConfig.stock - valInKg) * 100) / 100);
                        } else { 
                            let valInGrams = val;
                            if (unitMentioned === 'kg') valInGrams = val * 1000;
                            prodConfig.stock = Math.max(0, Math.round(prodConfig.stock - valInGrams));
                        }
                    }
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

        const history = JSON.parse(localStorage.getItem('spa_history') || '[]');
        if (history.length > 0) {
            const noteText = "Traitement appliqué : " + treatmentSummary;
            history[0].note = history[0].note ? history[0].note + " | " + noteText : noteText;
            localStorage.setItem('spa_history', JSON.stringify(history));
        }

        const stepsContainer = document.getElementById('treatmentSteps');
        if (stepsContainer) stepsContainer.innerHTML = '';

        const btn = document.getElementById('validateTreatmentBtn');
        if (btn) btn.style.display = 'none';

        localStorage.setItem('spa_last_steps', '');
        localStorage.setItem('spa_treatment_validated', 'true');
        
        alert("✅ Traitement enregistré et stock mis à jour avec succès !");
    }
}

function renderTreatmentLogs() {
    const container = document.getElementById('treatmentLogsContainer');
    if (!container) return;
    const logs = JSON.parse(localStorage.getItem('spa_treatment_logs') || '[]');
    
    if (logs.length === 0) {
        container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">Aucun traitement enregistré pour le moment.</p>`;
        return;
    }

    container.innerHTML = logs.slice(0, 10).map(log => `
        <div class="treatment-log-item">
            <div><strong>${log.date}</strong><br>${log.details}</div>
        </div>
    `).join('');
}

// Exposition globale pour les gestionnaires d'événements inline du DOM
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
    installPWA
};