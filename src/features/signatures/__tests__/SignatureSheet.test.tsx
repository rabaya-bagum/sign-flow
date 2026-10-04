import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AppError } from '@shared/errors';

import { useAuthStore } from '@/features/auth/store';
import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { SignatureSheet } from '../SignatureSheet';
import type { SavedSignature } from '../types';

// A 2×1 PNG header is enough for pngSize().
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 2, 88, 0, 0, 0, 200,
]);

const mockProduce = jest.fn();
jest.mock('../loadProducers', () => ({
  loadProducers: async () => ({ produceSignature: mockProduce }),
  loadDrawPad: async () => ({ default: () => null }),
}));
jest.mock('../localFiles', () => ({
  writeSignaturePng: jest.fn(async () => 'file:///cache/signatures/x.png'),
  clearSignatureFiles: jest.fn(),
}));
jest.mock('../api', () => ({
  SIGNATURE_URL_TTL_SECONDS: 300,
  listSavedSignatures: jest.fn(),
  saveSignature: jest.fn(),
  downloadSignature: jest.fn(),
  signatureImageUrl: jest.fn(async () => 'https://storage.test/sig.png?token=t'),
}));
const mocked = jest.mocked(api);

function savedRow(overrides: Partial<SavedSignature>): SavedSignature {
  return {
    id: 's1',
    user_id: 'u1',
    kind: 'signature',
    method: 'drawn',
    storage_path: 'u1/s1.png',
    typed_text: null,
    font_key: null,
    is_default: false,
    created_at: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'signedIn', session: { user: { id: 'u1' } } as never, recovering: false });
  mockProduce.mockResolvedValue({ bytes: PNG, width: 600, height: 200 });
});

async function open(kind: 'signature' | 'initials' = 'signature') {
  const onComplete = jest.fn();
  await renderWithProviders(
    <SignatureSheet
      visible
      kind={kind}
      defaultName="Aaliyah Fatimah"
      onComplete={onComplete}
      onClose={jest.fn()}
    />,
  );
  return onComplete;
}

describe('SignatureSheet', () => {
  it('types a signature, saves it by default (first one) and returns a local PNG', async () => {
    mocked.listSavedSignatures.mockResolvedValue([]);
    mocked.saveSignature.mockResolvedValue(savedRow({ id: 'new-id', method: 'typed' }));
    const onComplete = await open();

    await fireEvent.press(screen.getByTestId('sig-tab-type'));
    expect(screen.getByTestId('type-text').props.value).toBe('Aaliyah Fatimah');
    await fireEvent.press(screen.getByTestId('type-font-great-vibes'));
    await waitFor(() =>
      expect(screen.getByTestId('sig-save').props.accessibilityState?.checked ?? true).toBe(true),
    );
    expect(screen.getByRole('checkbox', { name: 'Save for future use' })).toBeChecked();

    await fireEvent.press(screen.getByTestId('sig-confirm'));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mockProduce).toHaveBeenCalledWith({
      method: 'typed',
      text: 'Aaliyah Fatimah',
      fontKey: 'great-vibes',
      ink: 'black',
    });
    expect(mocked.saveSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        kind: 'signature',
        method: 'typed',
        typedText: 'Aaliyah Fatimah',
        fontKey: 'great-vibes',
      }),
    );
    expect(onComplete).toHaveBeenCalledWith({
      pngUri: 'file:///cache/signatures/x.png',
      width: 600,
      height: 200,
      method: 'typed',
      savedSignatureId: 'new-id',
    });
  });

  it('prefills initials from the name and does not save when unchecked', async () => {
    mocked.listSavedSignatures.mockResolvedValue([]);
    const onComplete = await open('initials');
    await fireEvent.press(screen.getByTestId('sig-tab-type'));
    expect(screen.getByTestId('type-text').props.value).toBe('AF');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Save for future use' })).toBeChecked());
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Save for future use' }));
    await fireEvent.press(screen.getByTestId('sig-confirm'));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mocked.saveSignature).not.toHaveBeenCalled();
    expect(onComplete.mock.calls[0][0].savedSignatureId).toBeUndefined();
  });

  it('offers saved signatures first, with the default selected', async () => {
    mocked.listSavedSignatures.mockResolvedValue([
      savedRow({ id: 'a', created_at: '2026-10-02T10:00:00Z' }),
      savedRow({ id: 'b', is_default: true, method: 'uploaded', storage_path: 'u1/b.png' }),
    ]);
    mocked.downloadSignature.mockResolvedValue(PNG);
    const onComplete = await open();

    await screen.findByTestId('sig-saved-b');
    expect(screen.getByTestId('sig-saved-b')).toBeSelected();
    expect(screen.getByTestId('sig-saved-b').props.accessibilityLabel).toMatch(/uploaded signature.*Default/);
    await fireEvent.press(screen.getByTestId('sig-confirm'));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mocked.downloadSignature).toHaveBeenCalledWith('u1/b.png');
    expect(mockProduce).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ width: 600, height: 200, method: 'uploaded', savedSignatureId: 'b' }),
    );
  });

  it('does not save by default once a signature exists, and hides saving at the limit', async () => {
    mocked.listSavedSignatures.mockResolvedValue([savedRow({ id: 'a', is_default: true })]);
    await open();
    await fireEvent.press(await screen.findByTestId('sig-mode-new'));
    expect(screen.getByRole('checkbox', { name: 'Save for future use' })).not.toBeChecked();
  });

  it('explains the limit instead of offering to save a 6th', async () => {
    mocked.listSavedSignatures.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => savedRow({ id: `s${i}`, is_default: i === 0 })),
    );
    await open();
    await fireEvent.press(await screen.findByTestId('sig-mode-new'));
    expect(screen.queryByRole('checkbox', { name: 'Save for future use' })).toBeNull();
    expect(screen.getByText(/maximum of 5/)).toBeTruthy();
  });

  it('shows a friendly message for trivial input', async () => {
    mocked.listSavedSignatures.mockResolvedValue([]);
    mockProduce.mockRejectedValue(new AppError('SIGNATURE_TOO_SIMPLE'));
    const onComplete = await open();
    await fireEvent.press(screen.getByTestId('sig-tab-type'));
    await fireEvent.press(screen.getByTestId('sig-confirm'));
    expect(await screen.findByText(/too small to use as a signature/)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
