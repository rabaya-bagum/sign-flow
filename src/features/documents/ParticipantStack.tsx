import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components';

import type { Participant } from './types';

/** Up to three avatars plus "+n" (SPEC §5.2). Announced as a single list of names. */
export function ParticipantStack({ participants, total }: { participants: Participant[]; total: number }) {
  const { t } = useTranslation();
  if (total === 0) {
    return (
      <AppText variant="footnote" color="textTertiary">
        {t('documents.noParticipants')}
      </AppText>
    );
  }
  const extra = total - participants.length;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('documents.participantsLabel', {
        names:
          participants.map((p) => p.name).join(', ') +
          (extra > 0 ? `, ${t('documents.participantsMore', { count: extra })}` : ''),
      })}
      style={styles.row}
    >
      {participants.map((p, i) => (
        <Avatar key={`${p.email}-${i}`} name={p.name} size={28} />
      ))}
      {extra > 0 ? (
        <AppText variant="caption" color="textSecondary" style={styles.more}>
          {t('documents.participantsMore', { count: extra })}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Spaced rather than overlapped so initials are never clipped.
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  more: { marginLeft: 2 },
});
