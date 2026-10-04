import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { isAppError } from '@shared/errors';
import type { SigningSession, SubmitSigningResult } from '@shared/signing';

import { AppButton, AppInput, AppText, Card, InlineAlert, Screen } from '@/components';
import type { DownloadKind } from '@/features/documents/api';
import { shareSignedFile } from '@/features/documents/download';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { env } from '@/lib/env';
import { openLink } from '@/lib/openLink';
import { queryKeys } from '@/lib/queryKeys';
import { useTheme } from '@/theme';

import { downloadWithToken, requestOtp, type SigningClient, verifyOtp } from './api';
import { SigningScreen } from './SigningScreen';

export interface SigningFlowProps {
  client: SigningClient;
  onViewDetails?: () => void;
  /** Leave the flow (in-app: back to the document). */
  onExit?: () => void;
  /** Called after a successful submit or decline (in-app: refresh lists). */
  onChanged?: () => void;
}

type Outcome = { kind: 'submitted'; result: SubmitSigningResult; approved: boolean } | { kind: 'declined' };

/**
 * Loads a signing session and shows the right step (SPEC §5.5, §5.12): the email code check,
 * the signing screen, a status page (not your turn, already signed, completed, closed), or the
 * finished page with downloads.
 */
export function SigningFlow({ client, onViewDetails, onExit, onChanged }: SigningFlowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const key = queryKeys.signing(client.mode, client.key);
  const session = useQuery({
    queryKey: key,
    queryFn: () => client.open(),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (outcome) {
    return <Finished outcome={outcome} client={client} session={session.data ?? null} onExit={onExit} />;
  }

  if (session.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]} testID="signing-loading">
        <ActivityIndicator color={theme.colors.textSecondary} accessibilityLabel={t('signing.loading')} />
      </View>
    );
  }

  if (session.isError) {
    const code = isAppError(session.error) ? session.error.code : null;
    const linkProblem = code === 'LINK_INVALID' || code === 'LINK_EXPIRED' || code === 'NOT_FOUND';
    return (
      <Message
        title={linkProblem ? t('signing.linkErrorTitle') : t('errors.title')}
        body={errorMessage(session.error)}
        action={linkProblem ? undefined : { label: t('common.retry'), onPress: () => void session.refetch() }}
        testID="signing-error-page"
      />
    );
  }

  const data = session.data;
  const refresh = () => void queryClient.resetQueries({ queryKey: key });

  if (data.state === 'otp_required') {
    return <OtpGate token={client.key} session={data} onVerified={refresh} />;
  }
  if (data.state === 'sign' || data.state === 'approve' || data.state === 'view') {
    return (
      <SigningScreen
        client={client}
        session={data}
        onViewDetails={onViewDetails}
        onDone={onExit}
        onSubmitted={(result) => {
          setOutcome({ kind: 'submitted', result, approved: data.state === 'approve' });
          onChanged?.();
        }}
        onDeclined={() => {
          setOutcome({ kind: 'declined' });
          onChanged?.();
        }}
      />
    );
  }

  return <StatusPage session={data} client={client} onExit={onExit} />;
}

function Message({
  title,
  body,
  children,
  action,
  testID,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
  action?: { label: string; onPress: () => void };
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Screen scroll testID={testID}>
      <View style={{ gap: theme.spacing.md, paddingVertical: theme.spacing.xl }}>
        <AppText variant="title2" accessibilityRole="header">
          {title}
        </AppText>
        <AppText>{body}</AppText>
        {children}
        {action ? <AppButton title={action.label} onPress={action.onPress} /> : null}
      </View>
    </Screen>
  );
}

