/* scripts-list.js - Dynamické načítání, filtrování a renderování uložených skriptů */

let allLoadedScripts = [];
let selectedRoleKeywords = new Set();
let modalCategoryFilter = 'all';
let modalSearchQuery = '';
let showAbilitiesInModal = false;

// Intervalové hodnoty obtížností (1-5)
let storytellerMinDiff = 1;
let storytellerMaxDiff = 5;
let playerMinDiff = 1;
let playerMaxDiff = 5;

// Helper function for diacritics-insensitive text search (ignoring accents, case, and extra whitespace)
function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getRomanNumeral(num) {
  if (!num && num !== 0) return '';
  const val = parseInt(num, 10);
  if (isNaN(val)) return String(num);
  const romanMap = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let result = '';
  let n = val;
  for (const [v, r] of romanMap) {
    while (n >= v) {
      result += r;
      n -= v;
    }
  }
  return result || String(num);
}

document.addEventListener('DOMContentLoaded', () => {
  loadAllScripts();
});

async function loadAllScripts() {
  const container = document.getElementById('scripts-grid-container');
  if (!container) return;

  try {
    const indexResponse = await fetch('./data/saved-scripts/index.json');
    if (!indexResponse.ok) {
      throw new Error(`Nepodařilo se načíst index skriptů (${indexResponse.status})`);
    }

    const scriptFiles = await indexResponse.json();
    if (!Array.isArray(scriptFiles) || scriptFiles.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: #888; padding: 40px;">
          <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 15px;"></i>
          <p>Zatím nebyly nalezeny žádné skripty ve složce saved-scripts.</p>
        </div>
      `;
      return;
    }

    const scriptPromises = scriptFiles.map(async (filename) => {
      try {
        const res = await fetch(`./data/saved-scripts/${filename}`);
        if (!res.ok) return null;
        const data = await res.json();

        let meta = { name: "Bez Názvu", author: "Neznámý", description: "", difficulty_storyteller: 1, difficulty_player: 1, preview_characters: [] };
        let characterKeywords = [];

        if (Array.isArray(data)) {
          const metaObj = data.find(item => typeof item === 'object' && item.id === '_meta');
          if (metaObj) {
            meta = { ...meta, ...metaObj };
          }
          characterKeywords = data.filter(item => typeof item === 'string').map(k => k.toLowerCase().trim());
        }

        return { filename, data, meta, characterKeywords };
      } catch (err) {
        console.error(`Chyba při načítání ${filename}:`, err);
        return null;
      }
    });

    allLoadedScripts = (await Promise.all(scriptPromises)).filter(Boolean);

    initFilterEventListeners();
    initDualRangeSliders();
    initRoleFilterModal();
    applyFiltersAndRender();

  } catch (error) {
    console.error("Chyba při načítání seznamu skriptů:", error);
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: #e74c3c; padding: 30px;">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 2.5rem; margin-bottom: 15px;"></i>
        <p>Nepodařilo se načíst skripty. Zkontrolujte připojení nebo složku saved-scripts.</p>
      </div>
    `;
  }
}

function initFilterEventListeners() {
  const nameInput = document.getElementById('filter-name-input');
  const clearNameBtn = document.getElementById('clear-name-btn');
  const authorInput = document.getElementById('filter-author-input');
  const clearAuthorBtn = document.getElementById('clear-author-btn');
  const resetBtn = document.getElementById('reset-filters-btn');

  function bindInput(input, clearBtn) {
    if (!input) return;
    input.addEventListener('input', () => {
      if (clearBtn) {
        clearBtn.style.display = input.value.length > 0 ? 'block' : 'none';
      }
      applyFiltersAndRender();
    });
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        applyFiltersAndRender();
      });
    }
  }

  bindInput(nameInput, clearNameBtn);
  bindInput(authorInput, clearAuthorBtn);

  const toggleCompactBtn = document.getElementById('toggle-compact-scripts-btn');
  let isCompactView = false;

  if (toggleCompactBtn) {
    toggleCompactBtn.addEventListener('click', () => {
      isCompactView = !isCompactView;
      const container = document.getElementById('scripts-grid-container');
      if (container) {
        if (isCompactView) {
          container.classList.add('compact-scripts-view');
          toggleCompactBtn.classList.add('active');
          toggleCompactBtn.innerHTML = `<i class="fa-solid fa-grip"></i> Karty`;
          toggleCompactBtn.title = "Přepnout na detailní zobrazení karet";
        } else {
          container.classList.remove('compact-scripts-view');
          toggleCompactBtn.classList.remove('active');
          toggleCompactBtn.innerHTML = `<i class="fa-solid fa-list-ul"></i> Kompaktní`;
          toggleCompactBtn.title = "Přepnout na kompaktní zobrazení";
        }
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (nameInput) nameInput.value = '';
      if (clearNameBtn) clearNameBtn.style.display = 'none';
      if (authorInput) authorInput.value = '';
      if (clearAuthorBtn) clearAuthorBtn.style.display = 'none';

      // Reset posuvníků
      const stMin = document.getElementById('st-min-range');
      const stMax = document.getElementById('st-max-range');
      const plMin = document.getElementById('pl-min-range');
      const plMax = document.getElementById('pl-max-range');

      if (stMin) stMin.value = 1;
      if (stMax) stMax.value = 5;
      if (plMin) plMin.value = 1;
      if (plMax) plMax.value = 5;

      storytellerMinDiff = 1;
      storytellerMaxDiff = 5;
      playerMinDiff = 1;
      playerMaxDiff = 5;

      const stValBadge = document.getElementById('st-diff-val');
      const stHighlight = document.getElementById('st-slider-highlight');
      if (stValBadge) stValBadge.textContent = '1 - 5';
      if (stHighlight) { stHighlight.style.left = '0%'; stHighlight.style.width = '100%'; }

      const plValBadge = document.getElementById('pl-diff-val');
      const plHighlight = document.getElementById('pl-slider-highlight');
      if (plValBadge) plValBadge.textContent = '1 - 5';
      if (plHighlight) { plHighlight.style.left = '0%'; plHighlight.style.width = '100%'; }

      selectedRoleKeywords.clear();
      updateRoleFilterModalUI();
      applyFiltersAndRender();
    });
  }
}

