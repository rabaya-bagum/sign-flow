import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BottomSheet, ListRow } from '@/components';
import { useTheme } from '@/theme';

import { SORTS, type DocumentSort } from './types';

export function useSortLabel() {
  const { t } = useTranslation();
  return (sort: DocumentSort) =>
    sort === 'newest'
      ? t('documents.sortNewest')
      : sort === 'oldest'
        ? t('documents.sortOldest')
        : t('documents.sortTitle');
}

interface SortSheetProps {
  visible: boolean;
  value: DocumentSort;
  onChange: (sort: DocumentSort) => void;
  onClose: () => void;
}

export function SortSheet({ visible, value, onChange, onClose }: SortSheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const label = useSortLabel();
  return (
    <BottomSheet
      visible={visible}
      title={t('documents.sort')}
      onClose={onClose}
      closeLabel={t('common.close')}
      testID="sort-sheet"
    >
      <View accessibilityRole="radiogroup">
        {SORTS.map((sort, i) => (
          <ListRow
            key={sort}
            title={label(sort)}
            chevron={false}
            separator={i < SORTS.length - 1}
            right={
              sort === value ? (
                <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
              ) : undefined
            }
            accessibilityLabel={label(sort)}
            onPress={() => {
              onChange(sort);
              onClose();
            }}
            testID={`sort-${sort}`}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