function DownloadButtons({
  download,
}: {
  download: (kind: DownloadKind) => Promise<{ url: string; file_name: string }>;
}) {
  const { t } = useTranslation();
  const errorMessage = useAppErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<DownloadKind | null>(null);
  const run = async (kind: DownloadKind) => {
    setError(null);
    setBusy(kind);
    try {
      await shareSignedFile(await download(kind));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {error ? <InlineAlert message={error} /> : null}
      <AppButton
        title={t('signing.downloadSigned')}
        icon="download-outline"
        loading={busy === 'completed'}
        onPress={() => void run('completed')}
        testID="signing-download-signed"
      />
      <AppButton
        title={t('signing.downloadCertificate')}
        icon="ribbon-outline"
        variant="secondary"
        loading={busy === 'certificate'}
        onPress={() => void run('certificate')}
        testID="signing-download-certificate"
      />
    </>
  );
}

function GetApp() {
  const { t } = useTranslation();
  if (!env.appDownloadUrl) return null;
  return (
    <AppButton
      title={t('signing.getApp')}
      icon="phone-portrait-outline"
      variant="secondary"
      onPress={() => void openLink(env.appDownloadUrl)}
    />
  );
}

function StatusPage({
  session,
  client,
  onExit,
}: {
  session: SigningSession;
  client: SigningClient;
  onExit?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const state = session.state;
  const body =
    state === 'completed' && !session.can_download
      ? t('signing.state_completedNoDownload')
      : t(
          `signing.state_${state as 'not_your_turn' | 'done' | 'completed' | 'declined' | 'voided' | 'expired'}`,
        );
  return (
    <Message title={session.document.title} body={body} testID={`signing-state-${state}`}>
      <AppText variant="footnote" color="textSecondary">
        {t('signing.sentBy', { name: session.document.sender.name })}
      </AppText>
      {state === 'not_your_turn' && session.waiting_for.length > 0 ? (
        <Card>
          <AppText>{t('signing.waitingFor', { names: session.waiting_for.join(', ') })}</AppText>
        </Card>
      ) : null}
      {state === 'completed' && session.can_download ? <DownloadButtons download={client.download} /> : null}
      {client.mode === 'guest' && session.document.sender.email ? (
        <AppText variant="footnote" color="textSecondary">
          {t('signing.contactSender', { email: session.document.sender.email })}
        </AppText>
      ) : null}
      {client.mode === 'guest' ? <GetApp /> : null}
      {onExit ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <AppButton title={t('common.done')} variant="secondary" onPress={onExit} />
        </View>
      ) : null}
    </Message>
  );
}

function Finished({
  outcome,
  client,
  session,
  onExit,
}: {
  outcome: Outcome;
  client: SigningClient;
  session: SigningSession | null;
  onExit?: () => void;
}) {
  const { t } = useTranslation();
  if (outcome.kind === 'declined') {
    return (
      <Message title={session?.document.title ?? ''} body={t('signing.declined')} testID="signing-finished">
        {onExit ? <AppButton title={t('common.done')} onPress={onExit} /> : null}
      </Message>
    );
  }
  const { result, approved } = outcome;
  const next =
    result.outcome === 'completed'
      ? t('signing.submittedCompleted')
      : result.outcome === 'finalizing'
        ? t('signing.submittedFinalizing')
        : t('signing.submittedWaiting');
  const download =
    result.outcome !== 'completed'
      ? null
      : client.mode === 'account'
        ? client.download
        : result.download_token
          ? (kind: DownloadKind) => downloadWithToken(result.download_token!, kind)
          : null;
  return (
    <Message
      title={approved ? t('signing.submittedApproved') : t('signing.submitted')}
      body={next}
      testID="signing-finished"
    >
      {download ? <DownloadButtons download={download} /> : null}
      {client.mode === 'guest' ? <GetApp /> : null}
      {onExit ? <AppButton title={t('common.done')} variant="secondary" onPress={onExit} /> : null}
    </Message>
  );
}

/** Email code check before a protected link shows the document (SPEC §7). */
function OtpGate({
  token,
  session,
  onVerified,
}: {
  token: string;
  session: SigningSession;
  onVerified: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const errorMessage = useAppErrorMessage();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestOtp(token);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(token, code);
      onVerified();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Message
      title={t('signing.otpTitle')}
      body={t('signing.otpBody', { sender: session.document.sender.name, email: session.masked_email ?? '' })}
      testID="signing-otp"
    >
      {error ? <InlineAlert message={error} testID="otp-error" /> : null}
      {sent ? <InlineAlert tone="success" message={t('signing.otpSent')} /> : null}
      {sent ? (
        <View style={{ gap: theme.spacing.sm }}>
          <AppInput
            label={t('signing.otpCode')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            testID="otp-code"
          />
          <AppButton
            title={t('signing.otpVerify')}
            disabled={code.length !== 6}
            loading={busy}
            onPress={() => void verify()}
            testID="otp-verify"
          />
          <AppButton title={t('signing.otpResend')} variant="secondary" onPress={() => void send()} />
        </View>
      ) : (
        <AppButton
          title={t('signing.otpSend')}
          loading={busy}
          onPress={() => void send()}
          testID="otp-send"
        />
      )}
    </Message>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