function initDualRangeSliders() {
  const stMin = document.getElementById('st-min-range');
  const stMax = document.getElementById('st-max-range');
  const stValBadge = document.getElementById('st-diff-val');
  const stHighlight = document.getElementById('st-slider-highlight');

  const plMin = document.getElementById('pl-min-range');
  const plMax = document.getElementById('pl-max-range');
  const plValBadge = document.getElementById('pl-diff-val');
  const plHighlight = document.getElementById('pl-slider-highlight');

  function updateSliderUI(minEl, maxEl, badgeEl, highlightEl, setMinFn, setMaxFn) {
    let minVal = parseInt(minEl.value, 10);
    let maxVal = parseInt(maxEl.value, 10);

    if (minVal > maxVal) {
      if (document.activeElement === minEl) {
        maxEl.value = minVal;
        maxVal = minVal;
      } else {
        minEl.value = maxVal;
        minVal = maxVal;
      }
    }

    setMinFn(minVal);
    setMaxFn(maxVal);

    if (badgeEl) {
      badgeEl.textContent = `${minVal} - ${maxVal}`;
    }

    if (highlightEl) {
      const leftPercent = ((minVal - 1) / 4) * 100;
      const widthPercent = ((maxVal - minVal) / 4) * 100;
      highlightEl.style.left = `${leftPercent}%`;
      highlightEl.style.width = `${widthPercent}%`;
    }

    applyFiltersAndRender();
  }

  if (stMin && stMax) {
    const updateST = () => updateSliderUI(stMin, stMax, stValBadge, stHighlight, val => storytellerMinDiff = val, val => storytellerMaxDiff = val);
    stMin.addEventListener('input', updateST);
    stMax.addEventListener('input', updateST);
    updateST();
  }

  if (plMin && plMax) {
    const updatePL = () => updateSliderUI(plMin, plMax, plValBadge, plHighlight, val => playerMinDiff = val, val => playerMaxDiff = val);
    plMin.addEventListener('input', updatePL);
    plMax.addEventListener('input', updatePL);
    updatePL();
  }
}

