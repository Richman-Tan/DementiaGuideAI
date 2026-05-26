import AsyncStorage from '@react-native-async-storage/async-storage';

const FEEDBACK_KEY = 'feedback_log_v1';

export async function logFeedback({ messageId, query, answer, feedback }) {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    const log = raw ? JSON.parse(raw) : [];
    log.push({ messageId, query, answer, feedback, timestamp: new Date().toISOString() });
    await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(log));
  } catch { /* non-critical */ }
}

export async function getFeedbackLog() {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function clearFeedbackLog() {
  try {
    await AsyncStorage.removeItem(FEEDBACK_KEY);
  } catch { /* non-critical */ }
}
