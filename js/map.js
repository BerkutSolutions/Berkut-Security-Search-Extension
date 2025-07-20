/*
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
// Остальной код файла

async function generateMap(lat, lon) {
  const mapDiv = document.createElement('div');
  mapDiv.style.width = '100%';
  mapDiv.style.height = '400px';
  try {
    if (!lat || !lon) {
      mapDiv.innerHTML = '<p>Нет данных для карты</p>';
      return mapDiv;
    }
    const map = L.map(mapDiv).setView([lat, lon], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    L.marker([lat, lon]).addTo(map).bindPopup('Примерное местоположение');
    return mapDiv;
  } catch (e) {
    console.error('Ошибка генерации карты:', e);
    mapDiv.innerHTML = '<p>Ошибка загрузки карты</p>';
    return mapDiv;
  }
}