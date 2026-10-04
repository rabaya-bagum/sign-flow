import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FIELD_SIZES, type FieldType } from '@shared/fields';
import { rectAround } from '@shared/geometry';
import type { PageGeometry, SurfaceOverlay } from '@shared/pdfBridge';

import {
  AppButton,
  AppText,
  ConfirmationModal,
  ErrorState,
  IconButton,
  InlineAlert,
  LoadingSkeleton,
} from '@/components';
import { useDocument, useRecipients, useViewUrl } from '@/features/documents/hooks';
import type { Recipient } from '@/features/documents/types';
import { PdfSurface, type PdfSurfaceHandle } from '@/features/viewer';
import { useAppErrorMessage } from '@/hooks/useAppErrorMessage';
import { queryKeys } from '@/lib/queryKeys';
import { recipientColor, useTheme } from '@/theme';

import { addRecipient, deleteRecipient, fetchFields, updateRecipient, type RecipientInput } from './api';
import { fieldFill } from './fieldMeta';
import { FieldPropertiesSheet } from './FieldPropertiesSheet';
import { FieldToolbar } from './FieldToolbar';
import { RecipientChips } from './RecipientChips';
import { RecipientSheet } from './RecipientSheet';
import { editorReducer, initialEditorState, newField } from './state';
import { useAutosave } from './useAutosave';

