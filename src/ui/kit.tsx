import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import { MONO, useTheme } from './theme';

export function Card({
  title,
  accent,
  right,
  children,
  style,
}: {
  title?: string;
  accent?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        s.card,
        { backgroundColor: t.card, borderColor: accent ? accent + '55' : t.cardBorder },
        style,
      ]}
    >
      {title ? (
        <View style={s.cardHead}>
          {accent ? <View style={[s.dot, { backgroundColor: accent }]} /> : null}
          <Text style={[s.cardTitle, { color: accent || t.muted }]}>{title.toUpperCase()}</Text>
          <View style={{ flex: 1 }} />
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function T({
  children,
  muted,
  color,
  size,
  bold,
  mono,
  style,
  numberOfLines,
  onPress,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  muted?: boolean;
  color?: string;
  size?: number;
  bold?: boolean;
  mono?: boolean;
  style?: TextStyle;
  numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      onPress={onPress}
      style={[
        {
          color: color || (muted ? t.muted : t.text),
          fontSize: size || 14,
          lineHeight: Math.round((size || 14) * 1.4),
          fontWeight: bold ? '700' : '400',
          fontFamily: mono ? MONO : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export const Row = ({ children, gap = 8, style }: { children: React.ReactNode; gap?: number; style?: ViewStyle }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>
);

/** Строка полей ввода: каждое поле растягивается поровну, на узком экране переносится. */
export function Fields({ children, min = 72, gap = 8 }: { children: React.ReactNode; min?: number; gap?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, alignItems: 'flex-end' }}>
      {React.Children.toArray(children)
        .filter(Boolean)
        .map((c, i) => (
          <View key={i} style={{ flexGrow: 1, flexShrink: 1, flexBasis: min, minWidth: min }}>
            {c}
          </View>
        ))}
    </View>
  );
}

export const Gap = ({ h = 8 }: { h?: number }) => <View style={{ height: h }} />;

/** Строка в число: принимает запятую. Пусто → undefined (нет данных). */
export function parseNum(s: string): number | undefined {
  const v = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

export function fmtNum(v: number | undefined, digits?: number): string {
  if (v == null) return '';
  const str = digits != null ? v.toFixed(digits) : String(v);
  return str.replace('.', ',');
}

export function NumField({
  label,
  value,
  onChange,
  placeholder,
  digits,
  big,
  disabled,
  width,
  testID,
  suffix,
}: {
  label?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  digits?: number;
  big?: boolean;
  disabled?: boolean;
  width?: number | `${number}%`;
  testID?: string;
  suffix?: string;
}) {
  const t = useTheme();
  const [text, setText] = useState(fmtNum(value));
  useEffect(() => {
    // внешнее изменение (смена даты, импорт) — обновить текст, если число другое
    if (parseNum(text) !== value) setText(fmtNum(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const fs = big ? (text.length > 6 ? 22 : 27) : 16;
  return (
    <View style={{ width: width as any, alignSelf: width ? undefined : 'stretch', opacity: disabled ? 0.4 : 1 }}>
      {label ? <Text style={[s.label, { color: t.muted }]}>{label}</Text> : null}
      <View style={[s.inputWrap, { backgroundColor: t.input, borderColor: t.line }]}>
        <TextInput
          testID={testID}
          editable={!disabled}
          value={text}
          placeholder={placeholder}
          placeholderTextColor={t.muted + '99'}
          inputMode="decimal"
          keyboardType="decimal-pad"
          onChangeText={(x) => {
            const clean = x.replace(/[^\d.,\-\s]/g, '');
            setText(clean);
            const v = parseNum(clean);
            onChange(v == null ? undefined : digits != null ? Math.round(v * 10 ** digits) / 10 ** digits : v);
          }}
          style={[
            s.input,
            { color: t.text, fontSize: fs, fontFamily: MONO, fontWeight: big ? '700' : '500', height: big ? 46 : 38 },
          ]}
        />
        {suffix ? <Text style={{ color: t.muted, paddingRight: 8 }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  testID,
  secure,
}: {
  label?: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  testID?: string;
  secure?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ alignSelf: 'stretch' }}>
      {label ? <Text style={[s.label, { color: t.muted }]}>{label}</Text> : null}
      <TextInput
        testID={testID}
        value={value || ''}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.muted + '99'}
        multiline={multiline}
        secureTextEntry={secure}
        style={[
          s.input,
          s.inputWrap,
          {
            color: t.text,
            backgroundColor: t.input,
            borderColor: t.line,
            minHeight: multiline ? 72 : 38,
            textAlignVertical: multiline ? 'top' : 'center',
            paddingTop: multiline ? 8 : 0,
          },
        ]}
      />
    </View>
  );
}

export function Btn({
  title,
  onPress,
  kind = 'ghost',
  color,
  disabled,
  small,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'solid' | 'ghost' | 'link';
  color?: string;
  disabled?: boolean;
  small?: boolean;
  testID?: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const c = color || t.amber;
  if (kind === 'link')
    return (
      <Pressable testID={testID} onPress={onPress} disabled={disabled} hitSlop={6}>
        <Text style={{ color: c, textDecorationLine: 'underline', fontSize: small ? 13 : 14 }}>{title}</Text>
      </Pressable>
    );
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        small && { paddingVertical: 7, paddingHorizontal: 12 },
        kind === 'solid' ? { backgroundColor: c, borderColor: c } : { borderColor: t.line, backgroundColor: t.input },
        { opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      <Text style={{ color: kind === 'solid' ? t.onAccent : t.text, fontWeight: '600', fontSize: small ? 13 : 15, textAlign: 'center' }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Seg<V extends string>({
  options,
  value,
  onChange,
  color,
  testID,
}: {
  options: { v: V; label: string }[];
  value: V | undefined;
  onChange: (v: V) => void;
  color?: string;
  testID?: string;
}) {
  const t = useTheme();
  const c = color || t.amber;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} testID={testID}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[s.chip, { borderColor: on ? c : t.line, backgroundColor: on ? c + '22' : 'transparent' }]}
          >
            <Text style={{ color: on ? c : t.text, fontSize: 13, fontWeight: on ? '700' : '400' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Bar({ value, color }: { value: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.line, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, height: 6, backgroundColor: color }} />
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.line, marginVertical: 10 }} />;
}

export function Note({ children, color }: { children: React.ReactNode; color?: string }) {
  const t = useTheme();
  return <Text style={{ color: color || t.amber, fontSize: 13, lineHeight: 18 }}>{children}</Text>;
}

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  cardTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  label: { fontSize: 12, marginBottom: 4 },
  inputWrap: { borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minWidth: 0, width: '100%', paddingHorizontal: 10, outlineStyle: 'none' as any },
  btn: { borderWidth: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
});
