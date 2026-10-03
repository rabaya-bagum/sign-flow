import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppInput, AppText, BottomSheet, ChipGroup } from '@/components';

import { useSenders } from './hooks';
import { EMPTY_FILTERS, type DatePreset, type DocumentFilters } from './types';

interface FilterSheetProps {
  visible: boolean;
  value: DocumentFilters;
  onApply: (filters: DocumentFilters) => void;
  onClose: () => void;
}

export function FilterSheet({ visible, value, onApply, onClose }: FilterSheetProps) {
  const { t } = useTranslation();
  const senders = useSenders();
  const [draft, setDraft] = useState(value);

  // Start from the applied filters each time the sheet opens (derived state, no effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }

  const dateOptions: { value: DatePreset; label: string }[] = [
    { value: 'any', label: t('documents.anyTime') },
    { value: '7d', label: t('documents.last7Days') },
    { value: '30d', label: t('documents.last30Days') },
    { value: '12m', label: t('documents.last12Months') },
  ];
  const senderOptions = [
    { value: '', label: t('documents.anySender') },
    ...(senders.data ?? []).map((s) => ({ value: s.id, label: s.fullName })),
  ];

  return (
    <BottomSheet
      visible={visible}
      title={t('documents.filtersTitle')}
      onClose={onClose}
      closeLabel={t('common.close')}
      testID="filter-sheet"
      footer={
        <View style={styles.footer}>
          <AppButton
            title={t('documents.showResults')}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
            testID="filter-apply"
          />
          <AppButton
            title={t('documents.clearFilters')}
            variant="ghost"
            onPress={() => setDraft(EMPTY_FILTERS)}
            testID="filter-clear"
          />
        </View>
      }
    >
      <AppText variant="subhead" weight="600" style={styles.label}>
        {t('documents.filterCreated')}
      </AppText>
      <ChipGroup
        options={dateOptions}
        value={draft.created}
        onChange={(created) => setDraft({ ...draft, created })}
        accessibilityLabel={t('documents.filterCreated')}
        testID="filter-created"
      />
      <AppText variant="subhead" weight="600" style={styles.label}>
        {t('documents.filterModified')}
      </AppText>
      <ChipGroup
        options={dateOptions}
        value={draft.modified}
        onChange={(modified) => setDraft({ ...draft, modified })}
        accessibilityLabel={t('documents.filterModified')}
        testID="filter-modified"
      />
      <AppText variant="subhead" weight="600" style={styles.label}>
        {t('documents.filterSender')}
      </AppText>
      <ChipGroup
        options={senderOptions}
        value={draft.senderId ?? ''}
        onChange={(id) => setDraft({ ...draft, senderId: id || null })}
        accessibilityLabel={t('documents.filterSender')}
        testID="filter-sender"
      />
      <View style={styles.recipient}>
        <AppInput
          label={t('documents.filterRecipient')}
          placeholder={t('documents.filterRecipientPlaceholder')}
          value={draft.recipient}
          onChangeText={(recipient) => setDraft({ ...draft, recipient })}
          autoCapitalize="none"
          autoCorrect={false}
          testID="filter-recipient"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 16, marginBottom: 4 },
  recipient: { marginTop: 16 },
  footer: { gap: 4 },
});
