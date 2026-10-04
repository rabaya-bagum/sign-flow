import { NOTIFICATION_TYPES, parseNotificationPrefs, wants } from '../notifications';

it('fills defaults and tolerates partial or broken values', () => {
  expect(parseNotificationPrefs({})).toEqual({
    email: true,
    push: true,
    topics: { requests: true, reminders: true, completed: true, activity: true },
  });
  expect(parseNotificationPrefs({ topics: { activity: false } }).topics).toEqual({
    requests: true,
    reminders: true,
    completed: true,
    activity: false,
  });
  expect(parseNotificationPrefs({ email: 'yes' }).email).toBe(true);
  expect(parseNotificationPrefs(null).push).toBe(true);
});

it('a channel needs both the channel and the topic on', () => {
  const prefs = parseNotificationPrefs({ push: false, topics: { reminders: false } });
  expect(wants(prefs, 'push', 'requests')).toBe(false);
  expect(wants(prefs, 'email', 'requests')).toBe(true);
  expect(wants(prefs, 'email', NOTIFICATION_TYPES.expiring)).toBe(false);
});
