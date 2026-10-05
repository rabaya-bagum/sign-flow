import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AppError } from '@shared/errors';
import type { Field } from '@shared/fields';
import type { SigningSession } from '@shared/signing';

import type { PdfSurfaceProps } from '@/features/viewer';
import { renderWithProviders } from '@/test/render';

import type { SigningClient, Submission } from '../api';
import { SigningFlow } from '../SigningFlow';

const mockSurface = { props: null as PdfSurfaceProps | null };
jest.mock('@/features/viewer', () => ({
  PdfSurface: (props: PdfSurfaceProps) => {
    mockSurface.props = props;
    return null;
  },
}));
jest.mock('@/features/documents/download', () => ({
  toAppUrl: (u: string) => u,
  shareSignedFile: jest.fn(async () => undefined),
}));
const mockSignature = { onComplete: null as null | ((r: unknown) => void) };
jest.mock('@/features/signatures/SignatureSheet', () => ({
  SignatureSheet: (props: { visible: boolean; guest?: boolean; onComplete: (r: unknown) => void }) => {
    mockSignature.onComplete = props.visible ? props.onComplete : null;
    return null;
  },
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  requestOtp: jest.fn(async () => ({ ok: true })),
  verifyOtp: jest.fn(async () => ({ ok: true })),
  downloadWithToken: jest.fn(async () => ({ url: 'https://x.test/c.pdf', file_name: 'c.pdf' })),
}));

const sigField: Field = {
  id: '00000000-0000-4000-8000-000000000001',
  recipient_id: 'r1',
  page_number: 1,
  type: 'signature',
  x: 0.1,
  y: 0.1,
  width: 0.3,
  height: 0.06,
  required: true,
  properties: {},
};
const nameField: Field = {
  ...sigField,
  id: '00000000-0000-4000-8000-000000000002',
  type: 'full_name',
  y: 0.3,
  properties: { fontSize: 12, align: 'left' },
};

function session(overrides: Partial<SigningSession> = {}): SigningSession {
  return {
    state: 'sign',
    document: {
      id: 'd1',
      title: 'Lease.pdf',
      page_count: 1,
      status: 'in_progress',
      allow_decline: true,
      expires_at: null,
      sender: { name: 'Sam Sender', email: 'sam@example.com' },
    },
    recipient: {
      id: 'r1',
      name: 'Grace Guest',
      email: 'grace@example.com',
      role: 'signer',
      status: 'viewed',
    },
    consent_required: true,
    pdf_url: 'https://storage.test/original.pdf?token=x',
    fields: [sigField, nameField],
    filled: [],
    waiting_for: [],
    can_download: false,
    masked_email: null,
    ...overrides,
  };
}

function client(open: SigningSession | Error, mode: 'guest' | 'account' = 'guest') {
  return {
    mode,
    key: 'tok',
    open: jest.fn(async () => {
      if (open instanceof Error) throw open;
      return open;
    }),
    consent: jest.fn(async () => undefined),
    submit: jest.fn(async (_submission: Submission) => ({
      outcome: 'completed' as const,
      download_token: 'dl-token',
    })),
    decline: jest.fn(async () => undefined),
    download: jest.fn(async () => ({ url: 'https://x.test/o.pdf', file_name: 'o.pdf' })),
  } satisfies SigningClient;
}

beforeEach(() => {
  mockSurface.props = null;
  mockSignature.onComplete = null;
});

