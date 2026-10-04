import { Pressable } from 'react-native';

import { MIN_TOUCH_TARGET } from '@/theme';

import { AppText } from './AppText';

interface TextLinkProps {
  title: string;
  onPress: () => void;
  accessibilityHint?: string;
  role?: 'button' | 'link';
  testID?: string;
}

export function TextLink({ title, onPress, accessibilityHint, role = 'button', testID }: TextLinkProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      hitSlop={8}
      testID={testID}
      style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: 'center' }}
    >
      <AppText variant="subhead" color="primary" weight="600">
        {title}
      </AppText>
    </Pressable>
  );
}
