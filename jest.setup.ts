// Global Jest setup. Keep mocks minimal and explicit.
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// Real translations in tests, so assertions read like the UI.
import '@/lib/i18n';
