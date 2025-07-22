/*
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

async function loadTiles() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tiles'], (result) => {
      resolve(result.tiles || []);
    });
  });
}

async function saveTiles(tiles) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ tiles }, () => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка сохранения плиток:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

async function exportTiles() {
  const tiles = await loadTiles();
  const blob = new Blob([JSON.stringify(tiles, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tiles.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function importTiles(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const tiles = JSON.parse(text);
    await saveTiles(tiles);
    window.location.reload();
  } catch (e) {
    console.error('Ошибка импорта плиток:', e);
    document.getElementById('results').innerHTML = `<div class="notification">Ошибка: Неверный формат файла tiles.json</div>`;
  }
}