function initRoleFilterModal() {
  const toggleModalBtn = document.getElementById('toggle-role-modal-btn');
  const closeModalBtn = document.getElementById('close-role-modal-btn');
  const applyModalBtn = document.getElementById('apply-role-modal-btn');
  const modalOverlay = document.getElementById('role-filter-modal');
  const searchInput = document.getElementById('modal-role-search');
  const catChips = document.querySelectorAll('.role-modal-categories .cat-filter-chip');
  const abilitiesCheckbox = document.getElementById('toggle-show-abilities');
  const clearRolesBtn = document.getElementById('clear-selected-roles-btn');

  if (toggleModalBtn && modalOverlay) {
    toggleModalBtn.addEventListener('click', () => {
      modalOverlay.classList.add('active');
      renderModalRolesList();
    });
  }

  const closeModal = () => {
    if (modalOverlay) modalOverlay.classList.remove('active');
  };

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (applyModalBtn) applyModalBtn.addEventListener('click', closeModal);

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      modalSearchQuery = e.target.value.toLowerCase().trim();
      renderModalRolesList();
    });
  }

  catChips.forEach(chip => {
    chip.addEventListener('click', () => {
      catChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      modalCategoryFilter = chip.dataset.type || 'all';
      renderModalRolesList();
    });
  });

  if (abilitiesCheckbox) {
    abilitiesCheckbox.addEventListener('change', (e) => {
      showAbilitiesInModal = e.target.checked;
      renderModalRolesList();
    });
  }

  if (clearRolesBtn) {
    clearRolesBtn.addEventListener('click', () => {
      selectedRoleKeywords.clear();
      updateRoleFilterModalUI();
      applyFiltersAndRender();
    });
  }

  renderModalRolesList();
}

