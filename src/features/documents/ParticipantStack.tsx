import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar } from '@/components';
import { useTheme } from '@/theme';

import type { Participant } from './types';

/** Up to three avatars plus "+n" (SPEC §5.2). Announced as a single list of names. */
export function ParticipantStack({ participants, total }: { participants: Participant[]; total: number }) {
  const theme = useTheme();
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
        <View
          key={`${p.email}-${i}`}
          style={[styles.item, i > 0 ? styles.overlap : null, { borderColor: theme.colors.surfaceElevated }]}
        >
          <Avatar name={p.name} size={26} />
        </View>
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
  row: { flexDirection: 'row', alignItems: 'center' },
  item: { borderWidth: 2, borderRadius: 15 },
  overlap: { marginLeft: -8 },
  more: { marginLeft: 6 },
});
