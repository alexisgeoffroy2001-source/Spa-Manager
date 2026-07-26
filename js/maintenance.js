import { saveSettingsAndInventory } from './storage.js';

export const predefinedTasks = [
    { id: 'filter', name: 'Nettoyage du filtre', intervalDays: 14 },
    { id: 'drain', name: 'Vidange d\'eau', intervalDays: 90 },
    { id: 'shock', name: 'Traitement choc', intervalDays: 30 },
    { id: 'jets', name: 'Désinfection des canalisations (Purge)', intervalDays: 180 },
    { id: 'headrests', name: 'Nettoyage des appuie-têtes', intervalDays: 30 },
    { id: 'cover', name: 'Entretien de la couverture (Savon doux)', intervalDays: 60 }
];

export function getMaintenanceTasks() {
    const saved = localStorage.getItem('spa_maintenance');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error("Erreur de lecture du JSON de maintenance", e);
        }
    }
    return [
        { name: 'Nettoyage du filtre', enabled: true, intervalDays: 14, lastDone: null },
        { name: 'Vidange d\'eau', enabled: true, intervalDays: 90, lastDone: null }
    ];
}

export function renderMaintenanceTaskList() {
    const tasks = getMaintenanceTasks();
    const container = document.getElementById('maintenanceContainer');
    if (!container) return;
    
    container.innerHTML = '';
    const now = new Date().getTime();

    if (tasks.length === 0) {
        container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin: 15px 0;">Aucune tâche d'entretien configurée.</p>`;
        return;
    }

    const cardsHTML = tasks.map((task, index) => {
        let statusHTML = `<span class="task-info">Suivi désactivé</span>`;
        if (task.enabled) {
            if (task.lastDone) {
                const daysSince = Math.floor((now - task.lastDone) / (1000 * 60 * 60 * 24));
                const daysLeft = task.intervalDays - daysSince;
                if (daysLeft <= 0) {
                    statusHTML = `<span class="task-info task-due">⚠️ À effectuer (En retard de ${Math.abs(daysLeft)} j)</span>`;
                } else {
                    statusHTML = `<span class="task-info task-ok">✅ Fait (Prochain dans ${daysLeft} j)</span>`;
                }
            } else {
                statusHTML = `<span class="task-info task-due">⚠️ Jamais effectué</span>`;
            }
        }

        return `
            <div class="task-card" data-index="${index}" data-lastdone="${task.lastDone || ''}">
                <div class="task-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label class="task-title" style="display: flex; align-items: center; gap: 8px; flex: 1; margin: 0;">
                        <input type="checkbox" class="task-en" ${task.enabled ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--primary);"> 
                        <input type="text" class="task-name" value="${task.name}" placeholder="Nom de la tâche" style="font-weight: 600; padding: 6px 10px; font-size: 0.9rem;">
                    </label>
                    <button type="button" class="btn-danger task-delete-btn" style="width: auto; padding: 6px 10px; margin: 0; font-size: 0.8rem;">❌</button>
                </div>
                ${statusHTML}
                <div class="grid" style="align-items: end; margin-top: 8px;">
                    <div class="form-group" style="margin:0;">
                        <label>Intervalle (Jours)</label>
                        <input type="number" inputmode="decimal" class="task-int" value="${task.intervalDays}" min="1">
                    </div>
                    <button type="button" class="btn-success task-complete-btn" ${!task.enabled ? 'disabled' : ''}>Marquer Fait</button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHTML;

    // --- MISE EN PLACE DES ÉCOUTEURS D'ÉVÉNEMENTS DYNAMIQUES SUR LES CARTES ---
    container.querySelectorAll('.task-card').forEach((card, index) => {
        const checkboxEn = card.querySelector('.task-en');
        const inputName = card.querySelector('.task-name');
        const inputInt = card.querySelector('.task-int');
        const deleteBtn = card.querySelector('.task-delete-btn');
        const completeBtn = card.querySelector('.task-complete-btn');

        if (checkboxEn) checkboxEn.addEventListener('change', saveMaintenanceTasksFromDOM);
        if (inputName) inputName.addEventListener('change', saveMaintenanceTasksFromDOM);
        if (inputInt) inputInt.addEventListener('change', saveMaintenanceTasksFromDOM);

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                card.remove();
                saveMaintenanceTasksFromDOM();
            });
        }

        if (completeBtn) {
            completeBtn.addEventListener('click', () => {
                markMaintenanceTaskAsCompleted(index);
            });
        }
    });
}

export function appendNewTaskToStorage(taskData = null) {
    const tasks = getMaintenanceTasks();
    tasks.push({
        name: taskData?.name || 'Nouvelle tâche',
        enabled: taskData?.enabled ?? true,
        intervalDays: taskData?.intervalDays || 14,
        lastDone: taskData?.lastDone || null
    });
    localStorage.setItem('spa_maintenance', JSON.stringify(tasks));
    renderMaintenanceTaskList();
}

export function displayAddTaskModal() {
    let modalOverlay = document.getElementById('taskModalOverlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'taskModalOverlay';
        modalOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 1000; display: flex;
            align-items: center; justify-content: center; padding: 16px;
            backdrop-filter: blur(4px);
        `;

        const optionsHtml = predefinedTasks.map((pt, idx) => 
            `<option value="${idx}">${pt.name} (Tous les ${pt.intervalDays}j)</option>`
        ).join('');

        modalOverlay.innerHTML = `
            <div style="background: var(--card); border-radius: var(--radius); padding: 20px; width: 100%; max-width: 400px; border: 1px solid var(--border-card); box-shadow: var(--shadow);">
                <h3 style="margin-top: 0; font-size: 1.1rem; color: var(--text);">Ajouter une tâche</h3>
                
                <div class="form-group">
                    <label for="modalTaskPreset">Modèle prédéfini</label>
                    <select id="modalTaskPreset">
                        <option value="custom">-- Tâche personnalisée --</option>
                        ${optionsHtml}
                    </select>
                </div>

                <div class="form-group">
                    <label for="modalTaskName">Intitulé de la tâche</label>
                    <input type="text" id="modalTaskName" placeholder="Ex: Nettoyer la ligne d'eau">
                </div>

                <div class="form-group">
                    <label for="modalTaskInterval">Fréquence (en jours)</label>
                    <input type="number" id="modalTaskInterval" value="14" min="1">
                </div>

                <div style="display: flex; gap: 8px; margin-top: 16px;">
                    <button class="btn-secondary" type="button" id="modalCancelBtn">Annuler</button>
                    <button type="button" id="modalAddBtn">Ajouter</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        // --- ECOUTEURS POUR LA MODALE ---
        document.getElementById('modalTaskPreset').addEventListener('change', handleMaintenancePresetSelection);
        document.getElementById('modalCancelBtn').addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
        document.getElementById('modalAddBtn').addEventListener('click', validateAndAddNewTask);
    } else {
        document.getElementById('modalTaskName').value = '';
        document.getElementById('modalTaskInterval').value = '14';
        document.getElementById('modalTaskPreset').value = 'custom';
        modalOverlay.style.display = 'flex';
    }
}

export function handleMaintenancePresetSelection() {
    const presetVal = document.getElementById('modalTaskPreset').value;
    const nameInput = document.getElementById('modalTaskName');
    const intInput = document.getElementById('modalTaskInterval');

    if (presetVal !== 'custom') {
        const taskObj = predefinedTasks[presetVal];
        if (taskObj) {
            nameInput.value = taskObj.name;
            intInput.value = taskObj.intervalDays;
        }
    } else {
        nameInput.value = '';
        intInput.value = '14';
    }
}

export function validateAndAddNewTask() {
    const nameInput = document.getElementById('modalTaskName');
    const intInput = document.getElementById('modalTaskInterval');

    const name = nameInput.value.trim();
    const intervalDays = parseInt(intInput.value, 10) || 14;

    if (!name) {
        alert("Veuillez saisir un intitulé pour la tâche.");
        return;
    }

    appendNewTaskToStorage({ name, enabled: true, intervalDays, lastDone: null });
    document.getElementById('taskModalOverlay').style.display = 'none';
}

export function saveMaintenanceTasksFromDOM() {
    const taskCards = document.querySelectorAll('#maintenanceContainer .task-card');
    const existingTasks = getMaintenanceTasks();
    const tasks = [];
    
    taskCards.forEach((card, index) => {
        const nameEl = card.querySelector('.task-name');
        const enEl = card.querySelector('.task-en');
        const intEl = card.querySelector('.task-int');
        
        if (nameEl && enEl && intEl) {
            const rawLastDone = card.dataset.lastdone;
            const lastDone = rawLastDone ? parseInt(rawLastDone, 10) : existingTasks[index]?.lastDone || null;

            tasks.push({
                name: nameEl.value,
                enabled: enEl.checked,
                intervalDays: parseInt(intEl.value, 10) || 1,
                lastDone
            });
        }
    });

    localStorage.setItem('spa_maintenance', JSON.stringify(tasks));
    renderMaintenanceTaskList();
}

export function markMaintenanceTaskAsCompleted(index) {
    const tasks = getMaintenanceTasks();
    if (tasks[index]) {
        tasks[index].lastDone = new Date().getTime();
        localStorage.setItem('spa_maintenance', JSON.stringify(tasks));
        renderMaintenanceTaskList();
    }
}

export function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert("Ce navigateur ne supporte pas les notifications.");
        return;
    }
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            alert("Notifications activées avec succès !");
            evaluateAndTriggerMaintenanceAlerts(true);
        } else {
            alert("Permission refusée pour les notifications.");
        }
    });
}

export function evaluateAndTriggerMaintenanceAlerts(forceTest = false) {
    const tasks = getMaintenanceTasks();
    const now = new Date().getTime();
    
    tasks.forEach(task => {
        if (task.enabled) {
            const daysSince = task.lastDone ? Math.floor((now - task.lastDone) / (1000 * 60 * 60 * 24)) : Infinity;
            const daysLeft = task.intervalDays - daysSince;
            
            if (daysLeft <= 0 || forceTest) {
                if (Notification.permission === 'granted') {
                    new Notification("Spa Manager - Entretien requis", {
                        body: `La tâche "${task.name}" nécessite votre attention !`
                    });
                }
            }
        }
    });
}