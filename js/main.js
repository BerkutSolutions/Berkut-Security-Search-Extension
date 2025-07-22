/*
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

let isDeleting = false;
let currentTile = null;

function normalizeText(text) {
  return text.toLowerCase().replace(/[^\w\s"]/g, '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightQuery(html, query) {
  if (!query) return html;
  try {
    const pattern = new RegExp('(' + escapeRegExp(query) + ')', 'gi');
    return html.replace(pattern, '<mark>$1</mark>');
  } catch (e) {
    console.error('highlight regex error:', e);
    return html;
  }
}

function openModal(materialId, similarity) {
  const backdrop = document.getElementById('modal-backdrop');
  const titleEl = document.getElementById('modal-title');
  const metaEl = document.getElementById('modal-meta');
  const contentEl = document.getElementById('modal-body');
  const hiddenEl = document.getElementById('material-' + materialId);
  if (!hiddenEl) {
    console.warn('no material element:', materialId);
    return;
  }
  const rawText = hiddenEl.innerHTML;
  const date = hiddenEl.getAttribute('data-date');
  const q = backdrop.getAttribute('data-query');
  titleEl.textContent = `№ ${materialId}`;
  metaEl.textContent = `Дата: ${date || 'Не указана'}`;
  contentEl.innerHTML = highlightQuery(rawText, q);
  backdrop.classList.add('show');
  document.getElementById('modal-close-btn').focus();
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('show');
  document.getElementById('add-modal').classList.remove('show');
  document.getElementById('delete-modal').classList.remove('show');
  document.getElementById('settings-modal').classList.remove('show');
  document.getElementById('success-notification').classList.remove('show');
  document.getElementById('update-modal').classList.remove('show');
  document.getElementById('init-modal').classList.remove('show');
  document.getElementById('update-available-modal').classList.remove('show');
}

function showContextMenu(event, name, url) {
  event.preventDefault();
  currentTile = { name, url };
  const menu = document.getElementById('context-menu');
  menu.style.display = 'block';
  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';
}

function openAddModal() {
  document.getElementById('modal-title-add').textContent = 'Добавить сайт';
  document.getElementById('site_name').value = '';
  document.getElementById('site_url').value = 'https://';
  document.getElementById('edit_index').value = '';
  document.getElementById('edit_url').value = '';
  document.getElementById('add-modal').classList.add('show');
  document.getElementById('site_name').focus();
}

function openEditModal() {
  document.getElementById('modal-title-add').textContent = 'Редактировать сайт';
  document.getElementById('site_name').value = currentTile.name;
  document.getElementById('site_url').value = currentTile.url;
  document.getElementById('edit_index').value = currentTile.name;
  document.getElementById('edit_url').value = currentTile.url;
  document.getElementById('add-modal').classList.add('show');
  document.getElementById('context-menu').style.display = 'none';
  document.getElementById('site_name').focus();
}

function openDeleteModal() {
  document.getElementById('modal-title-delete').textContent = 'Удалить сайт';
  document.getElementById('delete-site-name').textContent = currentTile.name;
  document.getElementById('delete_tile').value = currentTile.name;
  document.getElementById('delete_url').value = currentTile.url;
  document.getElementById('delete-modal').classList.add('show');
  document.getElementById('context-menu').style.display = 'none';
}

async function deleteTile(event) {
  event.preventDefault();
  if (isDeleting) return;
  isDeleting = true;
  try {
    const tiles = await loadTiles();
    const updatedTiles = tiles.filter(t => t.name !== currentTile.name || t.url !== currentTile.url);
    await saveTiles(updatedTiles);
    const notification = document.getElementById('success-notification');
    notification.textContent = 'Плитка успешно удалена';
    notification.classList.add('show');
    setTimeout(() => {
      notification.classList.remove('show');
      location.reload();
    }, 300);
  } catch (error) {
    console.error('Ошибка удаления:', error);
    document.getElementById('results').innerHTML = `<div class="notification">Ошибка при удалении сайта: ${error.message}</div>`;
  }
  isDeleting = false;
  document.getElementById('delete-modal').classList.remove('show');
}

function saveSearchHistory(query) {
  if (!query) return;
  let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
  history = history.filter(q => q !== query);
  history.unshift(query);
  if (history.length > 5) history.pop();
  localStorage.setItem('searchHistory', JSON.stringify(history));
  updateHistoryList();
}

function updateHistoryList() {
  const historyList = document.getElementById('history-list');
  const history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
  historyList.innerHTML = '';
  history.forEach(query => {
    const div = document.createElement('div');
    div.textContent = query;
    div.addEventListener('click', () => {
      document.getElementById('query').value = query;
      historyList.style.display = 'none';
      document.getElementById('search-form').dispatchEvent(new Event('submit'));
    });
    historyList.appendChild(div);
  });
}

function openSettingsModal() {
  document.getElementById('modal-backdrop').classList.remove('show');
  document.getElementById('add-modal').classList.remove('show');
  document.getElementById('delete-modal').classList.remove('show');
  document.getElementById('settings-modal').classList.add('show');
}

async function saveSettings(event) {
  event.preventDefault();
  const dbSource = document.getElementById('db_source').value;
  const dbFile = document.getElementById('db_file').files[0];
  const autoUpdate = document.getElementById('auto_update').checked;
  try {
    if ((dbSource === 'txt' || dbSource === 'local_csv') && !dbFile) throw new Error('Файл не выбран');
    const settings = { db_source: dbSource, db_path: dbFile ? dbFile.name : '', hash: '', auto_update: autoUpdate };
    await saveSettingsDB(settings);
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ settings }, () => {
        if (chrome.runtime.lastError) {
          console.error('Ошибка сохранения настроек в chrome.storage:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('Настройки успешно сохранены в chrome.storage:', settings);
          resolve();
        }
      });
    });
    const result = await initDB(dbSource, dbFile);
    if (result.is_valid) {
      localStorage.removeItem('searchHistory');
      updateHistoryList();
      const notification = document.getElementById('success-notification');
      notification.textContent = `База данных успешно инициализирована: ${result.count} записей`;
      notification.classList.add('show');
      setTimeout(() => {
        notification.classList.remove('show');
        location.reload();
      }, 2000);
    } else {
      document.getElementById('results').innerHTML = `<div class="notification">Ошибка инициализации базы: ${result.error}</div>`;
    }
  } catch (error) {
    console.error('Ошибка при сохранении настроек:', error);
    document.getElementById('results').innerHTML = `<div class="notification">Ошибка при сохранении настроек: ${error.message}</div>`;
  }
}

async function loadSettings() {
  return new Promise((resolve) => {
    // Сначала пытаемся загрузить из chrome.storage.local
    chrome.storage.local.get(['settings'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка загрузки настроек из chrome.storage:', chrome.runtime.lastError);
        resolve({ db_source: 'txt', db_path: '', hash: '', auto_update: true });
      } else if (result.settings && Object.keys(result.settings).length > 0) {
        console.log('Настройки загружены из chrome.storage:', result.settings);
        resolve(result.settings);
      } else {
        // Если в chrome.storage.local нет настроек, загружаем из settings.json
        fetch(chrome.runtime.getURL('settings.json'))
          .then(response => {
            if (!response.ok) throw new Error('Не удалось загрузить settings.json');
            return response.json();
          })
          .then(settings => {
            console.log('Настройки загружены из settings.json:', settings);
            // Сохраняем настройки в chrome.storage.local для последующего использования
            chrome.storage.local.set({ settings }, () => {
              if (chrome.runtime.lastError) {
                console.error('Ошибка сохранения настроек из settings.json в chrome.storage:', chrome.runtime.lastError);
              } else {
                console.log('Настройки из settings.json сохранены в chrome.storage');
              }
            });
            resolve(settings);
          })
          .catch(error => {
            console.error('Ошибка загрузки settings.json:', error);
            // Возвращаем значения по умолчанию в случае ошибки
            resolve({ db_source: 'txt', db_path: '', hash: '', auto_update: true });
          });
      }
    });
  });
}

async function deleteDatabase() {
  try {
    await deleteDB();
    localStorage.removeItem('searchHistory');
    updateHistoryList();
    const notification = document.getElementById('success-notification');
    notification.textContent = 'База данных успешно удалена';
    notification.classList.add('show');
    setTimeout(() => {
      notification.classList.remove('show');
      location.reload();
    }, 2000);
  } catch (error) {
    console.error('Ошибка при удалении базы:', error);
    document.getElementById('results').innerHTML = `<div class="notification">Ошибка при удалении базы: ${error.message}</div>`;
  }
}

async function initDatabase(event) {
  event.preventDefault();
  const dbSource = document.getElementById('init_db_source').value;
  const dbFile = document.getElementById('init_db_file').files[0];
  try {
    const settings = { db_source: dbSource, db_path: dbFile ? dbFile.name : '', hash: '', auto_update: true };
    await saveSettingsDB(settings);
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ settings }, () => {
        if (chrome.runtime.lastError) {
          console.error('Ошибка сохранения настроек в chrome.storage:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('Настройки сохранены в chrome.storage:', settings);
          resolve();
        }
      });
    });
    const result = await initDB(dbSource, dbFile);
    if (result.is_valid) {
      const notification = document.getElementById('success-notification');
      notification.textContent = `База данных успешно инициализирована: ${result.count} записей`;
      notification.classList.add('show');
      setTimeout(() => {
        notification.classList.remove('show');
        location.reload();
      }, 2000);
      document.getElementById('init-modal').classList.remove('show');
    } else {
      document.getElementById('results').innerHTML = `<div class="notification">Ошибка инициализации базы: ${result.error}</div>`;
    }
  } catch (error) {
    console.error('Ошибка при инициализации базы:', error);
    document.getElementById('results').innerHTML = `<div class="notification">Ошибка при инициализации базы: ${error.message}</div>`;
  }
}

async function getPublicIpInfo() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getIpInfo' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка сообщения:', chrome.runtime.lastError);
        resolve({ ip: 'Неизвестно', country: 'Неизвестно', city: '', lat: 0.0, lon: 0.0 });
      } else {
        resolve(response);
      }
    });
  });
}

async function checkForUpdates() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'checkForUpdates' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка проверки обновлений:', chrome.runtime.lastError);
        resolve({ updateAvailable: false, latestVersion: '' });
      } else {
        console.log('Результат проверки обновлений:', response);
        resolve(response);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const tiles = await loadTiles();
    const ipInfo = await getPublicIpInfo();
    const dbStatus = await checkDBIntegrity();
    const settings = await loadSettings();
    const mapEl = await generateMap(ipInfo.lat, ipInfo.lon);

    console.log('Инициализация страницы, настройки:', settings);

    document.getElementById('map').innerHTML = '';
    document.getElementById('map').appendChild(mapEl);

    document.getElementById('ip').textContent = ipInfo.ip;
    document.getElementById('country').textContent = ipInfo.country;
    document.getElementById('city').textContent = ipInfo.city;
    if (!ipInfo.city) document.getElementById('city').parentElement.style.display = 'none';

    if (settings.auto_update) {
      const updateInfo = await checkForUpdates();
      if (updateInfo.updateAvailable) {
        document.getElementById('update-available-version').textContent = updateInfo.latestVersion;
        document.getElementById('update-available-modal').classList.add('show');
      }
    }

    document.getElementById('auto_update').checked = settings.auto_update;

    const tilesContainer = document.querySelector('.tiles');
    tilesContainer.innerHTML = tiles.length
      ? tiles.map(tile => {
          const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(tile.url).hostname}&sz=16`;
          return `<a href="${tile.url}" class="tile" data-name="${tile.name}" data-url="${tile.url}"><img src="${faviconUrl}" onerror="this.remove()">${tile.name}</a>`;
        }).join('')
      : '<p class="debug-tiles">Плитки отсутствуют. Проверьте настройки или логи.</p>';

    if (!dbStatus.is_valid) {
      document.getElementById('init_db_source').value = settings.db_source || 'txt';
      document.getElementById('init-modal').classList.add('show');
    }

    document.getElementById('db_source').value = settings.db_source || 'txt';
    document.getElementById('db_file').value = '';
    document.getElementById('init_db_source').value = settings.db_source || 'txt';
    document.getElementById('init_db_file').value = '';

    const queryInput = document.getElementById('query');
    const historyList = document.getElementById('history-list');
    updateHistoryList();
    if (queryInput && historyList) {
      queryInput.addEventListener('focus', () => {
        if (JSON.parse(localStorage.getItem('searchHistory') || '[]').length > 0) {
          historyList.style.display = 'block';
        }
      });
      queryInput.addEventListener('blur', () => {
        setTimeout(() => historyList.style.display = 'none', 200);
      });
    }

    const searchForm = document.getElementById('search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = document.getElementById('query').value.trim();
        if (!query) {
          document.getElementById('results').innerHTML = '<div class="notification">Введите запрос для поиска</div>';
          return;
        }
        saveSearchHistory(query);
        document.getElementById('modal-backdrop').setAttribute('data-query', query);

        try {
          const materials = await searchDB(query);
          const resultsContainer = document.getElementById('results');
          resultsContainer.innerHTML = '';
          if (materials.length) {
            resultsContainer.innerHTML = `
              <div class="warning">
                <div class="warning-header">Найдены запрещённые материалы:</div>
                <div class="warning-buttons">
                  ${materials.map(m => `<button type="button" class="warning-btn" data-material-id="${m.id}" data-similarity="${m.similarity}">№ ${m.id}</button>`).join('')}
                </div>
                ${materials.map(m => `<div id="material-${m.id}" data-date="${m.date}" style="display:none;">ID: ${m.id}, Дата: ${m.date}<br>Причина: ${m.material}</div>`).join('')}
              </div>
            `;
            document.querySelectorAll('.warning-btn').forEach(btn => {
              btn.addEventListener('click', () => openModal(btn.getAttribute('data-material-id'), btn.getAttribute('data-similarity')));
            });
          } else {
            resultsContainer.innerHTML = `
              <div class="safe">
                Запрос "${query}" безопасен!
                <div>
                  <a href="https://www.google.com/search?q=${encodeURIComponent(query)}"><img src="https://upload.wikimedia.org/wikipedia/commons/3/3c/Google_Favicon_2025.svg" alt="Google"></a>
                  <a href="https://yandex.com/search/?text=${encodeURIComponent(query)}"><img src="https://upload.wikimedia.org/wikipedia/commons/5/58/Yandex_icon.svg" alt="Yandex"></a>
                  <a href="https://duckduckgo.com/?q=${encodeURIComponent(query)}"><img src="https://www.svgrepo.com/show/353679/duckduckgo.svg" alt="DuckDuckGo"></a>
                  <a href="https://www.startpage.com/search?q=${encodeURIComponent(query)}"><img src="https://files.svgcdn.io/simple-icons/startpage.svg" alt="Startpage"></a>
                  <a href="https://swisscows.com/web?query=${encodeURIComponent(query)}"><img src="https://swisscows.com/favicon.ico" alt="Swisscows"></a>
                </div>
              </div>
            `;
          }
        } catch (error) {
          document.getElementById('results').innerHTML = `<div class="notification">Ошибка поиска: ${error.message}</div>`;
        }
      });
    }

    const addTileForm = document.getElementById('add-tile-form');
    if (addTileForm) {
      addTileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const siteName = document.getElementById('site_name').value;
        const siteUrl = document.getElementById('site_url').value;
        const editIndex = document.getElementById('edit_index').value;
        const tiles = await loadTiles();
        if (!editIndex && tiles.some(t => t.name === siteName)) {
          document.getElementById('results').innerHTML = `<div class="notification">Ошибка: Плитка с таким именем уже существует</div>`;
          return;
        }
        if (editIndex) {
          const index = tiles.findIndex(t => t.name === editIndex && t.url === document.getElementById('edit_url').value);
          if (index !== -1) tiles[index] = { name: siteName, url: siteUrl };
        } else {
          tiles.push({ name: siteName, url: siteUrl });
        }
        await saveTiles(tiles);
        document.getElementById('success-notification').textContent = 'Плитка успешно сохранена';
        document.getElementById('success-notification').classList.add('show');
        setTimeout(() => {
          document.getElementById('success-notification').classList.remove('show');
          location.reload();
        }, 2000);
      });
    }

    const updateDbForm = document.getElementById('update-db-form');
    if (updateDbForm) {
      updateDbForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const updateInfo = await updateDB();
        if (updateInfo.updated) {
          document.getElementById('update-info-text').textContent = `Добавлено новых записей: ${updateInfo.new_records}`;
          document.getElementById('update-modal').classList.add('show');
        } else if (updateInfo.error) {
          document.getElementById('results').innerHTML = `<div class="notification">Ошибка обновления базы: ${updateInfo.error}</div>`;
        } else {
          document.getElementById('results').innerHTML = `<div class="notification">База данных не изменилась</div>`;
        }
      });
    }

    const checkUpdateBtn = document.getElementById('check-update-btn');
    if (checkUpdateBtn) {
      checkUpdateBtn.addEventListener('click', async () => {
        const updateInfo = await checkForUpdates();
        if (updateInfo.updateAvailable) {
          document.getElementById('update-available-version').textContent = updateInfo.latestVersion;
          document.getElementById('update-available-modal').classList.add('show');
        } else {
          document.getElementById('success-notification').textContent = 'Обновления не найдены';
          document.getElementById('success-notification').classList.add('show');
          setTimeout(() => {
            document.getElementById('success-notification').classList.remove('show');
          }, 2000);
        }
      });
    }

    const addSiteBtn = document.getElementById('add-site-btn');
    if (addSiteBtn) addSiteBtn.addEventListener('click', openAddModal);
    const exportTilesBtn = document.getElementById('export-tiles-btn');
    if (exportTilesBtn) exportTilesBtn.addEventListener('click', exportTiles);
    const importFileInput = document.getElementById('import-file-input');
    if (importFileInput) importFileInput.addEventListener('change', importTiles);
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    const editTile = document.getElementById('edit-tile');
    if (editTile) editTile.addEventListener('click', openEditModal);
    const deleteTile = document.getElementById('delete-tile');
    if (deleteTile) deleteTile.addEventListener('click', openDeleteModal);
    const deleteBtn = document.getElementById('delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteTile);
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeModal);
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) settingsForm.addEventListener('submit', saveSettings);
    const initForm = document.getElementById('init-form');
    if (initForm) initForm.addEventListener('submit', initDatabase);
    const cancelInitBtn = document.getElementById('cancel-init-btn');
    if (cancelInitBtn) cancelInitBtn.addEventListener('click', closeModal);
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', () => {
      localStorage.removeItem('searchHistory');
      updateHistoryList();
      document.getElementById('success-notification').textContent = 'История поиска очищена';
      document.getElementById('success-notification').classList.add('show');
      setTimeout(() => document.getElementById('success-notification').classList.remove('show'), 2000);
    });
    const deleteDbBtn = document.getElementById('delete-db-btn');
    if (deleteDbBtn) deleteDbBtn.addEventListener('click', deleteDatabase);
    const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
    if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', closeModal);
    const closeUpdateBtn = document.getElementById('close-update-btn');
    if (closeUpdateBtn) closeUpdateBtn.addEventListener('click', () => location.assign('/'));
    const closeUpdateAvailableBtn = document.getElementById('close-update-available-btn');
    if (closeUpdateAvailableBtn) closeUpdateAvailableBtn.addEvent__,
      document.getElementById('close-update-available-btn').addEventListener('click', closeModal);
    const dbSource = document.getElementById('db_source');
    if (dbSource) dbSource.addEventListener('change', () => {
      document.getElementById('db_file').style.display = document.getElementById('db_source').value === 'local_csv' || document.getElementById('db_source').value === 'txt' ? 'block' : 'none';
    });
    const initDbSource = document.getElementById('init_db_source');
    if (initDbSource) initDbSource.addEventListener('change', () => {
      document.getElementById('init_db_file').style.display = document.getElementById('init_db_source').value === 'local_csv' || document.getElementById('init_db_source').value === 'txt' ? 'block' : 'none';
    });
    document.addEventListener('click', (event) => {
      const menu = document.getElementById('context-menu');
      if (!menu.contains(event.target)) menu.style.display = 'none';
    });
    const tilesElement = document.querySelector('.tiles');
    if (tilesElement) {
      tilesElement.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.tile')) {
          const tile = e.target.closest('.tile');
          showContextMenu(e, tile.getAttribute('data-name'), tile.getAttribute('data-url'));
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  } catch (error) {
    console.error('Ошибка загрузки страницы:', error);
    document.getElementById('results').innerHTML = `<div class="notification">Ошибка загрузки страницы: ${error.message}</div>`;
  }
});