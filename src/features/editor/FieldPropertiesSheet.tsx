import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { DATE_FORMATS, FIELD_SIZES, FONT_SIZES, textValidationSchema, type Field } from '@shared/fields';
import { moveFractionRect, resizeFractionRect, type FractionalRect } from '@shared/geometry';

import { AppInput, AppText, BottomSheet, Checkbox, ChipGroup, IconButton } from '@/components';
import type { Recipient } from '@/features/documents/types';
import { useTheme } from '@/theme';

interface FieldPropertiesSheetProps {
  field: Field | null;
  recipients: Recipient[];
  page: { width_pt: number; height_pt: number } | null;
  onChange: (patch: Partial<Pick<Field, 'recipient_id' | 'required' | 'properties'>>) => void;
  onRect: (rect: FractionalRect) => void;
  onClose: () => void;
}

const NUDGE = 0.005;

/** Properties of the selected field (SPEC §5.6), plus button-based move/resize for accessibility. */
export function FieldPropertiesSheet({
  field,
  recipients,
  page,
  onChange,
  onRect,
  onClose,
}: FieldPropertiesSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  if (!field) return null;
  const props = field.properties;
  const set = (patch: Record<string, unknown>) => onChange({ properties: { ...props, ...patch } });
  const textLike = field.type === 'text' || field.type === 'full_name' || field.type === 'email';
  const rect = { x: field.x, y: field.y, width: field.width, height: field.height };
  const min = page
    ? {
        width: FIELD_SIZES[field.type].minWidth / page.width_pt,
        height: FIELD_SIZES[field.type].minHeight / page.height_pt,
      }
    : { width: 0.02, height: 0.01 };

  return (
    <BottomSheet
      visible
      title={t('editor.props.title', { type: t(`editor.type_${field.type}`) })}
      onClose={onClose}
      closeLabel={t('editor.props.done')}
      testID="field-properties"
    >
      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="subhead" color="textSecondary">
            {t('editor.props.recipient')}
          </AppText>
          <ChipGroup
            scroll
            accessibilityLabel={t('editor.props.recipient')}
            options={recipients.map((r) => ({ value: r.id, label: r.name }))}
            value={field.recipient_id}
            onChange={(recipient_id) => onChange({ recipient_id })}
            testID="prop-recipient"
          />
        </View>

        {field.type !== 'radio' ? (
          <Checkbox
            checked={field.required}
            onChange={(required) => onChange({ required })}
            accessibilityLabel={t('editor.props.required')}
            testID="prop-required"
          >
            <AppText>{t('editor.props.required')}</AppText>
          </Checkbox>
        ) : null}

        {textLike ? (
          <>
            <Labelled label={t('editor.props.fontSize')}>
              <ChipGroup
                scroll
                accessibilityLabel={t('editor.props.fontSize')}
                options={FONT_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
                value={String(props.fontSize ?? 12)}
                onChange={(v) => set({ fontSize: Number(v) })}
                testID="prop-font-size"
              />
            </Labelled>
            <Labelled label={t('editor.props.align')}>
              <ChipGroup
                accessibilityLabel={t('editor.props.align')}
                options={[
                  { value: 'left', label: t('editor.props.alignLeft') },
                  { value: 'center', label: t('editor.props.alignCenter') },
                  { value: 'right', label: t('editor.props.alignRight') },
                ]}
                value={(props.align as string) ?? 'left'}
                onChange={(align) => set({ align })}
                testID="prop-align"
              />
            </Labelled>
          </>
        ) : null}

        {field.type === 'text' ? <TextOptions key={field.id} properties={props} set={set} /> : null}

        {field.type === 'date_signed' ? (
          <Labelled label={t('editor.props.dateFormat')}>
            <ChipGroup
              accessibilityLabel={t('editor.props.dateFormat')}
              options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
              value={(props.format as string) ?? DATE_FORMATS[0]}
              onChange={(format) => set({ format })}
              testID="prop-date-format"
            />
          </Labelled>
        ) : null}

        {field.type === 'checkbox' ? (
          <Checkbox
            checked={Boolean(props.defaultChecked)}
            onChange={(defaultChecked) => set({ defaultChecked })}
            accessibilityLabel={t('editor.props.defaultChecked')}
            testID="prop-default-checked"
          >
            <AppText>{t('editor.props.defaultChecked')}</AppText>
          </Checkbox>
        ) : null}

        {field.type === 'dropdown' ? <DropdownOptions key={field.id} properties={props} set={set} /> : null}

        {field.type === 'radio' ? (
          <>
            <AppInput
              label={t('editor.props.group')}
              value={(props.groupId as string) ?? ''}
              onChangeText={(groupId) => groupId.trim() && set({ groupId: groupId.trim() })}
              maxLength={64}
              testID="prop-radio-group"
            />
            <AppInput
              label={t('editor.props.optionValue')}
              value={(props.optionValue as string) ?? ''}
              onChangeText={(optionValue) => optionValue.trim() && set({ optionValue })}
              maxLength={100}
              testID="prop-radio-value"
            />
          </>
        ) : null}

        <Labelled label={t('editor.props.position')}>
          <View style={styles.nudges}>
            <IconButton
              icon="arrow-up"
              accessibilityLabel={t('editor.props.moveUp')}
              onPress={() => onRect(moveFractionRect(rect, 0, -NUDGE))}
              testID="nudge-up"
            />
            <IconButton
              icon="arrow-down"
              accessibilityLabel={t('editor.props.moveDown')}
              onPress={() => onRect(moveFractionRect(rect, 0, NUDGE))}
              testID="nudge-down"
            />
            <IconButton
              icon="arrow-back"
              accessibilityLabel={t('editor.props.moveLeft')}
              onPress={() => onRect(moveFractionRect(rect, -NUDGE, 0))}
              testID="nudge-left"
            />
            <IconButton
              icon="arrow-forward"
              accessibilityLabel={t('editor.props.moveRight')}
              onPress={() => onRect(moveFractionRect(rect, NUDGE, 0))}
              testID="nudge-right"
            />
            <IconButton
              icon="add-circle-outline"
              accessibilityLabel={t('editor.props.wider')}
              onPress={() => onRect(resizeFractionRect(rect, 'se', NUDGE * 2, 0, min))}
              testID="nudge-wider"
            />
            <IconButton
              icon="remove-circle-outline"
              accessibilityLabel={t('editor.props.narrower')}
              onPress={() => onRect(resizeFractionRect(rect, 'se', -NUDGE * 2, 0, min))}
              testID="nudge-narrower"
            />
            <IconButton
              icon="chevron-expand"
              accessibilityLabel={t('editor.props.taller')}
              onPress={() => onRect(resizeFractionRect(rect, 'se', 0, NUDGE * 2, min))}
              testID="nudge-taller"
            />
            <IconButton
              icon="chevron-collapse"
              accessibilityLabel={t('editor.props.shorter')}
              onPress={() => onRect(resizeFractionRect(rect, 'se', 0, -NUDGE * 2, min))}
              testID="nudge-shorter"
            />
          </View>
        </Labelled>
      </View>
    </BottomSheet>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="subhead" color="textSecondary">
        {label}
      </AppText>
      {children}
    </View>
  );
}

type Setter = (patch: Record<string, unknown>) => void;

function TextOptions({ properties, set }: { properties: Record<string, unknown>; set: Setter }) {
  const { t } = useTranslation();
  const validation = properties.validation as string | { regex: string } | undefined;
  const mode = typeof validation === 'object' ? 'regex' : (validation ?? 'none');
  const [regex, setRegex] = useState(typeof validation === 'object' ? validation.regex : '');
  const regexValid = textValidationSchema.safeParse({ regex }).success;
  return (
    <>
      <AppInput
        label={t('editor.props.placeholder')}
        value={(properties.placeholder as string) ?? ''}
        onChangeText={(placeholder) => set({ placeholder: placeholder || undefined })}
        maxLength={100}
        testID="prop-placeholder"
      />
      <AppInput
        label={t('editor.props.defaultValue')}
        value={(properties.defaultValue as string) ?? ''}
        onChangeText={(defaultValue) => set({ defaultValue: defaultValue || undefined })}
        maxLength={500}
        testID="prop-default"
      />
      <Labelled label={t('editor.props.validation')}>
        <ChipGroup
          accessibilityLabel={t('editor.props.validation')}
          options={[
            { value: 'none', label: t('editor.props.validationNone') },
            { value: 'email', label: t('editor.props.validationEmail') },
            { value: 'number', label: t('editor.props.validationNumber') },
            { value: 'regex', label: t('editor.props.validationRegex') },
          ]}
          value={mode}
          onChange={(v) => set({ validation: v === 'regex' ? { regex: regex || '.*' } : v })}
          testID="prop-validation"
        />
      </Labelled>
      {mode === 'regex' ? (
        <AppInput
          label={t('editor.props.regex')}
          value={regex}
          onChangeText={(value) => {
            setRegex(value);
            if (textValidationSchema.safeParse({ regex: value }).success)
              set({ validation: { regex: value } });
          }}
          autoCapitalize="none"
          autoCorrect={false}
          error={regex && !regexValid ? t('editor.props.regexInvalid') : undefined}
          testID="prop-regex"
        />
      ) : null}
    </>
  );
}

function DropdownOptions({ properties, set }: { properties: Record<string, unknown>; set: Setter }) {
  const { t } = useTranslation();
  const [text, setText] = useState(((properties.options as string[]) ?? []).join('\n'));
  const options = text
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 50);
  return (
    <AppInput
      label={t('editor.props.options')}
      value={text}
      multiline
      onChangeText={(value) => {
        setText(value);
        const next = value
          .split('\n')
          .map((o) => o.trim())
          .filter(Boolean)
          .slice(0, 50);
        if (next.length > 0) set({ options: next, defaultValue: undefined });
      }}
      error={options.length === 0 ? t('editor.props.optionsInvalid') : undefined}
      testID="prop-options"
    />
  );
}

const styles = StyleSheet.create({
  nudges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
});
