/*
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const CURRENT_VERSION = "1.0.0";

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getIpInfo') {
    fetch('http://ip-api.com/json/', {
      mode: 'cors',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.status === 'success') {
          sendResponse({
            ip: data.query || 'Неизвестно',
            country: data.country || 'Неизвестно',
            city: data.city || '',
            lat: data.lat || 0.0,
            lon: data.lon || 0.0
          });
        } else {
          sendResponse({
            ip: 'Не удалось определить',
            country: 'Не удалось определить',
            city: '',
            lat: 0.0,
            lon: 0.0
          });
        }
      })
      .catch(e => {
        console.error('Ошибка получения IP:', e);
        sendResponse({
          ip: 'Ошибка',
          country: 'Ошибка',
          city: '',
          lat: 0.0,
          lon: 0.0
        });
      });
  } else if (request.action === 'checkForUpdates') {
    fetch('https://api.github.com/repos/BerkutSolutions/Berkut-Security-Search-Extension/releases/latest')
      .then(response => {
        if (!response.ok) throw new Error('Ошибка проверки обновлений');
        return response.json();
      })
      .then(data => {
        const latestVersion = data.tag_name.replace(/^v/, '');
        sendResponse({
          updateAvailable: latestVersion !== CURRENT_VERSION,
          latestVersion: latestVersion
        });
      })
      .catch(e => {
        console.error('Ошибка проверки обновлений:', e);
        sendResponse({ updateAvailable: false, error: e.message });
      });
  }
  return true;
});