/** Field editor (SPEC §5.6): place, move, resize and configure fields; autosaves to document_fields. */
export function FieldEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const errorMessage = useAppErrorMessage();
  const queryClient = useQueryClient();
  const document = useDocument(id);
  const recipientsQuery = useRecipients(id);
  const fieldsQuery = useQuery({
    queryKey: queryKeys.documents.fields(id),
    queryFn: () => fetchFields(id),
    gcTime: 0,
  });
  const editable = document.data?.status === 'draft' && document.data.isOwner;
  const viewUrl = useViewUrl(id, Boolean(document.data));

  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const [loaded, setLoaded] = useState(false);
  const autosave = useAutosave(id, state.fields, state.revision, loaded && Boolean(editable));
  const [pages, setPages] = useState<PageGeometry[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [tool, setTool] = useState<FieldType | null>(null);
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [recipientSheet, setRecipientSheet] = useState<{ recipient: Recipient | null } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Recipient | null>(null);
  const surface = useRef<PdfSurfaceHandle>(null);
  const creatingPlaceholder = useRef(false);

  const recipients = useMemo(() => recipientsQuery.data ?? [], [recipientsQuery.data]);
  const activeRecipient = recipients.find((r) => r.id === activeRecipientId) ?? recipients[0] ?? null;
  const selected = state.fields.find((f) => f.id === state.selectedId) ?? null;

  // Load saved fields once.
  if (fieldsQuery.data && !loaded) {
    setLoaded(true);
    dispatch({ type: 'load', fields: fieldsQuery.data });
  }

  // A draft needs at least one recipient to assign fields to: start with a placeholder "Signer 1".
  useEffect(() => {
    if (!editable || !recipientsQuery.isSuccess || recipients.length > 0 || creatingPlaceholder.current)
      return;
    creatingPlaceholder.current = true;
    addRecipient(id, { name: t('editor.recipientPlaceholderName', { n: 1 }), email: null }, 1)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.documents.recipients(id) }))
      .catch((e: unknown) => Alert.alert(t('errors.title'), errorMessage(e)));
  }, [editable, recipientsQuery.isSuccess, recipients.length, id, t, queryClient, errorMessage]);

  // Save when leaving the editor.
  const flush = autosave.flush;
  useEffect(() => () => void flush(), [flush]);

  const nameOf = (recipientId: string) => recipients.find((r) => r.id === recipientId)?.name ?? '';

  const overlays = useMemo<SurfaceOverlay[]>(
    () =>
      state.fields.map((f) => {
        const index = Math.max(
          0,
          recipients.findIndex((r) => r.id === f.recipient_id),
        );
        const color = recipientColor(index);
        const geometry = pages[f.page_number - 1];
        const type = t(`editor.type_${f.type}`);
        return {
          id: f.id,
          page: f.page_number,
          rect: { x: f.x, y: f.y, width: f.width, height: f.height },
          kind: 'rect',
          color,
          fill: fieldFill(color),
          text: f.width * (geometry?.width_pt ?? 600) >= 40 ? type : undefined,
          label: t('editor.fieldLabel', {
            type,
            recipient: recipients[index]?.name ?? '',
            page: f.page_number,
          }),
          editable: Boolean(editable),
          minWidth: geometry ? FIELD_SIZES[f.type].minWidth / geometry.width_pt : undefined,
          minHeight: geometry ? FIELD_SIZES[f.type].minHeight / geometry.height_pt : undefined,
        };
      }),
    [state.fields, recipients, pages, editable, t],
  );

  const place = (page: number, x: number, y: number) => {
    const geometry = pages[page - 1];
    if (!tool || !activeRecipient || !geometry) return;
    const size = FIELD_SIZES[tool];
    dispatch({
      type: 'place',
      field: newField({
        id: Crypto.randomUUID(),
        type: tool,
        recipientId: activeRecipient.id,
        page,
        rect: rectAround(geometry, { x, y }, size.width, size.height),
        existing: state.fields,
      }),
    });
    setTool(null);
  };

  const saveRecipient = async (input: RecipientInput) => {
    const editing = recipientSheet?.recipient;
    setRecipientSheet(null);
    try {
      if (editing) await updateRecipient(editing.id, input);
      else {
        const newId = await addRecipient(
          id,
          input,
          Math.max(0, ...recipients.map((r) => r.signingOrder)) + 1,
        );
        setActiveRecipientId(newId);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.recipients(id) });
    } catch (e) {
      Alert.alert(t('errors.title'), errorMessage(e));
    }
  };

  const removeRecipient = async (recipient: Recipient) => {
    setConfirmRemove(null);
    try {
      await autosave.flush();
      await deleteRecipient(recipient.id);
      dispatch({ type: 'recipientRemoved', recipientId: recipient.id });
      autosave.markLoaded(state.revision + 1); // the database already cascaded these deletes
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.recipients(id) });
    } catch (e) {
      Alert.alert(t('errors.title'), errorMessage(e));
    }
  };

  const next = async () => {
    if (await autosave.flush()) router.push({ pathname: '/documents/[id]/review', params: { id } });
  };

  const statusText =
    autosave.status === 'saving'
      ? t('editor.saving')
      : autosave.status === 'saved'
        ? t('editor.saved')
        : autosave.status === 'error'
          ? t('editor.saveError')
          : '';

  const failure = document.error ?? recipientsQuery.error ?? fieldsQuery.error ?? viewUrl.error;
  if (failure) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ErrorState
          message={`${t('editor.loadError')} ${errorMessage(failure)}`}
          onRetry={() => void queryClient.invalidateQueries({ queryKey: ['documents'] })}
        />
      </View>
    );
  }
  if (!document.data || !recipientsQuery.data || !loaded) {
    return (
      <View style={{ flex: 1, padding: theme.spacing.lg, backgroundColor: theme.colors.background }}>
        <LoadingSkeleton rows={4} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]} testID="field-editor">
      <Stack.Screen
        options={{
          title: document.data.title,
          headerRight: () =>
            editable ? (
              <View style={styles.headerRight}>
                <AppButton
                  title={t('editor.next')}
                  variant="ghost"
                  onPress={() => void next()}
                  testID="editor-next"
                />
              </View>
            ) : null,
        }}
      />
      {!editable ? <InlineAlert tone="info" message={t('editor.locked')} /> : null}
      {editable ? (
        <RecipientChips
          recipients={recipients}
          activeId={activeRecipient?.id ?? null}
          onSelect={setActiveRecipientId}
          onEdit={(recipient) => setRecipientSheet({ recipient })}
          onAdd={() => setRecipientSheet({ recipient: null })}
        />
      ) : null}
      <View style={[styles.statusRow, { paddingHorizontal: theme.spacing.md }]}>
        <AppText
          variant="footnote"
          color="textSecondary"
          style={styles.flex}
          numberOfLines={2}
          accessibilityLiveRegion="polite"
          testID="editor-hint"
        >
          {tool && activeRecipient
            ? t('editor.placeHint', { type: t(`editor.type_${tool}`), recipient: activeRecipient.name })
            : selected
              ? t('editor.selected', {
                  label: t('editor.fieldLabel', {
                    type: t(`editor.type_${selected.type}`),
                    recipient: nameOf(selected.recipient_id),
                    page: selected.page_number,
                  }),
                })
              : editable
                ? t('editor.emptyHint')
                : ''}
        </AppText>
        {editable ? (
          <>
            <AppText
              variant="caption"
              color={autosave.status === 'error' ? 'danger' : 'textTertiary'}
              testID="editor-save-status"
            >
              {statusText}
            </AppText>
            <IconButton
              icon="arrow-undo"
              accessibilityLabel={t('editor.undo')}
              onPress={() => dispatch({ type: 'undo' })}
              color={state.past.length ? 'primary' : 'textTertiary'}
              testID="editor-undo"
            />
            <IconButton
              icon="arrow-redo"
              accessibilityLabel={t('editor.redo')}
              onPress={() => dispatch({ type: 'redo' })}
              color={state.future.length ? 'primary' : 'textTertiary'}
              testID="editor-redo"
            />
          </>
        ) : null}
      </View>

      <View style={styles.flex}>
        <PdfSurface
          ref={surface}
          url={viewUrl.data ?? null}
          overlays={overlays}
          highlightId={state.selectedId}
          onLoaded={({ pages: loadedPages }) => setPages(loadedPages)}
          onPageChanged={(page) => setCurrentPage(page)}
          onTap={({ page, x, y }) => (tool ? place(page, x, y) : dispatch({ type: 'select', id: null }))}
          onOverlayTap={(fieldId) => {
            setTool(null);
            dispatch({ type: 'select', id: fieldId });
          }}
          onOverlayChanged={({ id: fieldId, rect }) => dispatch({ type: 'setRect', id: fieldId, rect })}
          testID="editor-surface"
        />
      </View>

      {editable ? (
        <View
          style={[
            styles.bottom,
            { borderTopColor: theme.colors.border, paddingBottom: Math.max(insets.bottom, theme.spacing.xs) },
          ]}
        >
          {selected ? (
            <View style={[styles.actions, { paddingHorizontal: theme.spacing.md }]}>
              <AppButton
                title={t('editor.properties')}
                icon="options-outline"
                variant="secondary"
                onPress={() => setPropertiesOpen(true)}
                testID="field-properties-open"
              />
              <IconButton
                icon="copy-outline"
                accessibilityLabel={t('editor.duplicate')}
                onPress={() => dispatch({ type: 'duplicate', id: selected.id, newId: Crypto.randomUUID() })}
                testID="field-duplicate"
              />
              <IconButton
                icon="trash-outline"
                accessibilityLabel={t('editor.delete')}
                color="danger"
                onPress={() => dispatch({ type: 'delete', id: selected.id })}
                testID="field-delete"
              />
              <AppButton
                title={t('editor.deselect')}
                variant="ghost"
                onPress={() => dispatch({ type: 'select', id: null })}
                testID="field-deselect"
              />
            </View>
          ) : (
            <>
              <FieldToolbar tool={tool} onSelect={setTool} />
              {tool ? (
                <View style={{ paddingHorizontal: theme.spacing.md }}>
                  <AppButton
                    title={t('editor.placeOnPage', { page: currentPage })}
                    variant="ghost"
                    onPress={() => place(currentPage, 0.5, 0.5)}
                    testID="tool-place-center"
                  />
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {propertiesOpen ? (
        <FieldPropertiesSheet
          field={selected}
          recipients={recipients}
          page={selected ? (pages[selected.page_number - 1] ?? null) : null}
          onChange={(patch) => selected && dispatch({ type: 'update', id: selected.id, patch })}
          onRect={(rect) => selected && dispatch({ type: 'setRect', id: selected.id, rect })}
          onClose={() => setPropertiesOpen(false)}
        />
      ) : null}
      <RecipientSheet
        visible={recipientSheet !== null}
        initial={
          recipientSheet?.recipient
            ? { name: recipientSheet.recipient.name, email: recipientSheet.recipient.email }
            : null
        }
        defaultName={t('editor.recipientPlaceholderName', { n: recipients.length + 1 })}
        canRemove={recipients.length > 1}
        onSave={(input) => void saveRecipient(input)}
        onRemove={() => {
          const recipient = recipientSheet?.recipient ?? null;
          setRecipientSheet(null);
          setConfirmRemove(recipient);
        }}
        onClose={() => setRecipientSheet(null)}
      />
      <ConfirmationModal
        visible={confirmRemove !== null}
        title={t('editor.recipient.removeConfirmTitle', { name: confirmRemove?.name ?? '' })}
        message={t('editor.recipient.removeConfirmBody')}
        confirmLabel={t('editor.recipient.remove')}
        destructive
        onConfirm={() => confirmRemove && void removeRecipient(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  flex: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  bottom: { borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
});
