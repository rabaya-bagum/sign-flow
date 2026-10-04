import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { useAuthStore } from '@/features/auth/store';
import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { SignaturesScreen } from '../SignaturesScreen';
import type { SavedSignature } from '../types';

jest.mock('../api', () => ({
  SIGNATURE_URL_TTL_SECONDS: 300,
  listSavedSignatures: jest.fn(),
  setDefaultSignature: jest.fn(),
  deleteSignature: jest.fn(),
  saveSignature: jest.fn(),
  downloadSignature: jest.fn(),
  signatureImageUrl: jest.fn(async () => 'https://storage.test/sig.png?token=t'),
}));
jest.mock('@/features/account/api', () => ({
  fetchProfile: jest.fn(async () => ({ id: 'u1', full_name: 'John Doe' })),
}));
jest.mock('../loadProducers', () => ({
  loadProducers: async () => ({ produceSignature: jest.fn() }),
  loadDrawPad: async () => ({ default: () => null }),
}));
const mocked = jest.mocked(api);

const row = (o: Partial<SavedSignature>): SavedSignature => ({
  id: 's1',
  user_id: 'u1',
  kind: 'signature',
  method: 'drawn',
  storage_path: 'u1/s1.png',
  typed_text: null,
  font_key: null,
  is_default: false,
  created_at: '2026-10-01T10:00:00Z',
  ...o,
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'signedIn', session: { user: { id: 'u1' } } as never, recovering: false });
});

describe('SignaturesScreen', () => {
  it('shows the empty state with a way to add one', async () => {
    mocked.listSavedSignatures.mockResolvedValue([]);
    await renderWithProviders(<SignaturesScreen />);
    expect(await screen.findByText('Save a signature to sign faster.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add signature' }));
    expect(await screen.findByText('Your signature')).toBeOnTheScreen();
  });

  it('lists signatures and initials, marking the default', async () => {
    mocked.listSavedSignatures.mockResolvedValue([
      row({ id: 'a', is_default: true }),
      row({ id: 'b', method: 'typed', typed_text: 'John Doe', font_key: 'caveat' }),
      row({ id: 'c', kind: 'initials', is_default: true }),
    ]);
    await renderWithProviders(<SignaturesScreen />);
    expect(await screen.findByTestId('signature-item-a')).toHaveAccessibleName(/drawn signature.*Default/);
    expect(screen.getByTestId('signature-item-b')).toHaveAccessibleName(/typed signature/);
    expect(screen.getByTestId('signature-item-b')).not.toHaveAccessibleName(/Default/);
    expect(screen.getByTestId('signature-item-c')).toHaveAccessibleName(/drawn initials.*Default/);
    expect(screen.getByRole('button', { name: 'Add initials' })).toBeEnabled();
  });

  it('sets a default from the item menu', async () => {
    mocked.listSavedSignatures.mockResolvedValue([row({ id: 'a', is_default: true }), row({ id: 'b' })]);
    mocked.setDefaultSignature.mockResolvedValue();
    await renderWithProviders(<SignaturesScreen />);
    await fireEvent.press(await screen.findByTestId('signature-item-b'));
    await fireEvent.press(within(screen.getByTestId('signature-actions')).getByText('Set as default'));
    await waitFor(() => expect(mocked.setDefaultSignature).toHaveBeenCalledWith('b'));
  });

  it('deletes only after confirmation', async () => {
    const a = row({ id: 'a', is_default: true });
    mocked.listSavedSignatures.mockResolvedValue([a]);
    mocked.deleteSignature.mockResolvedValue();
    await renderWithProviders(<SignaturesScreen />);
    await fireEvent.press(await screen.findByTestId('signature-item-a'));
    expect(within(screen.getByTestId('signature-actions')).queryByText('Set as default')).toBeNull();
    await fireEvent.press(within(screen.getByTestId('signature-actions')).getByText('Delete'));
    expect(mocked.deleteSignature).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this signature?')).toBeOnTheScreen();
    await fireEvent.press(
      within(screen.getByTestId('signature-delete-confirm')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(mocked.deleteSignature).toHaveBeenCalledWith(a, expect.anything()));
  });

  it('disables adding at the limit of 5', async () => {
    mocked.listSavedSignatures.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => row({ id: `s${i}`, is_default: i === 0 })),
    );
    await renderWithProviders(<SignaturesScreen />);
    expect(await screen.findByRole('button', { name: 'Maximum of 5 saved' })).toBeDisabled();
  });
});
