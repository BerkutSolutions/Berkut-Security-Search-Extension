/*
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

async function openDB() {
  console.log('Открытие базы данных BerkutDB');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BerkutDB', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('Обновление структуры базы');
      if (!db.objectStoreNames.contains('restricted_materials')) {
        console.log('Создание objectStore restricted_materials');
        const store = db.createObjectStore('restricted_materials', { keyPath: 'id' });
        store.createIndex('material', 'material', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        console.log('Создание objectStore settings');
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('database')) {
        console.log('Создание objectStore database');
        db.createObjectStore('database', { keyPath: 'key' });
      }
    };
    request.onsuccess = (event) => {
      console.log('База данных успешно открыта');
      resolve(event.target.result);
    };
    request.onerror = (event) => {
      console.error('Ошибка открытия базы:', event.target.error);
      reject(event.target.error);
    };
  });
}

async function deleteDB() {
  console.log('Удаление базы данных BerkutDB');
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('BerkutDB');
    request.onsuccess = () => {
      console.log('База данных успешно удалена');
      resolve();
    };
    request.onerror = (event) => {
      console.error('Ошибка удаления базы:', event.target.error);
      reject(event.target.error);
    };
  });
}

async function checkDBIntegrity() {
  console.log('Проверка целостности базы');
  try {
    const db = await openDB();
    const tx = db.transaction('restricted_materials', 'readonly');
    const store = tx.objectStore('restricted_materials');
    const count = await new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => {
        console.log('Количество записей:', request.result);
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('Ошибка подсчёта записей:', request.error);
        reject(request.error);
      };
    });
    db.close();
    if (count === 0) return { is_valid: false, error: 'База данных пуста' };
    return { is_valid: true, count };
  } catch (e) {
    console.error('Ошибка проверки целостности базы:', e);
    return { is_valid: false, error: e.message };
  }
}

async function getSettings() {
  console.log('Получение настроек');
  try {
    const db = await openDB();
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get('settings');
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('Настройки получены:', request.result?.value || { db_source: 'txt', db_path: '', hash: '' });
        resolve(request.result?.value || { db_source: 'txt', db_path: '', hash: '' });
      };
      request.onerror = () => {
        console.error('Ошибка получения настроек:', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('Ошибка загрузки настроек:', e);
    return { db_source: 'txt', db_path: '', hash: '' };
  }
}

async function saveSettingsDB(settings) {
  console.log('Сохранение настроек:', settings);
  try {
    const db = await openDB();
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    await new Promise((resolve, reject) => {
      const request = store.put({ key: 'settings', value: settings });
      request.onsuccess = () => {
        console.log('Настройки успешно сохранены');
        resolve();
      };
      request.onerror = () => {
        console.error('Ошибка сохранения настроек:', request.error);
        reject(request.error);
      };
    });
    db.close();
  } catch (e) {
    console.error('Ошибка сохранения настроек:', e);
    throw e;
  }
}

async function calculateHash(content) {
  console.log('Расчёт хэша для контента');
  const msgBuffer = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  console.log('Хэш рассчитан:', hash);
  return hash;
}

async function initDB(dbSource, file) {
  console.log('Начало инициализации базы с источником:', dbSource, 'и файлом:', file?.name || 'нет файла');
  try {
    if (!file && (dbSource === 'txt' || dbSource === 'local_csv')) {
      console.error('Файл не выбран');
      throw new Error('Файл не выбран');
    }
    let content = '';
    if (file) {
      content = await file.text();
      console.log('Файл загружен, размер:', content.length, 'байт');
    }
    let materials = [];

    if (dbSource === 'txt' && file) {
      console.log('Парсинг TXT файла');
      const entries = content.split('Экстремистский материал №').slice(1);
      for (const entry of entries) {
        const match = entry.match(/^(\d+): (.+)/s);
        if (match) {
          const material_id = parseInt(match[1]);
          const material_text = match[2].trim();
          if (material_text.includes('Исключен')) {
            console.log('Пропущен материал:', material_id, 'из-за исключения');
            continue;
          }
          const date_match = entry.match(/\(решение .+? от ([0-9.]+)\)/) || ['', 'Не указана'];
          const date = date_match[1];
          materials.push({ id: material_id, date, material: material_text });
          console.log('Добавлен материал:', material_id);
        }
      }
    } else if (dbSource === 'local_csv' && file) {
      console.log('Парсинг CSV файла');
      const rows = content.split('\n').map(row => row.split(';').map(cell => cell.trim()));
      const header = rows[0];
      if (header && header[0] === '#' && header[1] === 'Материал' && header[2].startsWith('Дата включения')) {
        for (const row of rows.slice(1)) {
          if (row.length >= 3 && /^\d+$/.test(row[0])) {
            const material_id = parseInt(row[0]);
            const material_text = row[1] || 'Не указано';
            if (material_text.includes('Исключен') && material_id >= 1088) {
              console.log('Пропущен материал:', material_id, 'из-за исключения');
              continue;
            }
            const date = row[2] || 'Не указана';
            materials.push({ id: material_id, date, material: material_text });
            console.log('Добавлен материал:', material_id);
          }
        }
      } else {
        console.error('Некорректный формат CSV');
        throw new Error('Некорректный формат CSV: ожидаются столбцы "#", "Материал", "Дата включения"');
      }
    }

    if (materials.length === 0 && file) {
      console.error('Нет данных для импорта');
      throw new Error('Файл пуст или не содержит данных');
    }
    console.log('Всего материалов для импорта:', materials.length);

    const db = await openDB();
    let tx = db.transaction('restricted_materials', 'readwrite');
    let store = tx.objectStore('restricted_materials');
    await new Promise((resolve, reject) => {
      store.clear().onsuccess = () => {
        console.log('Очистка старых записей');
        resolve();
      };
      store.clear().onerror = () => {
        console.error('Ошибка очистки:', store.clear().error);
        reject(store.clear().error);
      };
    });

    if (materials.length > 0) {
      const chunkSize = 250;
      console.log('Начало импорта данных по частям, размер порции:', chunkSize);
      for (let i = 0; i < materials.length; i += chunkSize) {
        console.log('Обработка порции:', i, 'из', materials.length);
        const chunk = materials.slice(i, i + chunkSize);
        const tx = db.transaction('restricted_materials', 'readwrite');
        const store = tx.objectStore('restricted_materials');
        try {
          for (const material of chunk) {
            store.put(material);
            console.log('Сохранена запись:', material.id);
          }
          await new Promise((resolve) => tx.oncomplete = resolve);
          console.log('Порция', i, 'успешно импортирована');
          if (typeof gc === 'function') gc();
        } catch (e) {
          console.error('Ошибка импорта порции:', e);
          throw e;
        }
      }
    }
    db.close();

    const settings = await getSettings();
    settings.hash = file ? await calculateHash(content) : '';
    settings.db_source = dbSource;
    settings.db_path = file ? file.name : '';
    await saveSettingsDB(settings);
    console.log('Настройки обновлены с новым хэшем');

    return { is_valid: true, count: materials.length };
  } catch (e) {
    console.error('Ошибка инициализации базы:', e);
    return { is_valid: false, error: e.message };
  }
}

async function updateDB() {
  console.log('Начало обновления базы');
  try {
    const settings = await getSettings();
    const dbSource = settings.db_source;
    const dbPath = settings.db_path;
    const oldHash = settings.hash;

    const file = document.getElementById('db_file')?.files[0] || document.getElementById('init_db_file')?.files[0];
    if (!file) {
      console.error('Файл не выбран');
      throw new Error('Файл не выбран');
    }
    const content = await file.text();

    const newHash = await calculateHash(content);
    if (newHash === oldHash) {
      const integrity = await checkDBIntegrity();
      if (!integrity.is_valid) return { updated: false, new_records: 0, error: integrity.error };
      console.log('База не изменилась, хэш совпадает');
      return { updated: false, new_records: 0 };
    }

    const db = await openDB();
    const tx = db.transaction('restricted_materials', 'readonly');
    const store = tx.objectStore('restricted_materials');
    const oldCount = await new Promise((resolve) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();

    const result = await initDB(dbSource, file);
    if (!result.is_valid) return { updated: false, new_records: 0, error: result.error };

    console.log('Обновление завершено, новых записей:', result.count - oldCount);
    return { updated: true, new_records: result.count - oldCount };
  } catch (e) {
    console.error('Ошибка обновления базы:', e);
    return { updated: false, new_records: 0, error: e.message };
  }
}

async function searchDB(query) {
  console.log('Поиск по запросу:', query);
  try {
    const normalizedQuery = query.toLowerCase().trim();
    const db = await openDB();
    const tx = db.transaction('restricted_materials', 'readonly');
    const store = tx.objectStore('restricted_materials');
    const index = store.index('material');
    const results = await new Promise((resolve, reject) => {
      const matches = [];
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const material = cursor.value.material.toLowerCase();
          if (material.includes(normalizedQuery)) {
            matches.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(matches);
        }
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
    console.log('Найдено записей:', results.length);
    return results;
  } catch (e) {
    console.error('Ошибка поиска:', e);
    return [];
  }
}