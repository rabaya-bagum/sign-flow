import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton, AppInput, AppText, BottomSheet, InlineAlert } from '@/components';
import { useTheme } from '@/theme';

/** Void with a required reason (SPEC §6.2). */
export function VoidSheet({
  visible,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [reason, setReason] = useState('');
  return (
    <BottomSheet
      visible={visible}
      title={t('lifecycle.voidTitle')}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      testID="void-sheet"
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          {error ? <InlineAlert message={error} /> : null}
          <AppButton
            title={t('lifecycle.voidConfirm')}
            variant="destructive"
            disabled={reason.trim().length === 0}
            loading={busy}
            onPress={() => onConfirm(reason.trim())}
            testID="void-confirm"
          />
        </View>
      }
    >
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
        <AppText>{t('lifecycle.voidBody')}</AppText>
        <AppInput
          label={t('lifecycle.voidReason')}
          hint={t('lifecycle.voidReasonHint')}
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={1000}
          testID="void-reason"
        />
      </View>
    </BottomSheet>
  );
}