function renderModalRolesList() {
  const container = document.getElementById('modal-roles-list');
  if (!container || typeof rolesData === 'undefined' || !Array.isArray(rolesData)) return;

  if (showAbilitiesInModal) {
    container.classList.remove('compact-view');
    container.classList.add('full-view');
  } else {
    container.classList.remove('full-view');
    container.classList.add('compact-view');
  }

  const filteredRoles = rolesData.filter(role => {
    const rType = (role.type || 'townsfolk').toLowerCase();
    const rEd = String(role.edition || '').toLowerCase();
    const kw = (role.keyword || '').toLowerCase();

    // Skip special markers and non-playable roles
    if (rType === 'special' || rEd === 'special' || rEd === '0' || kw === 'djinn' || kw === 'dusk' || kw === 'dawn' || kw === 'demoninfo' || kw === 'minioninfo') {
      return false;
    }

    if (modalCategoryFilter !== 'all' && rType !== modalCategoryFilter) {
      return false;
    }

    if (modalSearchQuery) {
      const cz = normalizeText(role.name_cz);
      const eng = normalizeText(role.name_eng);
      const normKw = normalizeText(role.keyword);
      return cz.includes(modalSearchQuery) || eng.includes(modalSearchQuery) || normKw.includes(modalSearchQuery);
    }

    return true;
  });

  const typeRank = {
    townsfolk: 1,
    outsider: 2,
    minion: 3,
    demon: 4,
    traveller: 5,
    fabled: 6
  };

  filteredRoles.sort((a, b) => {
    const typeA = (a.type || 'townsfolk').toLowerCase();
    const typeB = (b.type || 'townsfolk').toLowerCase();
    const rankA = typeRank[typeA] || 99;
    const rankB = typeRank[typeB] || 99;

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    const nameA = a.name_cz || a.name_eng || a.keyword;
    const nameB = b.name_cz || b.name_eng || b.keyword;
    return nameA.localeCompare(nameB, 'cs');
  });

  container.innerHTML = filteredRoles.map(role => {
    const kw = role.keyword ? role.keyword.toLowerCase().trim() : '';
    const isSelected = selectedRoleKeywords.has(kw);
    const iconSrc = getRoleIconPath(role);
    const name = role.name_cz || role.name_eng || role.keyword;
    
    let ability = role.ability_cz || role.ability_eng || '';
    const setupReminder = role.setup_reminder_cz || role.setup_reminder_eng || '';
    if (setupReminder) {
      ability += ` ${setupReminder}`;
    }

    const romanEdition = (showAbilitiesInModal && role.edition && typeof getRomanNumeral === 'function') ? getRomanNumeral(role.edition) : '';
    const editionBadgeHtml = romanEdition ? `<span class="role-edition-badge">${romanEdition}</span>` : '';

    return `
      <div class="modal-role-card ${isSelected ? 'selected' : ''}" data-kw="${kw}" title="${escapeHtml(name + (ability ? ': ' + ability : ''))}">
        ${editionBadgeHtml}
        <img src="${iconSrc}" class="role-card-icon" alt="${name}" onerror="this.src='./data/icons/default.png'">
        <div class="role-card-content">
          <strong class="role-card-title">${name}</strong>
          ${showAbilitiesInModal && ability ? `<span class="role-card-ability">${escapeHtml(ability)}</span>` : ''}
        </div>
        <i class="fa-solid fa-check check-icon"></i>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.modal-role-card').forEach(card => {
    card.addEventListener('click', () => {
      const kw = card.dataset.kw;
      if (!kw) return;

      if (selectedRoleKeywords.has(kw)) {
        selectedRoleKeywords.delete(kw);
      } else {
        selectedRoleKeywords.add(kw);
      }

      updateRoleFilterModalUI();
      applyFiltersAndRender();
    });
  });
}

function updateRoleFilterModalUI() {
  const badge = document.getElementById('selected-roles-badge');
  if (badge) {
    if (selectedRoleKeywords.size > 0) {
      badge.textContent = selectedRoleKeywords.size;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  renderModalRolesList();
  renderActiveRoleChips();
}

function renderActiveRoleChips() {
  const container = document.getElementById('active-role-chips');
  if (!container) return;

  if (selectedRoleKeywords.size === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  const chipsHtml = Array.from(selectedRoleKeywords).map(kw => {
    const role = findRoleInfo(kw);
    const iconSrc = getRoleIconPath(role);
    const roleName = role ? (role.name_cz || role.name_eng) : kw;

    return `
      <div class="role-chip" data-kw="${kw}" title="Kliknutím odeberete postavu">
        <img src="${iconSrc}" alt="${roleName}" onerror="this.src='./data/icons/default.png'">
        <span>${roleName}</span>
        <button class="role-chip-remove" title="Odebrat postavu">&times;</button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <span style="font-size: 0.8rem; color: #c084fc; font-weight: 700; margin-right: 4px;">
      <i class="fa-solid fa-filter"></i> Vybrané postavy:
    </span>
    ${chipsHtml}
  `;

  container.querySelectorAll('.role-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const kw = chip.dataset.kw;
      if (kw) {
        selectedRoleKeywords.delete(kw);
        updateRoleFilterModalUI();
        applyFiltersAndRender();
      }
    });
  });
}

function applyFiltersAndRender() {
  const container = document.getElementById('scripts-grid-container');
  if (!container) return;

  const nameInput = document.getElementById('filter-name-input');
  const authorInput = document.getElementById('filter-author-input');
  
  const nameQuery = nameInput ? normalizeText(nameInput.value) : '';
  const authorQuery = authorInput ? normalizeText(authorInput.value) : '';

  const filtered = allLoadedScripts.filter(({ meta, characterKeywords }) => {
    // 1. Textové vyhledávání podle názvu skriptu (ignoruje diakritiku)
    if (nameQuery) {
      const nameMatch = normalizeText(meta.name).includes(nameQuery);
      if (!nameMatch) {
        return false;
      }
    }

    // 2. Textové vyhledávání podle autora (ignoruje diakritiku)
    if (authorQuery) {
      const authorMatch = normalizeText(meta.author).includes(authorQuery);
      if (!authorMatch) {
        return false;
      }
    }

    // 2. Vybrané postavy (skript musí obsahovat VŠECHNY vybrané postavy)
    if (selectedRoleKeywords.size > 0) {
      for (const reqKw of selectedRoleKeywords) {
        if (!characterKeywords.includes(reqKw)) {
          return false;
        }
      }
    }

    // 3. Obtížnost pro Vypravěče (Min - Max interval)
    const stDiff = parseInt(meta.difficulty_storyteller || 1, 10);
    if (stDiff < storytellerMinDiff || stDiff > storytellerMaxDiff) {
      return false;
    }

    // 4. Obtížnost pro Hráče (Min - Max interval)
    const plDiff = parseInt(meta.difficulty_player || 1, 10);
    if (plDiff < playerMinDiff || plDiff > playerMaxDiff) {
      return false;
    }

    return true;
  });

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: #aaa; padding: 50px 20px; background: rgba(22, 22, 26, 0.6); border-radius: 12px; border: 1px dashed rgba(155, 89, 182, 0.3);">
        <i class="fa-solid fa-filter-circle-xmark" style="font-size: 3rem; margin-bottom: 15px; color: #9b59b6;"></i>
        <h3 style="color: #fff; margin-bottom: 8px;">Nenalezen žádný skript</h3>
        <p style="font-size: 0.9rem; color: #bbb; margin-bottom: 20px;">Zadaným filtrům a vyhledávání neodpovídá žádný skript.</p>
        <button id="empty-reset-btn" class="filter-btn primary-filter" style="margin: 0 auto;">
          <i class="fa-solid fa-rotate-left"></i> Vynulovat filtry
        </button>
      </div>
    `;

    const emptyResetBtn = document.getElementById('empty-reset-btn');
    if (emptyResetBtn) {
      emptyResetBtn.addEventListener('click', () => {
        const resetBtn = document.getElementById('reset-filters-btn');
        if (resetBtn) resetBtn.click();
      });
    }
    return;
  }

  filtered.forEach(({ filename, data }) => {
    const card = createScriptCard(filename, data);
    container.appendChild(card);
  });
}

function createScriptCard(filename, scriptData) {
  let meta = {
    name: "Bez Názvu",
    author: "Neznámý",
    description: "",
    difficulty_storyteller: 1,
    difficulty_player: 1,
    preview_characters: []
  };

  let characterKeywords = [];

  if (Array.isArray(scriptData)) {
    const metaObj = scriptData.find(item => typeof item === 'object' && item.id === '_meta');
    if (metaObj) {
      meta = { ...meta, ...metaObj };
    }
    characterKeywords = scriptData.filter(item => typeof item === 'string');
  }

  let displayKeywords = [];
  if (meta.preview_characters && Array.isArray(meta.preview_characters) && meta.preview_characters.length > 0) {
    displayKeywords = meta.preview_characters;
  } else {
    displayKeywords = characterKeywords;
  }

  const previewHtml = displayKeywords.map(kw => {
    const role = findRoleInfo(kw);
    const iconSrc = getRoleIconPath(role);
    const roleName = role ? (role.name_cz || role.name_eng) : kw;
    const abilityText = role && role.ability_cz ? role.ability_cz.replace(/"/g, '&quot;') : '';

    return `
      <div class="preview-char-item" title="${roleName}${abilityText ? ': ' + abilityText : ''}">
        <img src="${iconSrc}" class="preview-char-icon" alt="${roleName}" onerror="this.src='./data/icons/default.png'">
        <span class="preview-char-name">${roleName}</span>
      </div>
    `;
  }).join('');

  const cardElement = document.createElement('div');
  cardElement.className = 'script-card';

  const storytellerDiffHtml = renderPurpleVerticalBars(meta.difficulty_storyteller || 1, 5);
  const playerDiffHtml = renderPurpleVerticalBars(meta.difficulty_player || 1, 5);

  const rawJsonUrl = `./data/saved-scripts/${filename}`;
  const editorUrl = `./tvoric/?file=${encodeURIComponent(filename)}`;

  cardElement.innerHTML = `
    <div class="card-detail-badge" title="Kliknutím zobrazíš detail skriptu">
      <i class="fa-solid fa-expand icon-normal"></i>
      <i class="fa-solid fa-eye icon-hover"></i>
    </div>
    <div class="script-card-top">
      <div class="script-card-header">
        <h3 class="script-title">${escapeHtml(meta.name)}</h3>
        <div class="script-author">
          <i class="fa-solid fa-feather-pointed"></i> Autor: ${escapeHtml(meta.author)}
        </div>
      </div>
      ${meta.description ? `<p class="script-description">${escapeHtml(meta.description)}</p>` : '<div class="script-description" style="margin-bottom: 14px;"></div>'}
    </div>
    <div class="script-card-bottom">
      <div class="script-preview-section">
        <button class="char-nav-btn prev" aria-label="Posunout vlevo" title="Předchozí postavy">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="preview-chars-scroll-container">
          ${previewHtml}
        </div>
        <button class="char-nav-btn next" aria-label="Posunout vpravo" title="Další postavy">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
      <div class="script-difficulties">
        <div class="difficulty-row">
          <span class="difficulty-label"><i class="fa-solid fa-book-open-reader"></i> <span class="diff-prefix">Obtížnost pro </span><span class="diff-name-full">vypravěče:</span><span class="diff-name-compact">Vypravěč:</span></span>
          ${storytellerDiffHtml}
        </div>
        <div class="difficulty-row">
          <span class="difficulty-label"><i class="fa-solid fa-gamepad"></i> <span class="diff-prefix">Obtížnost pro </span><span class="diff-name-full">hráče:</span><span class="diff-name-compact">Hráči:</span></span>
          ${playerDiffHtml}
        </div>
      </div>
      <div class="script-card-actions">
        <a href="${editorUrl}" class="action-btn primary btn-editor">
          <i class="fa-solid fa-pen-nib"></i> Editovat
        </a>
        <a href="${rawJsonUrl}" download="${filename}" class="action-btn secondary btn-json" title="Stáhnout JSON">
          <i class="fa-solid fa-download"></i> JSON
        </a>
      </div>
    </div>
  `;

  const prevBtn = cardElement.querySelector('.char-nav-btn.prev');
  const nextBtn = cardElement.querySelector('.char-nav-btn.next');
  const scrollContainer = cardElement.querySelector('.preview-chars-scroll-container');

  function updateArrows() {
    if (!scrollContainer || !prevBtn || !nextBtn) return;
    const sLeft = scrollContainer.scrollLeft;
    const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
    
    if (sLeft > 2) {
      scrollContainer.classList.add('has-prev');
      prevBtn.style.opacity = '1';
      prevBtn.style.pointerEvents = 'auto';
    } else {
      scrollContainer.classList.remove('has-prev');
      prevBtn.style.opacity = '0';
      prevBtn.style.pointerEvents = 'none';
    }

    if (sLeft >= maxScroll - 2) {
      nextBtn.style.opacity = '0';
      nextBtn.style.pointerEvents = 'none';
    } else {
      nextBtn.style.opacity = '1';
      nextBtn.style.pointerEvents = 'auto';
    }
  }

  if (scrollContainer && prevBtn && nextBtn) {
    scrollContainer.addEventListener('scroll', updateArrows);
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      scrollContainer.scrollBy({ left: -130, behavior: 'smooth' });
    });
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      scrollContainer.scrollBy({ left: 130, behavior: 'smooth' });
    });
    setTimeout(updateArrows, 100);
  }

  cardElement.addEventListener('click', (e) => {
    if (e.target.closest('.action-btn') || e.target.closest('.char-nav-btn')) return;
    openScriptModal(filename, meta, characterKeywords);
  });

  return cardElement;
}

