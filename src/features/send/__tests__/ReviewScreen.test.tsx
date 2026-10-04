import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useAuthStore } from '@/features/auth/store';
import * as documentsApi from '@/features/documents/api';
import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { ReviewScreen } from '../ReviewScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'd1' }),
  Stack: { Screen: () => null },
}));
jest.mock('@/features/documents/api', () => ({ getDocument: jest.fn(), getRecipients: jest.fn() }));
const R1 = '11111111-1111-4111-8111-111111111111';
const mockFields = jest.fn();
jest.mock('@/features/editor/api', () => ({ fetchFields: () => mockFields() }));
jest.mock('@/features/account/api', () => ({
  fetchProfile: jest.fn(async () => ({
    id: 'owner',
    full_name: 'John Doe',
    email: 'o@x.test',
    default_expiry_days: 14,
    default_reminder: { first_after_days: 2, repeat_every_days: 2 },
  })),
}));
jest.mock('../api', () => ({
  fetchSendSettings: jest.fn(async () => ({
    email_subject: null,
    email_message: null,
    expires_at: null,
    reminder_first_after_days: null,
    reminder_repeat_every_days: null,
    require_email_otp: false,
    allow_decline: true,
  })),
  saveSendSettings: jest.fn(async () => undefined),
  sendDocument: jest.fn(async () => ({ document_id: 'd1', status: 'in_progress', notified: 1, failed: [] })),
}));

const docs = jest.mocked(documentsApi);
const sendApi = jest.mocked(api);
const signatureField = {
  id: '00000000-0000-4000-8000-000000000001',
  recipient_id: R1,
  page_number: 1,
  type: 'signature',
  x: 0.1,
  y: 0.1,
  width: 0.3,
  height: 0.05,
  required: true,
  properties: {},
};
const recipient = (email: string | null, name = 'Aaliyah') => ({
  id: R1,
  name,
  email,
  role: 'signer' as const,
  signingOrder: 1,
  status: 'pending' as const,
  userId: null,
  lastActionAt: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useAuthStore.setState({
    status: 'signedIn',
    session: { user: { id: 'owner' } } as never,
    recovering: false,
  });
  docs.getDocument.mockResolvedValue({
    id: 'd1',
    title: 'Lease.pdf',
    status: 'draft',
    isOwner: true,
    pageCount: 3,
    uploadIncomplete: false,
  } as never);
  docs.getRecipients.mockResolvedValue([recipient('a@x.test')]);
  mockFields.mockResolvedValue([signatureField]);
});

describe('ReviewScreen', () => {
  it('uses profile defaults and sends with the chosen settings', async () => {
    await renderWithProviders(<ReviewScreen />);
    expect((await screen.findByTestId('review-subject')).props.value).toBe('Please sign: Lease.pdf');
    expect(screen.getByTestId('review-expiry-14')).toBeSelected();
    expect(screen.getByTestId('review-reminders-2')).toBeSelected();
    await fireEvent.changeText(screen.getByTestId('review-message'), 'Thanks!');
    await fireEvent.press(screen.getByTestId('review-expiry-7'));
    await fireEvent.press(screen.getByTestId('review-send'));
    await waitFor(() => expect(sendApi.sendDocument).toHaveBeenCalled());
    const [, settings] = sendApi.sendDocument.mock.calls[0]!;
    expect(settings).toMatchObject({
      email_subject: 'Please sign: Lease.pdf',
      email_message: 'Thanks!',
      reminder_first_after_days: 2,
      reminder_repeat_every_days: 2,
      require_email_otp: false,
      allow_decline: true,
    });
    const days = (Date.parse(settings.expires_at!) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(Alert.alert).toHaveBeenCalledWith('Sent', 'We emailed 1 person.');
  });

  it('lists what is missing and blocks Send', async () => {
    docs.getRecipients.mockResolvedValue([recipient(null, 'Signer 1')]);
    mockFields.mockResolvedValue([]);
    await renderWithProviders(<ReviewScreen />);
    expect(await screen.findByText('• Signer 1 needs an email address.')).toBeOnTheScreen();
    expect(screen.getByText('• Signer 1 needs at least one signature field.')).toBeOnTheScreen();
    expect(screen.getByTestId('review-send')).toBeDisabled();
  });

  it('saves the settings on the draft', async () => {
    await renderWithProviders(<ReviewScreen />);
    await fireEvent.press(await screen.findByTestId('review-reminders-0'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Allow signers to decline' }));
    await fireEvent.press(screen.getByTestId('review-save'));
    await waitFor(() => expect(sendApi.saveSendSettings).toHaveBeenCalled());
    expect(sendApi.saveSendSettings.mock.calls[0]![1]).toMatchObject({
      reminder_first_after_days: null,
      allow_decline: false,
    });
    expect(sendApi.sendDocument).not.toHaveBeenCalled();
  });
});
