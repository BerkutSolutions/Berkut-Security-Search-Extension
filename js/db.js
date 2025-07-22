/*
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const CURRENT_VERSION = "1.0.1";

// Функция для вычисления расстояния Левенштейна
function levenshteinDistance(a, b) {
  const matrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // удаление
        matrix[j - 1][i] + 1, // вставка
        matrix[j - 1][i - 1] + indicator // замена
      );
    }
  }
  return matrix[b.length][a.length];
}

function createWordIndex(text) {
  const normalized = text.toLowerCase().replace(/[^\wа-яА-Я\s"]/g, '').replace(/\s+/g, ' ').trim();
  const sentences = normalized.split(/[.!?]+/).filter(s => s.trim());
  const wordIndex = {};
  let globalPosition = 0;
  sentences.forEach((sentence, sentenceIndex) => {
    const words = sentence.trim().split(' ').filter(word => word.length > 1);
    words.forEach((word, index) => {
      if (!wordIndex[word]) wordIndex[word] = [];
      wordIndex[word].push({ sentence: sentenceIndex, position: globalPosition + index });
    });
    globalPosition += words.length;
  });
  return wordIndex;
}

function getWordForms(word) {
  const forms = [word];
  if (word.match(/[а-яА-Я]+$/)) {
    const base = word.replace(/[йяю]$/, '');
    forms.push(
      `${base}а`, `${base}у`, `${base}е`, `${base}ом`, `${base}ым`,
      `${base}и`, `${base}ей`, `${base}ям`, `${base}ями`
    );
  }
  return forms.filter(form => form.length > 1);
}

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
        store.createIndex('word_index', 'word_index', { unique: false });
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
      resolve({ success: true });
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
          const word_index = createWordIndex(material_text);
          materials.push({ id: material_id, date, material: material_text, word_index });
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
            const word_index = createWordIndex(material_text);
            materials.push({ id: material_id, date, material: material_text, word_index });
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
    // Очистка кэша для текущего запроса
    const cacheKey = `search:${query.toLowerCase().trim()}`;
    localStorage.removeItem(cacheKey); // Удаляем старый кэш

    const normalizedQuery = query.toLowerCase().trim().replace(/[^\wа-яА-Я\s"]/g, '').replace(/\s+/g, ' ');
    const stopWords = ['и', 'а', 'или', 'но'];
    const queryWords = normalizedQuery.split(' ').filter(word => word.length > 1 && !stopWords.includes(word));
    if (queryWords.length === 0) {
      console.log('Нет значимых слов в запросе');
      return [];
    }
    console.log('Слова запроса:', queryWords);
    const wordForms = queryWords.length === 1 ? queryWords.map(word => getWordForms(word)).flat() : queryWords; // Словаформы только для однословных запросов
    console.log('Проверяемые слова:', wordForms);
    const db = await openDB();
    const tx = db.transaction('restricted_materials', 'readonly');
    const store = tx.objectStore('restricted_materials');
    const results = await new Promise((resolve, reject) => {
      const matches = [];
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const materialText = cursor.value.material?.toLowerCase().replace(/[^\wа-яА-Я\s"]/g, '').replace(/\s+/g, ' ') || '';
          const wordIndex = cursor.value.word_index || {};
          const titleMatch = materialText.match(/^"?([^"\n]+)"?(?:\s|$)/);
          const title = titleMatch ? titleMatch[1].trim() : materialText.split('\n')[0].trim();
          const normalizedTitle = title.toLowerCase().replace(/[^\wа-яА-Я\s"]/g, '').replace(/\s+/g, ' ');

          // Проверка точного совпадения фразы или слов в любом порядке
          const isExactPhraseMatch = materialText.includes(normalizedQuery) || normalizedTitle.includes(normalizedQuery);
          const isWordMatch = queryWords.every(word => materialText.includes(word) || normalizedTitle.includes(word));

          // Проверка слов с учётом близости
          const checkWordProximity = (words, isForm = false) => {
            if (words.length === 0) return { similarity: 0, matchedWordsLog: 'никакие' };
            const matchedWords = words.map(word => {
              if (wordIndex[word]) return { word, positions: wordIndex[word] };
              // Опечатки только для однословных запросов
              if (queryWords.length === 1) {
                const similarWord = Object.keys(wordIndex).find(w => levenshteinDistance(word, w) <= Math.min(2, Math.floor(word.length / 3)));
                return similarWord ? { word: similarWord, positions: wordIndex[similarWord] } : null;
              }
              return null;
            }).filter(w => w);

            // Проверяем, что найдены все слова запроса
            const matchedWordsLog = matchedWords.length > 0 ? matchedWords.map(w => w.word).join(', ') : 'никакие';
            if (matchedWords.length < queryWords.length) {
              console.log(`Материал ${cursor.value.id}: пропущен, найдено ${matchedWords.length} из ${queryWords.length} слов: ${matchedWordsLog}`);
              return { similarity: 0, matchedWordsLog };
            }

            // Проверяем, находятся ли слова в одном предложении
            const sentenceMatches = {};
            matchedWords.forEach(({ word, positions }) => {
              positions.forEach(pos => {
                if (!sentenceMatches[pos.sentence]) sentenceMatches[pos.sentence] = new Set();
                sentenceMatches[pos.sentence].add(word);
              });
            });

            // Проверяем, есть ли предложение с ВСЕМИ словами запроса
            const validSentences = Object.keys(sentenceMatches).filter(sentence => {
              const wordsInSentence = sentenceMatches[sentence];
              return queryWords.every(qw => matchedWords.some(mw => wordsInSentence.has(mw.word) && (qw === mw.word || wordForms.includes(mw.word))));
            });
            if (!validSentences.length) {
              console.log(`Материал ${cursor.value.id}: пропущен, слова не в одном предложении: ${matchedWordsLog}`);
              return { similarity: 0, matchedWordsLog };
            }

            // Проверяем минимальное расстояние между словами в каждом предложении
            let minDistance = Infinity;
            validSentences.forEach(sentence => {
              const positions = matchedWords
                .flatMap(w => w.positions.filter(p => p.sentence === parseInt(sentence)).map(p => p.position))
                .sort((a, b) => a - b);
              if (positions.length < queryWords.length) return;
              for (let i = 0; i <= positions.length - queryWords.length; i++) {
                const distance = positions[i + queryWords.length - 1] - positions[i];
                minDistance = Math.min(minDistance, distance);
              }
            });
            if (minDistance === Infinity || minDistance > 2) {
              console.log(`Материал ${cursor.value.id}: пропущен, расстояние ${minDistance} слишком большое, слова: ${matchedWordsLog}`);
              return { similarity: 0, matchedWordsLog };
            }

            // Вычисляем схожесть
            const baseSimilarity = minDistance <= 1 ? 1.0 : queryWords.length / (queryWords.length + minDistance * 0.4);
            console.log(`Материал ${cursor.value.id}: similarity=${baseSimilarity}, minDistance=${minDistance}, isForm=${isForm}, matchedWords=${matchedWordsLog}`);
            return { similarity: isForm ? baseSimilarity * 0.9 : baseSimilarity, matchedWordsLog };
          };

          // Проверяем точные слова или словоформы (для однословных запросов)
          const exactResult = checkWordProximity(queryWords);
          const formResult = queryWords.length === 1 && wordForms.length > queryWords.length ? checkWordProximity(wordForms, true) : { similarity: 0, matchedWordsLog: 'никакие' };
          const similarity = Math.max(
            exactResult.similarity,
            formResult.similarity,
            (isExactPhraseMatch || isWordMatch) ? 1.0 : 0
          );
          const matchedWordsLog = exactResult.similarity >= formResult.similarity ? exactResult.matchedWordsLog : formResult.matchedWordsLog;

          // Порог для включения в результаты
          const hasTypo = queryWords.length === 1 && queryWords.some(word => !wordIndex[word] && Object.keys(wordIndex).some(w => levenshteinDistance(word, w) <= Math.min(2, Math.floor(word.length / 3))));
          const threshold = hasTypo ? 0.6 : 0.85;

          if (similarity >= threshold) {
            console.log(`Материал ${cursor.value.id} добавлен: similarity=${similarity}, threshold=${threshold}, matchedWords=${matchedWordsLog}`);
            matches.push({
              ...cursor.value,
              similarity
            });
          } else {
            console.log(`Материал ${cursor.value.id} пропущен: similarity=${similarity} < threshold=${threshold}, matchedWords=${matchedWordsLog}`);
          }
          cursor.continue();
        } else {
          const sortedMatches = matches.sort((a, b) => b.similarity - a.similarity);
          localStorage.setItem(cacheKey, JSON.stringify(sortedMatches));
          console.log('Найдено записей:', sortedMatches.length);
          resolve(sortedMatches);
        }
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
    return results;
  } catch (e) {
    console.error('Ошибка поиска:', e);
    return [];
  }
}
