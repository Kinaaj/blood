/* script.js - Třísloupcový Editor pro web Blood */
// TODO: Pridelat vykricniky na to, ze je tam malo postav z kategorie X
let currentLang = 'cz';
const iconsPath = './../data/icons/';

// Stav aplikace
let activeScriptKeywords = []; // Výchozí postavy
let scriptMeta = { name: "", author: "" };

// Elementy
const metaTitleInput = document.getElementById('meta-title');
const metaAuthorInput = document.getElementById('meta-author');
const editorRolesPreview = document.getElementById('editor-roles-preview');
const searchInput = document.getElementById('search-char');
const charListContainer = document.getElementById('character-list-container');
const filterCheckboxes = document.querySelectorAll('.filter-grid input[type="checkbox"]');
const btnLang = document.getElementById('btn-lang');
const btnShare = document.getElementById('btn-share');
const btnPrint = document.getElementById('btn-print');
const btnClear = document.getElementById('btn-clear');
const btnDownloadJson = document.getElementById('btn-download-json');
const btnUploadJson = document.getElementById('btn-upload-json');
const inputUploadJson = document.getElementById('input-upload-json');
// --- INICIALIZACE ---
document.addEventListener('DOMContentLoaded', () => {
    loadScriptFromUrl();

    // Listenery pro meta informace
    if (metaTitleInput) {
        metaTitleInput.addEventListener('input', (e) => {
            scriptMeta.name = e.target.value;
            updateUrlWithScript();
        });
    }
    if (metaAuthorInput) {
        metaAuthorInput.addEventListener('input', (e) => {
            scriptMeta.author = e.target.value;
            updateUrlWithScript();
        });
    }

    // Tlačítko jazyka
    if (btnLang) {
        btnLang.addEventListener('click', () => {
            currentLang = currentLang === 'eng' ? 'cz' : 'eng';
            btnLang.textContent = currentLang === 'eng' ? '🇨🇿 Přepnout do Češtiny' : '🇬🇧 Switch to English';
            renderAll();
        });
    }

    // Tlačítko sdílení
    if (btnShare) {
        btnShare.addEventListener('click', copyShareableLink);
    }

    if (btnPrint) {
        btnPrint.addEventListener('click', printScript);
    }
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            const msg = currentLang === 'cz' ? 'Opravdu chcete smazat celý setlist?' : 'Are you sure you want to clear the entire setlist?';
            if (confirm(msg)) {
                activeScriptKeywords = [];
                renderAll();
            }
        });
    }
    // Tlačítko pro nahrání JSON souboru
    if (btnUploadJson && inputUploadJson) {
        // Kliknutí na grafické tlačítko otevře okno pro výběr souboru
        btnUploadJson.addEventListener('click', () => inputUploadJson.click());

        // Po výběru souboru spustíme načtení
        inputUploadJson.addEventListener('change', uploadScriptJson);
    }
    // Tlačítko pro stažení JSON souboru
    if (btnDownloadJson) {
        btnDownloadJson.addEventListener('click', downloadScriptJson);
    }

    // Filtry & Vyhledávání
    if (searchInput) searchInput.addEventListener('input', renderSidebar);
    if (filterCheckboxes) filterCheckboxes.forEach(cb => cb.addEventListener('change', renderSidebar));

    renderAll();
});

// --- HLAVNÍ RENDEROVÁNÍ ---
function renderAll() {
    renderSidebar();
    renderMiddleEditor();
    updateUrlWithScript();
}

