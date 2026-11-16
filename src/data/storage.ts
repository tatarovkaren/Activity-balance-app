// Локальная рабочая копия: приложение открывается мгновенно и работает без интернета.
// AsyncStorage на вебе — это localStorage; все чтения и записи в try/catch (приватный режим и т.п.).

import AsyncStorage from '@react-native-async-storage/async-storage';

export const PREFIX = 'balans_';

export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function save(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно — данные останутся в памяти до закрытия */
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export async function clearAll(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    await AsyncStorage.multiRemove(keys);
  } catch {
    /* ignore */
  }
}
