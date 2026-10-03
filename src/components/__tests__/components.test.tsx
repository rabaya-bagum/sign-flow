import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';
import { DISPLAY_STATUSES } from '@/theme';

import { AppButton } from '../AppButton';
import { AppInput } from '../AppInput';
import { Avatar, initialsFor } from '../Avatar';
import { Checkbox } from '../Checkbox';
import { ConfirmationModal } from '../ConfirmationModal';
import { EmptyState } from '../EmptyState';
import { ListRow } from '../ListRow';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { StatusBadge } from '../StatusBadge';

describe('AppButton', () => {
  it('is an accessible button that fires onPress', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<AppButton title="Send" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while disabled or loading, and reports busy', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <>
        <AppButton title="Disabled" onPress={onPress} disabled />
        <AppButton title="Loading" onPress={onPress} loading />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Disabled' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Loading' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Loading' })).toBeBusy();
  });
});

describe('AppInput', () => {
  it('labels the field and shows the error as an alert', async () => {
    await renderWithProviders(<AppInput label="Email" value="" error="Enter a valid email address." />);
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
  });

  it('toggles secure text visibility', async () => {
    await renderWithProviders(<AppInput label="Password" value="secret-value-1" secureTextEntry />);
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeOnTheScreen();
  });
});

describe('StatusBadge', () => {
  it.each(DISPLAY_STATUSES)('renders an accessible label for %s', async (status) => {
    await renderWithProviders(<StatusBadge status={status} />);
    expect(screen.getAllByLabelText(/.+/)[0]).toBeOnTheScreen();
  });

  it('uses the spec copy', async () => {
    await renderWithProviders(<StatusBadge status="needs_signature" />);
    expect(screen.getByLabelText('Needs your signature')).toBeOnTheScreen();
  });
});

describe('Checkbox', () => {
  it('exposes checked state and toggles', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <Checkbox checked={false} onChange={onChange} accessibilityLabel="Accept terms" />,
    );
    const box = screen.getByRole('checkbox', { name: 'Accept terms' });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('ListRow', () => {
  it('does not respond when disabled', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <ListRow title="Biometrics" subtitle="Coming in Phase 8" onPress={onPress} disabled />,
    );
    await fireEvent.press(screen.getByText('Biometrics'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('combines title and value into the accessible name', async () => {
    await renderWithProviders(<ListRow title="Drafts" value="7" onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Drafts, 7' })).toBeOnTheScreen();
  });
});

describe('EmptyState', () => {
  it('renders title, body, tag and action', async () => {
    const onAction = jest.fn();
    await renderWithProviders(
      <EmptyState
        title="Nothing here"
        body="Body"
        tag="Coming in Phase 2"
        actionLabel="Upload"
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('header', { name: 'Nothing here' })).toBeOnTheScreen();
    expect(screen.getByText('Coming in Phase 2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Upload' }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('ConfirmationModal', () => {
  it('calls confirm and cancel handlers', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await renderWithProviders(
      <ConfirmationModal
        visible
        title="Log out?"
        confirmLabel="Log out"
        onConfirm={onConfirm}
        onCancel={onCancel}
        destructive
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    expect(onConfirm).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('Avatar', () => {
  it('derives initials', () => {
    expect(initialsFor('Aaliyah Fatimah')).toBe('AF');
    expect(initialsFor('john')).toBe('J');
    expect(initialsFor('  ')).toBe('?');
  });

  it('is labelled with the name', async () => {
    await renderWithProviders(<Avatar name="John Doe" />);
    expect(screen.getByRole('image', { name: 'John Doe' })).toBeOnTheScreen();
  });
});

describe('LoadingSkeleton', () => {
  it('is announced once as loading', async () => {
    await renderWithProviders(<LoadingSkeleton rows={2} />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeOnTheScreen();
  });
});
