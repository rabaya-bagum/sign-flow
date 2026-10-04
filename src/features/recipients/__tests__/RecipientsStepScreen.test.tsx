import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@/features/auth/store';
import * as documentsApi from '@/features/documents/api';
import { renderWithProviders } from '@/test/render';

import * as api from '../api';
import { RecipientsStepScreen } from '../RecipientsStepScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'd1' }),
}));
let mockKey = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockKey}` }));
jest.mock('@/features/documents/api', () => ({ getRecipients: jest.fn() }));
jest.mock('@/features/editor/api', () => ({
  fetchFields: jest.fn(async () => [{ id: 'f1', recipient_id: 's2' }]),
}));
jest.mock('@/features/account/api', () => ({
  fetchProfile: jest.fn(async () => ({ id: 'owner', full_name: 'John Doe', email: 'owner@signflow.test' })),
}));
jest.mock('../api', () => ({ saveRecipientChanges: jest.fn(async () => undefined) }));

const docs = jest.mocked(documentsApi);
const save = jest.mocked(api.saveRecipientChanges);
const { router } = jest.requireMock<{ router: { push: jest.Mock; replace: jest.Mock } }>('expo-router');
const saved = (id: string, name: string, email: string | null, order: number, role = 'signer') =>
  ({
    id,
    name,
    email,
    role,
    signingOrder: order,
    status: 'pending',
    userId: null,
    lastActionAt: null,
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockKey = 0;
  useAuthStore.setState({
    status: 'signedIn',
    session: { user: { id: 'owner' } } as never,
    recovering: false,
  });
});

describe('RecipientsStepScreen', () => {
  it('fills in a placeholder from the editor, adds me, orders sequentially and continues to fields', async () => {
    docs.getRecipients.mockResolvedValue([saved('s1', 'Signer 1', null, 1)]);
    await renderWithProviders(<RecipientsStepScreen />);
    await fireEvent.changeText(await screen.findByTestId('recipient-email-0'), 'Aaliyah@Example.com');
    await fireEvent.changeText(screen.getByTestId('recipient-name-0'), 'Aaliyah Fatimah');
    await fireEvent.press(await screen.findByRole('button', { name: 'Add me' }));
    await fireEvent(screen.getByTestId('recipients-sequential'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('recipients-next'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith('d1', {
      remove: [],
      update: [
        { id: 's1', name: 'Aaliyah Fatimah', email: 'aaliyah@example.com', role: 'signer', signing_order: 1 },
      ],
      insert: [{ name: 'John Doe', email: 'owner@signflow.test', role: 'signer', signing_order: 2 }],
    });
    expect(router.push).toHaveBeenCalledWith({ pathname: '/documents/[id]/fields', params: { id: 'd1' } });
  });

  it('shows validation errors and does not save', async () => {
    docs.getRecipients.mockResolvedValue([]);
    await renderWithProviders(<RecipientsStepScreen />);
    await fireEvent.press(await screen.findByTestId('recipients-add'));
    await fireEvent.changeText(screen.getByTestId('recipient-email-0'), 'same@x.test');
    await fireEvent.changeText(screen.getByTestId('recipient-email-1'), 'SAME@x.test');
    await fireEvent.press(screen.getByTestId('recipients-next'));
    expect(screen.getAllByText('Enter a name.')).toHaveLength(2);
    expect(screen.getByText('This email is already in the list.')).toBeOnTheScreen();
    expect(save).not.toHaveBeenCalled();
  });

  it('reorders with the arrow buttons and changes roles', async () => {
    docs.getRecipients.mockResolvedValue([
      saved('s1', 'Ann', 'ann@x.test', 1),
      saved('s2', 'Bob', 'bob@x.test', 2),
    ]);
    await renderWithProviders(<RecipientsStepScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Move Bob up' }));
    await fireEvent.press(screen.getByTestId('recipient-role-1-cc'));
    await fireEvent.press(screen.getByTestId('recipients-close'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![1].update).toEqual([
      { id: 's2', name: 'Bob', email: 'bob@x.test', role: 'signer', signing_order: 1 },
      { id: 's1', name: 'Ann', email: 'ann@x.test', role: 'cc', signing_order: 1 },
    ]);
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/documents/[id]', params: { id: 'd1' } });
  });

  it('confirms before removing a recipient who has fields', async () => {
    docs.getRecipients.mockResolvedValue([
      saved('s1', 'Ann', 'ann@x.test', 1),
      saved('s2', 'Bob', 'bob@x.test', 1),
    ]);
    await renderWithProviders(<RecipientsStepScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove Bob' }));
    await fireEvent.press(screen.getByTestId('recipients-next'));
    expect(await screen.findByText('Remove recipients with fields?')).toBeOnTheScreen();
    expect(save).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove and continue' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('d1', expect.objectContaining({ remove: ['s2'] })));
  });
});