function openScriptModal(filename, meta, characterKeywords) {
  let modalOverlay = document.getElementById('script-modal-overlay');
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'script-modal-overlay';
    modalOverlay.className = 'script-modal-overlay';
    document.body.appendChild(modalOverlay);
  }

  const categories = {
    townsfolk: { title: 'Měšťané', icon: 'fa-shield-halved', items: [] },
    outsider: { title: 'Outsideři', icon: 'fa-mask', items: [] },
    minion: { title: 'Přisluhovači', icon: 'fa-skull', items: [] },
    demon: { title: 'Démoni', icon: 'fa-ghost', items: [] },
    traveller: { title: 'Cestovatelé', icon: 'fa-compass', items: [] },
    fabled: { title: 'Bájné postavy', icon: 'fa-wand-magic-sparkles', items: [] }
  };

  characterKeywords.forEach(kw => {
    const role = findRoleInfo(kw);
    const type = (role && role.type) ? role.type.toLowerCase() : 'townsfolk';
    if (categories[type]) categories[type].items.push(role);
    else categories.townsfolk.items.push(role);
  });

  const renderCategoryGroup = (typeKey, cat) => {
    if (cat.items.length === 0) return '';
    const rowsHtml = cat.items.map(role => {
      const iconSrc = getRoleIconPath(role);
      const name = role ? (role.name_cz || role.name_eng || role.keyword) : 'Role';
      let ability = role ? (role.ability_cz || role.ability_eng || '') : '';
      const setupReminder = role ? (role.setup_reminder_cz || role.setup_reminder_eng || '') : '';
      if (setupReminder) {
        ability += ` ${setupReminder}`;
      }
      const romanEdition = (role && role.edition && typeof getRomanNumeral === 'function') ? getRomanNumeral(role.edition) : '';
      const editionBadgeHtml = romanEdition ? `<span class="role-edition-badge">${romanEdition}</span>` : '';

      return `
        <div class="modal-role-row type-${typeKey}">
          ${editionBadgeHtml}
          <img src="${iconSrc}" class="modal-role-icon-sm" alt="${name}" onerror="this.src='./data/icons/default.png'">
          <div class="modal-role-content">
            <strong class="modal-role-title">${escapeHtml(name)}:</strong>
            <span class="modal-role-desc">${escapeHtml(ability)}</span>
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="modal-category-group type-${typeKey}">
        <h4 class="modal-category-title"><span class="category-badge">${cat.title} (${cat.items.length})</span></h4>
        <div class="modal-roles-2col-grid">${rowsHtml}</div>
      </div>
    `;
  };

  const bodyHtml = renderCategoryGroup('townsfolk', categories.townsfolk) +
    renderCategoryGroup('outsider', categories.outsider) +
    renderCategoryGroup('minion', categories.minion) +
    renderCategoryGroup('demon', categories.demon) +
    renderCategoryGroup('traveller', categories.traveller) +
    renderCategoryGroup('fabled', categories.fabled);

  modalOverlay.innerHTML = `
    <div class="script-modal-container">
      <button class="modal-close-btn" id="modal-close-btn" title="Zavřít">&times;</button>
      <div class="modal-header">
        <h2 class="modal-title">${escapeHtml(meta.name)}</h2>
        <div class="modal-subtitle">
          <span><i class="fa-solid fa-feather-pointed" style="color: #9b59b6;"></i> Autor: ${escapeHtml(meta.author)}</span> &bull;
          <span><i class="fa-solid fa-users" style="color: #9b59b6;"></i> Celkem ${characterKeywords.length} postav</span>
        </div>
      </div>
      <div class="modal-body">${bodyHtml}</div>
    </div>
  `;

  document.body.style.overflow = 'hidden';
  modalOverlay.classList.add('active');
  const closeModal = () => {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  };
  const closeBtn = modalOverlay.querySelector('#modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  const escHandler = (e) => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}

function renderPurpleVerticalBars(level, maxLevel = 5) {
  let barsHtml = '<div class="difficulty-bars">';
  for (let i = 1; i <= maxLevel; i++) {
    const isFilled = i <= level ? 'filled' : '';
    barsHtml += `<span class="diff-bar ${isFilled}" title="Úroveň ${level} z ${maxLevel}"></span>`;
  }
  barsHtml += '</div>';
  return barsHtml;
}

function findRoleInfo(keyword) {
  if (typeof rolesData !== 'undefined' && Array.isArray(rolesData)) {
    const cleanKw = String(keyword).toLowerCase().trim();
    const found = rolesData.find(r => r.keyword && r.keyword.toLowerCase().trim() === cleanKw);
    if (found) return found;
  }
  return { keyword: keyword, name_cz: keyword, name_eng: keyword, type: 'townsfolk' };
}

function getRoleIconPath(role) {
  if (!role) return './data/icons/default.png';
  const type = role.type || 'townsfolk';
  const kw = role.keyword || 'default';
  return `./data/icons/${type}/${kw}_icon.png`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