// 1. LEVÝ SLOUPEC: Seznam postav k výběru
function renderSidebar() {
    if (!charListContainer) return;
    const searchText = searchInput ? searchInput.value.toLowerCase() : '';
    const activeTypes = Array.from(filterCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

    charListContainer.innerHTML = '';

    const typeOrder = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled'];

    typeOrder.forEach(type => {
        if (!activeTypes.includes(type)) return;

        // ODSTRANĚNÍ DJINNA: Odfiltrujeme Djinna, aby se nezobrazoval v nabídce
        const rolesOfType = rolesData.filter(r =>
            r.type === type &&
            r.keyword !== 'djinn' &&
            getTranslation(r, 'name').toLowerCase().includes(searchText)
        );

        if (rolesOfType.length === 0) return;

        rolesOfType.sort((a, b) => getTranslation(a, 'name').localeCompare(getTranslation(b, 'name')));

        rolesOfType.forEach(role => {
            const isActive = activeScriptKeywords.includes(role.keyword);
            const div = document.createElement('div');
            div.className = `char-item ${isActive ? 'active' : ''}`;
            div.onclick = () => toggleRole(role.keyword);

            div.innerHTML = `
                <img src="${getIconPath(role)}" onerror="this.src='${iconsPath}default.png'">
                <span>${getTranslation(role, 'name')}</span>
            `;
            charListContainer.appendChild(div);
        });
    });
}

// Přidání / Odebrání role
function toggleRole(keyword) {
    const index = activeScriptKeywords.indexOf(keyword);
    if (index > -1) {
        activeScriptKeywords.splice(index, 1);
    } else {
        activeScriptKeywords.push(keyword);
    }
    renderAll();
}

// Pomocná funkce pro tučný text v abilitách
function formatText(text) {
    if (!text) return "";
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    formatted = formatted.replace(/\[b\](.*?)\[\/b\]/g, '<b>$1</b>');
    return formatted;
}
// 2. PROSTŘEDNÍ SLOUPEC: Živý náhled v editoru
function renderMiddleEditor() {
    if (!editorRolesPreview) return;
    editorRolesPreview.innerHTML = '';

    const typeOrder = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled'];
    let hasExtraSectionsStarted = false;

    typeOrder.forEach(type => {
        const rolesInTeam = rolesData.filter(r => r.type === type && activeScriptKeywords.includes(r.keyword));
        if (rolesInTeam.length === 0) return;

        rolesInTeam.sort((a, b) => {
            const posA = a.setlist_position !== undefined ? a.setlist_position : 999;
            const posB = b.setlist_position !== undefined ? b.setlist_position : 999;
            return posA - posB;
        });
        // 1. Spočítáme postavy v týmu
        let count = rolesInTeam.length;

        // 2. Pokud generujeme Fabled (Legendy) a na skriptu jsou aktivní jinxy, přičteme 1 za automatického Djinna
        if (type === 'fabled' && typeof jinxData !== 'undefined') {
            const hasActiveJinxes = jinxData.some(j =>
                activeScriptKeywords.includes(j.who) && activeScriptKeywords.includes(j.target)
            );
            if (hasActiveJinxes) {
                count += 1;
            }
        }
        const groupDiv = document.createElement('div');

        // Přidání dělicí čáry před první extra sekci (Cestovatelé nebo Legendy)
        let extraClass = '';
        if (['traveller', 'fabled'].includes(type) && !hasExtraSectionsStarted) {
            extraClass = ' extra-divider';
            hasExtraSectionsStarted = true;
        }

        groupDiv.className = `team-group${extraClass}`;
        groupDiv.dataset.teamType = type; // Důležité pro snadné dohledání sekce Legend
        groupDiv.innerHTML = `<h3>${getTeamTitle(type)} (${count})</h3>`;

        rolesInTeam.forEach(role => {
            let jinxIconsHtml = '';
            if (typeof jinxData !== 'undefined') {
                const relevantJinxes = jinxData.filter(j => j.who === role.keyword && activeScriptKeywords.includes(j.target));
                relevantJinxes.forEach(j => {
                    const targetRole = rolesData.find(r => r.keyword === j.target);
                    if (targetRole) {
                        jinxIconsHtml += `<img src="${getIconPath(targetRole)}" class="jinx-marker-icon" title="Jinx: ${getTranslation(targetRole, 'name')}">`;
                    }
                });
            }

            const abilityHtml = formatText(getTranslation(role, 'ability'));
            let setupHtml = '';
            if (role.setup) {
                setupHtml = `<span class="setup-text"> ${getTranslation(role, 'setup_reminder')}</span>`;
            }

            const card = document.createElement('div');
            card.className = 'editor-role-item';
            card.innerHTML = `
                <img src="${getIconPath(role)}" class="editor-role-icon" onerror="this.src='${iconsPath}default.png'">
                <div class="editor-role-text">
                  <span class="editor-role-name">${getTranslation(role, 'name')} ${jinxIconsHtml}</span>
                  <span class="editor-role-ability">${abilityHtml}${setupHtml}</span>
                </div>
                <button class="editor-role-remove" onclick="toggleRole('${role.keyword}')" title="Odebrat ze skriptu">
                  <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            groupDiv.appendChild(card);
        });

        editorRolesPreview.appendChild(groupDiv);
    });

    // --- VYKRASLENÍ DJINNA DO LEGEND ---
    if (typeof jinxData !== 'undefined') {
        const activeJinxes = [];

        jinxData.forEach(j => {
            if (activeScriptKeywords.includes(j.who) && activeScriptKeywords.includes(j.target)) {
                const char1 = rolesData.find(r => r.keyword === j.who);
                const char2 = rolesData.find(r => r.keyword === j.target);

                if (char1 && char2) {
                    activeJinxes.push({
                        char1Icon: getIconPath(char1),
                        char1Name: getTranslation(char1, 'name'),
                        char2Icon: getIconPath(char2),
                        char2Name: getTranslation(char2, 'name'),
                        reasonText: getTranslation(j, 'description') || j.reason || ""
                    });
                }
            }
        });

        updateDjinnJinxes(activeJinxes, hasExtraSectionsStarted);
    }
}
// --- POMOCNÉ FUNKCE ---
function getTranslation(obj, key) {
    return obj[key + '_' + currentLang] || obj[key + '_cz'] || obj[key + '_eng'] || "";
}

function getIconPath(role) {
    return `${iconsPath}${role.type}/${role.keyword}_icon.png`;
}

function getTeamTitle(type) {
    const titles = {
        townsfolk: currentLang === 'cz' ? 'Měšťané' : 'Townsfolk',
        outsider: currentLang === 'cz' ? 'Outsideři' : 'Outsiders',
        minion: currentLang === 'cz' ? 'Přisluhovači' : 'Minions',
        demon: currentLang === 'cz' ? 'Démoni' : 'Demons',
        traveller: currentLang === 'cz' ? 'Cestovatelé' : 'Travellers',
        fabled: currentLang === 'cz' ? 'Legendy' : 'Fabled'
    };
    return titles[type] || type;
}// Pomocná funkce pro vložení Djinna přímo do Legend
function updateDjinnJinxes(activeJinxes, hasExtraSectionsStarted) {
    const existingDjinn = document.getElementById('auto-djinn-container');
    if (existingDjinn) existingDjinn.remove();

    if (!activeJinxes || activeJinxes.length === 0) return;

    // Hledáme, zda už na stránce existuje sekce pro Legendy (fabled)
    let fabledGroup = editorRolesPreview.querySelector('[data-team-type="fabled"]');

    // Pokud sekce Legend ještě neexistuje, vytvoříme ji
    if (!fabledGroup) {
        fabledGroup = document.createElement('div');
        const extraClass = !hasExtraSectionsStarted ? ' extra-divider' : '';
        fabledGroup.className = `team-group${extraClass}`;
        fabledGroup.dataset.teamType = 'fabled';
        fabledGroup.innerHTML = `<h3>${getTeamTitle('fabled')} (1)</h3>`;
        editorRolesPreview.appendChild(fabledGroup);
    }

    // Vytvoříme blok Djinna bez jakýchkoliv oddělovacích čar
    const djinnContainer = document.createElement('div');
    djinnContainer.id = 'auto-djinn-container';
    djinnContainer.className = 'djinn-section';

    let html = `
        <div class="djinn-header-item">
            <img src="${iconsPath}fabled/djinn_icon.png" class="editor-role-icon djinn-main-icon" onerror="this.src='${iconsPath}default.png'" alt="Djinn">
            <div class="djinn-header-text">
                <div class="editor-role-name">Djinn</div>
                <div class="editor-role-ability">
                    ${currentLang === 'cz'
            ? 'Použijte speciální pravidlo Djinna. Všichni hráči vědí, jaké to je.'
            : "Use the Djinn's special rule. All players know what it is."}
                </div>
            </div>
        </div>
        <div class="djinn-jinx-list">
    `;

    activeJinxes.forEach(jinx => {
        html += `
            <div class="djinn-jinx-row">
                <div class="djinn-jinx-icons">
                    <img src="${jinx.char1Icon}" class="jinx-mini-icon" title="${jinx.char1Name}">
                    <img src="${jinx.char2Icon}" class="jinx-mini-icon" title="${jinx.char2Name}">
                </div>
                <div class="djinn-jinx-text">${jinx.reasonText}</div>
            </div>
        `;
    });

    html += `</div>`;
    djinnContainer.innerHTML = html;

    // Přidáme Djinna přímo do sekce Legend
    fabledGroup.appendChild(djinnContainer);
}

// --- URL SDÍLENÍ ---
function updateUrlWithScript() {
    const payload = [{ id: "_meta", name: scriptMeta.name, author: scriptMeta.author }, ...activeScriptKeywords];
    const jsonStr = JSON.stringify(payload);
    const encoded = btoa(encodeURIComponent(jsonStr));
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('script', encoded);
    window.history.replaceState({ path: newUrl.href }, '', newUrl.href);
}

function loadScriptFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const scriptParam = urlParams.get('script');
    if (!scriptParam) return;

    try {
        const jsonStr = decodeURIComponent(atob(scriptParam));
        const parsed = JSON.parse(jsonStr);
        if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0].id === '_meta') {
            scriptMeta.name = parsed[0].name || "";
            scriptMeta.author = parsed[0].author || "";
            if (metaTitleInput) metaTitleInput.value = scriptMeta.name;
            if (metaAuthorInput) metaAuthorInput.value = scriptMeta.author;
            activeScriptKeywords = parsed.slice(1);
        } else {
            activeScriptKeywords = parsed;
        }
    } catch (e) {
        console.error("Chyba při načítání skriptu z URL", e);
    }
}

function copyShareableLink() {
    updateUrlWithScript();
    navigator.clipboard.writeText(window.location.href).then(() => {
        alert("🔗 Odkaz na skript byl zkopírován!");
    });
}

// --- LOGIKA SKROLOVÁNÍ MEZI SEKCIAMI ---
function scrollToNextSection(direction) {
    const sections = Array.from(document.querySelectorAll('.team-group'));
    if (sections.length === 0) return;

    // Najdeme sekci, která je aktuálně nejblíže hornímu okraji okna
    // (s malou tolerancí 30px pro přesnost)
    const currentIndex = sections.findIndex(sec => {
        const rect = sec.getBoundingClientRect();
        return rect.top <= 120 && rect.bottom > 120;
    });

    let targetIndex = 0;

    if (direction === 'down') {
        if (currentIndex === -1) {
            // Pokud jsme úplně nahoře, skočíme na první sekci
            targetIndex = 0;
        } else {
            // Posun na další sekci (nepřetečeme přes konec)
            targetIndex = Math.min(currentIndex + 1, sections.length - 1);
        }
    } else if (direction === 'up') {
        if (currentIndex === -1 || currentIndex === 0) {
            // Pokud jsme na první sekci nebo nad ní, skrolujeme na úplný vrch stránky
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        } else {
            // Posun na předchozí sekci
            targetIndex = Math.max(currentIndex - 1, 0);
        }
    }

    const targetSection = sections[targetIndex];
    if (targetSection) {
        // Vypočítáme přesnou cílovou pozici skrolu s rezervou pro top lištu
        const targetPosition = targetSection.getBoundingClientRect().top + window.scrollY - 10;

        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
    }
}

// Navázání event listenerů po načtení DOMu
document.addEventListener('DOMContentLoaded', () => {
    // ... tvůj stávající kód uvnitř DOMContentLoaded ...

    const btnNavUp = document.getElementById('nav-up');
    const btnNavDown = document.getElementById('nav-down');

    if (btnNavUp) {
        btnNavUp.addEventListener('click', (e) => {
            e.preventDefault();
            scrollToNextSection('up');
        });
    }

    if (btnNavDown) {
        btnNavDown.addEventListener('click', (e) => {
            e.preventDefault();
            scrollToNextSection('down');
        });
    }
});
function formatReminderText(text) {
    if (!text) return "";
    const iconHtml = '<i class="fa-solid fa-circle reminder-token"></i>';
    return formatText(text.replaceAll("{reminder_token}", iconHtml));
}
// --- FUNKCE PRO VYTISKNUTÍ PŮVODNÍHO LAYOUTU ---
function printScript() {
    const printArea = document.getElementById('print-area');
    if (!printArea) return;

    // 1. Zcela přesná původní HTML šablona vložená do print-area
    printArea.innerHTML = `
        <section class="sheet" id="print-page-roles">
            <header class="script-header">
                <h1 id="print-script-title"></h1>
                <div class="script-author-line" id="print-author-line">by <span id="print-script-author"></span></div>
            </header>

            <div class="role-section"><h2 class="team-title" id="print-townsfolk_heading"></h2><div id="print-list-townsfolk" class="role-grid"></div></div>
            <div class="role-section"><h2 class="team-title" id="print-outsider_heading"></h2><div id="print-list-outsider" class="role-grid"></div></div>
            <div class="role-section"><h2 class="team-title" id="print-minion_heading"></h2><div id="print-list-minion" class="role-grid"></div></div>
            <div class="role-section"><h2 class="team-title" id="print-demon_heading"></h2><div id="print-list-demon" class="role-grid"></div></div>
            <div class="sheet-footer"><div class="footer-disclaimer" id="print-disclaimer_text"></div></div>
        </section>

        <section class="sheet" id="print-page-travellers">
            <h1 class="team-title notmain" id="print-fabled_and_loric_heading"></h1>
            <div class="role-list" id="print-list-fabled"></div>
            <div class="role-list" id="print-list-loric"></div>

            <h1 class="team-title notmain" id="print-traveller_heading"></h1>
            <div class="role-list" id="print-list-traveller"></div>

            <div id="print-jinx-section" class="jinx-box"><div id="print-list-jinx"></div></div>

            <div class="setup-table-container" id="print-setup-table">
                <table class="setup-table">
                    <thead>
                        <tr><th id="print-players_heading"></th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th><th>13</th><th>14</th><th>15+</th></tr>
                    </thead>
                    <tbody>
                        <tr class="row-townsfolk"><td id="print-table-townsfolk"></td><td>3</td><td>3</td><td>5</td><td>5</td><td>5</td><td>7</td><td>7</td><td>7</td><td>9</td><td>9</td><td>9</td></tr>
                        <tr class="row-outsider"><td id="print-table-outsider"></td><td>0</td><td>1</td><td>0</td><td>1</td><td>2</td><td>0</td><td>1</td><td>2</td><td>0</td><td>1</td><td>2</td></tr>
                        <tr class="row-minion"><td id="print-table-minion"></td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>2</td><td>2</td><td>2</td><td>3</td><td>3</td><td>3</td></tr>
                        <tr class="row-demon"><td id="print-table-demon"></td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td><td>1</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="sheet-footer"><div class="footer-script-name print-footer-name"></div></div>
        </section>

        <section class="sheet" id="print-page-first-night">
            <header class="script-header" style="margin-bottom: 0; justify-content: center;"><h1 id="print-firstnight_heading"></h1></header>
            <div class="night-list" id="print-list-first-night"></div>
            <div class="sheet-footer"><div class="footer-script-name print-footer-name"></div></div>
        </section>

        <section class="sheet" id="print-page-other-night">
            <header class="script-header" style="margin-bottom: 0; justify-content: center;"><h1 id="print-othernight_heading"></h1></header>
            <div class="night-list" id="print-list-other-night"></div>
            <div class="sheet-footer"><div class="footer-script-name print-footer-name"></div></div>
        </section>
    `;

    // 2. Naplnění metadat a skrytí prázdného "by", pokud není autor
    const scriptName = scriptMeta.name || "";
    document.getElementById('print-script-title').textContent = scriptName;
    document.querySelectorAll('.print-footer-name').forEach(el => el.textContent = scriptName);

    const authorLine = document.getElementById('print-author-line');
    if (scriptMeta.author) {
        document.getElementById('print-script-author').textContent = scriptMeta.author;
        authorLine.style.display = '';
    } else {
        authorLine.style.display = 'none'; // Opravuje chybu s visícím slovem "by"
    }

    // 3. Původní slovník a nadpisy
    const localHeadings = {
        "disclaimer_cz": "* Ne první noc", "disclaimer_eng": "* Not the first night",
        "outsider_eng": "Outsiders", "outsider_cz": "Outsideři",
        "townsfolk_eng": "Townsfolk", "townsfolk_cz": "Měšťané",
        "minion_eng": "Minions", "minion_cz": "Přisluhovači",
        "demon_eng": "Demons", "demon_cz": "Démoni",
        "traveller_cz": "Cestovatelé", "traveller_eng": "Travellers",
        "firstnight_cz": "První Noc", "firstnight_eng": "First Night",
        "othernight_cz": "Ostatní Noci", "othernight_eng": "Other Nights",
        "players_cz": "Hráčů", "players_eng": "Players",
        "fabled_and_loric_eng": "Fabled & Loric", "fabled_and_loric_cz": "Legendy a Loričtí"
    };
    const getHeading = (key) => localHeadings[key + '_' + currentLang] || localHeadings[key + '_cz'];

    document.getElementById('print-disclaimer_text').textContent = getHeading('disclaimer');
    ['townsfolk', 'outsider', 'minion', 'demon', 'fabled_and_loric', 'traveller', 'firstnight', 'othernight', 'players'].forEach(key => {
        const el = document.getElementById(`print-${key}_heading`);
        if (el) el.textContent = getHeading(key);
    });
    ['townsfolk', 'outsider', 'minion', 'demon'].forEach(key => {
        document.getElementById(`print-table-${key}`).textContent = getHeading(key);
    });

    // 4. Přesná kopie tvé původní funkce createRoleCard pro tisk
    function createOriginalRoleCard(role) {
        const name = getTranslation(role, 'name');
        const ability = formatText(getTranslation(role, 'ability'));
        const iconSrc = getIconPath(role);
        let setupHTML = role.setup ? `<span class="setup-text"> ${getTranslation(role, 'setup_reminder')}</span>` : '';
        let jinxIconsHtml = '';
        if (typeof jinxData !== 'undefined') {
            const relevantJinxes = jinxData.filter(j => j.who === role.keyword && activeScriptKeywords.includes(j.target));
            relevantJinxes.forEach(j => {
                const targetRole = rolesData.find(r => r.keyword === j.target);
                if (targetRole) jinxIconsHtml += `<img src="${getIconPath(targetRole)}" class="jinx-marker-icon">`;
            });
        }
        return `
        <div class="role-item ${role.type}">
            <img src="${iconSrc}" class="role-icon" onerror="this.src='${iconsPath}default.png'">
            <div class="role-text"><span class="role-name">${name}${jinxIconsHtml}</span><span class="role-ability">${ability}${setupHTML}</span></div>
        </div>`;
    }

    // 5. Třídění a dosazení rolí do DOMu
    const activeRoles = rolesData.filter(r => activeScriptKeywords.includes(r.keyword));
    activeRoles.sort((a, b) => (a.setlist_position !== undefined ? a.setlist_position : 999) - (b.setlist_position !== undefined ? b.setlist_position : 999));

    let djinnIsActive = false;
    activeRoles.forEach(role => {
        const type = role.type ? role.type.toLowerCase() : 'unknown';
        const container = document.getElementById(`print-list-${type}`);
        if (container) container.innerHTML += createOriginalRoleCard(role);
    });

    // 6. Djinn a Jinx list (přesná kopie původní logiky)
    const listFabled = document.getElementById('print-list-fabled');
    if (typeof jinxData !== 'undefined') {
        const activeJinxes = jinxData.filter(jinx => activeScriptKeywords.includes(jinx.who) && activeScriptKeywords.includes(jinx.target));
        if (activeJinxes.length > 0) {
            const djinnRole = rolesData.find(r => r.keyword === 'djinn');
            if (djinnRole) {
                djinnIsActive = true;
                listFabled.innerHTML += createOriginalRoleCard(djinnRole);
                let jinxRowsHtml = '';
                activeJinxes.forEach(jinx => {
                    const desc = getTranslation(jinx, 'description') || jinx.reason || "";
                    const char1 = rolesData.find(r => r.keyword === jinx.who);
                    const char2 = rolesData.find(r => r.keyword === jinx.target);
                    const icon1 = char1 ? getIconPath(char1) : `${iconsPath}default.png`;
                    const icon2 = char2 ? getIconPath(char2) : `${iconsPath}default.png`;
                    jinxRowsHtml += `
                        <div class="jinx-item">
                            <div class="jinx-icons-wrapper"><img src="${icon1}" class="jinx-icon"><img src="${icon2}" class="jinx-icon"></div>
                            <div class="jinx-text">${desc}</div>
                        </div>`;
                });
                listFabled.innerHTML += `<div class="djinn-jinx-container">${jinxRowsHtml}</div>`;
            }
        }
    }

    // Skrytí nadpisů Legend a Cestovatelů
    const hasTraveller = activeRoles.some(r => r.type === 'traveller');
    document.getElementById('print-traveller_heading').style.display = hasTraveller ? '' : 'none';
    const hasFabledOrLoric = activeRoles.some(r => r.type === 'fabled' || r.type === 'loric');
    document.getElementById('print-fabled_and_loric_heading').style.display = (hasFabledOrLoric || djinnIsActive) ? '' : 'none';

    // 7. Noční listy (přesná kopie)
    function fillNightSheet(isFirstNight) {
        const container = document.getElementById(isFirstNight ? 'print-list-first-night' : 'print-list-other-night');
        let nightRoles = activeRoles.filter(r => (isFirstNight ? r.first_night_position : r.other_night_position) > 0);
        rolesData.filter(r => r.type === 'special').forEach(sp => {
            const pos = isFirstNight ? sp.first_night_position : sp.other_night_position;
            if (pos && pos > 0 && !nightRoles.includes(sp)) nightRoles.push(sp);
        });
        nightRoles.sort((a, b) => (isFirstNight ? a.first_night_position : a.other_night_position) - (isFirstNight ? b.first_night_position : b.other_night_position));

        nightRoles.forEach(item => {
            const name = getTranslation(item, 'name');
            const reminder = isFirstNight ? getTranslation(item, 'first_night_reminder') : getTranslation(item, 'other_night_reminder');
            const iconSrc = getIconPath(item);
            const special_class = item.type === "special" ? "special-icon" : "";
            container.innerHTML += `
            <div class="night-item">
                <img src="${iconSrc}" class="role-icon ${special_class}" onerror="this.src='${iconsPath}default.png'">
                <div class="night-text ${item.type}"><span class="role-name">${name}</span><span class="role-reminder">${formatReminderText(reminder)}</span></div>
            </div>`;
        });
    }
    fillNightSheet(true);
    fillNightSheet(false);

    // 8. Respektování checkboxů v UI
    const chkSetup = document.getElementById('chk-setup-table');
    if (chkSetup && !chkSetup.checked) document.getElementById('print-setup-table').style.display = 'none';

    const chkTravellers = document.getElementById('chk-show-travellers');
    if (chkTravellers && !chkTravellers.checked) document.getElementById('print-page-travellers').style.display = 'none';

    const chkNight = document.getElementById('chk-show-night');
    if (chkNight && !chkNight.checked) {
        document.getElementById('print-page-first-night').style.display = 'none';
        document.getElementById('print-page-other-night').style.display = 'none';
    }

    // KONEČNĚ: Vyvolání tisku (s malým zpožděním kvůli načtení DOMu)
    setTimeout(() => window.print(), 100);
}
// 2. Systémová ochrana pro náhodný refresh (F5) nebo zavření karty
window.addEventListener('beforeunload', (e) => {
    if (activeScriptKeywords && activeScriptKeywords.length > 0) {
        const msg = currentLang === 'cz'
            ? 'Máš rozpracovaný skript. Opravdu chceš odejít? Pokud si neuložíš soubor nebo nezkopíruješ odkaz, skript bude ztracen!'
            : 'You have an unsaved script. Are you sure you want to leave? If you do not save the file or copy the link, the script will be lost!';

        e.preventDefault();
        e.returnValue = msg; // Nastavení tvojí hlášky
        return msg;
    }
});

// --- STAŽENÍ SKRIPTU VE FORMÁTU JSON ---
function downloadScriptJson() {
    if (!activeScriptKeywords || activeScriptKeywords.length === 0) {
        alert(currentLang === 'cz' ? 'Skript je prázdný, není co uložit!' : 'The script is empty, nothing to save!');
        return;
    }

    // Sestavení přesného formátu: na indexu 0 objekt _meta, pak pole stringů
    const payload = [
        {
            id: "_meta",
            author: scriptMeta.author || "Neznámý",
            name: scriptMeta.name || "Bez Názvu"
        },
        ...activeScriptKeywords
    ];

    const jsonString = JSON.stringify(payload, null, 4);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // Vytvoření dynamického odkazu ke stažení
    const a = document.createElement('a');
    a.href = url;

    // Název souboru podle názvu skriptu
    const fileName = (scriptMeta.name || "skript").toLowerCase().replace(/[^a-z0-9]/gi, '_');
    a.download = `${fileName}.json`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- NAHRÁNÍ SKRIPTU ZE SOUBORU JSON ---
function uploadScriptJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Pokud je skript rozpracovaný, zkontrolujeme, zda ho uživatel chce přepsat
    if (activeScriptKeywords.length > 0) {
        const confirmMsg = currentLang === 'cz'
            ? 'Nahraním nového skriptu přepíšete váš stávající. Chcete pokračovat?'
            : 'Uploading a new script will overwrite your current one. Continue?';

        if (!confirm(confirmMsg)) {
            inputUploadJson.value = ''; // Vynulujeme výběr
            return;
        }
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);

            if (!Array.isArray(parsed)) {
                throw new Error("Neznámý formát JSON souboru.");
            }

            // 1. Načtení metadat (první prvek v poli)
            if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0].id === '_meta') {
                scriptMeta.name = parsed[0].name || "";
                scriptMeta.author = parsed[0].author || "";

                if (metaTitleInput) metaTitleInput.value = scriptMeta.name;
                if (metaAuthorInput) metaAuthorInput.value = scriptMeta.author;

                // Zbytek pole jsou klíčová slova rolí
                activeScriptKeywords = parsed.slice(1).filter(item => typeof item === 'string');
            } else {
                // Pokud _meta chybí, všechna pole bereme jako klíčová slova rolí
                activeScriptKeywords = parsed.filter(item => typeof item === 'string');
            }

            // 2. Překreslení celého editoru a aktualizace URL
            renderAll();

        } catch (err) {
            console.error("Chyba při zpracování JSON:", err);
            alert(currentLang === 'cz'
                ? 'Chyba při načítání souboru! Zkontrolujte, zda jde o platný JSON skriptu.'
                : 'Error loading file! Make sure it is a valid script JSON.');
        } finally {
            inputUploadJson.value = ''; // Vyčištění inputu pro možnost opakového nahrání stejného souboru
        }
    };

    reader.readAsText(file);
}