import { Text, type TextProps } from 'react-native';

import { useTheme, type ColorToken, type TypographyVariant } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: ColorToken;
  align?: 'auto' | 'left' | 'right' | 'center';
  weight?: '400' | '500' | '600' | '700';
}

export function AppText({
  variant = 'body',
  color = 'textPrimary',
  align,
  weight,
  style,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  return (
    <Text
      {...rest}
      style={[
        theme.typography[variant],
        { color: theme.colors[color] },
        align ? { textAlign: align } : null,
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    />
  );
}