it('asks for ESIGN consent first, then signs: tap, adopt a signature, confirm the name, finish', async () => {
  const c = client(session());
  await renderWithProviders(<SigningFlow client={c} />);
  expect(await screen.findByTestId('consent-sheet')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('consent-agree'));
  await waitFor(() => expect(c.consent).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByTestId('consent-sheet')).toBeNull());

  expect(mockSurface.props?.url).toBe('https://storage.test/original.pdf?token=x');
  expect(screen.getByTestId('signing-progress')).toHaveTextContent('1 of 2 required'); // name prefilled

  // Tap the signature field on the page → signature sheet → adopted image.
  await act(async () => mockSurface.props!.onTap!({ page: 1, x: 0.2, y: 0.12 }));
  expect(mockSignature.onComplete).not.toBeNull();
  await act(async () =>
    mockSignature.onComplete!({
      pngUri: 'blob:x',
      bytes: new Uint8Array([137, 80, 78, 71]),
      width: 4,
      height: 1,
      method: 'typed',
    }),
  );
  expect(screen.getByTestId('signing-progress')).toHaveTextContent('2 of 2 required');
  const overlay = mockSurface.props!.overlays!.find((o) => o.id === sigField.id);
  expect(overlay?.kind).toBe('image');

  await fireEvent.press(screen.getByTestId('signing-finish'));
  expect(screen.getByTestId('finish-sheet')).toBeOnTheScreen();
  expect(screen.getByText(/legal equivalent of your handwritten signature on "Lease.pdf"/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('finish-confirm'));
  await waitFor(() => expect(c.submit).toHaveBeenCalled());
  const body = c.submit.mock.calls[0]![0];
  expect(body.values).toEqual(
    expect.arrayContaining([
      { field_id: sigField.id, asset: 'signature' },
      { field_id: nameField.id, value: 'Grace Guest' },
    ]),
  );
  expect(body.assets.signature).toBe('iVBORw==');
  expect(await screen.findByTestId('signing-finished')).toBeOnTheScreen();
  expect(screen.getByText(/Everyone has signed/)).toBeOnTheScreen();
  expect(screen.getByTestId('signing-download-signed')).toBeOnTheScreen();
});

it('Next field opens the next required field; the name sheet validates input', async () => {
  const c = client(session({ consent_required: false, fields: [{ ...nameField, type: 'email' }] }));
  await renderWithProviders(<SigningFlow client={c} />);
  await screen.findByTestId('signing-screen');
  // Email is prefilled from the recipient, so all required fields are done.
  expect(screen.getByTestId('signing-finish')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('signing-fields'));
  await fireEvent.press(screen.getByTestId('fields-item-0'));
  await fireEvent.changeText(screen.getByTestId('field-sheet-input'), 'not an email');
  await fireEvent.press(screen.getByTestId('field-sheet-confirm'));
  expect(screen.getByText(/doesn't match what this field expects/)).toBeOnTheScreen();
});

it('declines with a reason', async () => {
  const c = client(session({ consent_required: false }));
  await renderWithProviders(<SigningFlow client={c} />);
  await fireEvent.press(await screen.findByTestId('signing-more'));
  await fireEvent.press(screen.getByText('Decline to sign'));
  expect(screen.getByTestId('decline-confirm')).toBeDisabled();
  await fireEvent.changeText(screen.getByTestId('decline-reason'), 'Wrong amount');
  await fireEvent.press(screen.getByTestId('decline-confirm'));
  await waitFor(() => expect(c.decline).toHaveBeenCalledWith('Wrong amount'));
  expect(await screen.findByText('You declined this document.')).toBeOnTheScreen();
});

it('shows link errors, status pages and the email code gate', async () => {
  const invalid = client(new AppError('LINK_EXPIRED'));
  const { unmount } = await renderWithProviders(<SigningFlow client={invalid} />);
  expect(await screen.findByText("This link doesn't work")).toBeOnTheScreen();
  expect(screen.getByText(/has expired/)).toBeOnTheScreen();
  await unmount();

  const waiting = client(session({ state: 'not_your_turn', waiting_for: ['Ann', 'Bo'], pdf_url: null }));
  const second = await renderWithProviders(<SigningFlow client={waiting} />);
  expect(await screen.findByTestId('signing-state-not_your_turn')).toBeOnTheScreen();
  expect(screen.getByText('Waiting for: Ann, Bo')).toBeOnTheScreen();
  await second.unmount();

  const otp = client(
    session({ state: 'otp_required', masked_email: 'g••••@example.com', pdf_url: null, fields: [] }),
  );
  await renderWithProviders(<SigningFlow client={otp} />);
  expect(await screen.findByTestId('signing-otp')).toBeOnTheScreen();
  expect(screen.getByText(/g••••@example.com/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('otp-send'));
  await fireEvent.changeText(await screen.findByTestId('otp-code'), '12a3456');
  expect(screen.getByTestId('otp-code').props.value).toBe('123456');
  otp.open.mockResolvedValueOnce(session({ consent_required: false }));
  await fireEvent.press(screen.getByTestId('otp-verify'));
  expect(await screen.findByTestId('signing-screen')).toBeOnTheScreen();
});

it('completed: download buttons only when the link allows it', async () => {
  const c = client(session({ state: 'completed', can_download: true, pdf_url: null, fields: [] }));
  await renderWithProviders(<SigningFlow client={c} />);
  await fireEvent.press(await screen.findByTestId('signing-download-certificate'));
  await waitFor(() => expect(c.download).toHaveBeenCalledWith('certificate'));
});
