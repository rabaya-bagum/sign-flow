import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { profileSchema, type ProfileValues } from '@shared/auth';

import {
  AppButton,
  AppInput,
  ControlledInput,
  ErrorState,
  InlineAlert,
  LoadingSkeleton,
  Screen,
} from '@/components';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';

import { useProfile, useUpdateProfile } from './hooks';

export function ProfileScreen() {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, reset, formState } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: '', phone: '' },
  });

  useEffect(() => {
    if (profile.data) reset({ fullName: profile.data.full_name, phone: profile.data.phone ?? '' });
  }, [profile.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await update.mutateAsync(values);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  if (profile.isPending) return <LoadingSkeleton rows={2} />;
  if (profile.isError)
    return <ErrorState message={errorMessage(profile.error)} onRetry={() => void profile.refetch()} />;

  return (
    <Screen scroll edges={['bottom']} contentStyle={{ paddingTop: 16 }}>
      {error ? <InlineAlert message={error} /> : null}
      <ControlledInput
        control={control}
        name="fullName"
        label={t('account.fullName')}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        testID="profile-name"
      />
      <AppInput
        label={t('account.email')}
        value={profile.data.email}
        editable={false}
        hint={t('account.emailReadOnly')}
      />
      <ControlledInput
        control={control}
        name="phone"
        label={t('account.phoneOptional')}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        testID="profile-phone"
      />
      <AppButton
        title={t('common.save')}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
        disabled={!formState.isDirty}
        testID="profile-save"
      />
    </Screen>
  );
}
