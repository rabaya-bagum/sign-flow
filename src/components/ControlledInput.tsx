import { useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { useValidationMessage } from '@/hooks/useValidationMessage';

import { AppInput, type AppInputProps } from './AppInput';

type ControlledInputProps<T extends FieldValues> = Omit<AppInputProps, 'value' | 'onChangeText' | 'error'> & {
  control: Control<T>;
  name: FieldPath<T>;
};

/** AppInput bound to React Hook Form; translates Zod i18n-key messages. */
export function ControlledInput<T extends FieldValues>({ control, name, ...rest }: ControlledInputProps<T>) {
  const {
    field: { ref, value, onChange, onBlur },
    fieldState: { error },
  } = useController({ control, name });
  const message = useValidationMessage(error?.message);
  return (
    <AppInput
      {...rest}
      ref={ref}
      value={typeof value === 'string' ? value : ''}
      onChangeText={onChange}
      onBlur={onBlur}
      error={message}
    />
  );
}
