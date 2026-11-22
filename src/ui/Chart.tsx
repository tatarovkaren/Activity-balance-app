import React, { useRef, useState } from 'react';
import { Platform, Pressable, View, type GestureResponderEvent } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { chartSvg, fmtValue, nearestDate, valuesAt, type ChartSpec } from './chartsvg';
import { Btn, Row, T } from './kit';
import { downloadBlob, printSvg, svgToPng } from './files';
import { LIGHT, useTextScale, useTheme } from './theme';
import { useI18n } from '../i18n';
import type { ISODate } from '../core/dates';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Chart({
  spec,
  height = 180,
  exportName,
}: {
  spec: Omit<ChartSpec, 'width' | 'height' | 'fmt' | 'cursor'>;
  height?: number;
  /** Имя файла для выгрузки; без него кнопок выгрузки нет. */
  exportName?: string;
}) {
  const t = useTheme();
  const k = useTextScale();
  const { tx, f } = useI18n();
  const [w, setW] = useState(0);
  const [cursor, setCursor] = useState<ISODate | null>(null);
  type Box = {
    getBoundingClientRect?: () => { left: number };
    measure?: (cb: (x: number, y: number, w: number, h: number, pageX: number, pageY: number) => void) => void;
  };
  const box = useRef<Box | null>(null);
  const left = useRef(0);
  const full: Omit<ChartSpec, 'width' | 'height'> = { markLabel: tx.charts.unusualDay, ...spec, fmt: f };
  // день под указателем мог выпасть из периода после смены масштаба
  const cur = cursor && cursor >= spec.from && cursor <= spec.to ? cursor : null;
  const xml = w ? chartSvg({ ...full, width: w, height, fontScale: k, cursor: cur ?? undefined }, t) : '';
  const exportSpec = () => chartSvg({ ...full, width: 720, height: 300 }, LIGHT);

  // Ползунок: касание или нажатие мышью ставит линию, движение пальца её ведёт.
  // Горизонтальное движение остаётся у графика, вертикальное прокручивает страницу (touch-action: pan-y).
  const pick = (pageX: number) => {
    if (!w) return;
    const d = nearestDate({ ...full, width: w, height, fontScale: k }, pageX - left.current);
    if (d && d !== cursor) setCursor(d);
  };
  const measure = (e: GestureResponderEvent) => {
    const pageX = e.nativeEvent.pageX;
    const el = box.current;
    if (Platform.OS === 'web' && el?.getBoundingClientRect) {
      left.current = el.getBoundingClientRect().left + (typeof window !== 'undefined' ? window.scrollX : 0);
      pick(pageX);
    } else if (el?.measure) {
      el.measure((_x, _y, _w, _h, px) => {
        left.current = px;
        pick(pageX);
      });
    } else pick(pageX);
  };

  const vals = cur ? valuesAt(spec, cur) : [];
  const unusual = cur && spec.marks?.includes(cur);
  return (
    <View>
      <View style={{ minHeight: Math.round(38 * k), marginBottom: 4, flexDirection: 'row', alignItems: 'flex-start' }}>
        {cur ? (
          <>
            <View style={{ flex: 1 }}>
              <T size={12} bold>
                {cap(f.weekday(cur))}, {f.dm(cur)}
                {unusual ? <T size={12} color={spec.markColor || t.red}>{'  · ' + tx.charts.unusualDay}</T> : null}
              </T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2, marginTop: 2 }}>
                {vals.map((v) => (
                  <View key={v.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: v.color, marginRight: 5 }} />
                    <T size={12} muted>{v.label} </T>
                    <T size={14} bold mono>{fmtValue(v.v, f)}</T>
                  </View>
                ))}
              </View>
            </View>
            <Pressable onPress={() => setCursor(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="×">
              <T muted size={18}>×</T>
            </Pressable>
          </>
        ) : (
          <T muted size={11}>{tx.charts.scrubHint}</T>
        )}
      </View>
      <View
        ref={box as never}
        onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
        style={[{ height }, Platform.OS === 'web' ? ({ touchAction: 'pan-y', cursor: 'crosshair', userSelect: 'none' } as object) : null]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={measure}
        onResponderMove={(e) => pick(e.nativeEvent.pageX)}
        onResponderTerminationRequest={() => true}
      >
        {xml ? (
          <View pointerEvents="none">
            <SvgXml xml={xml} width={w} height={height} />
          </View>
        ) : null}
      </View>
      {exportName && Platform.OS === 'web' ? (
        <Row style={{ marginTop: 6 }}>
          <Btn
            small
            title="PNG"
            onPress={async () => {
              const b = await svgToPng(exportSpec(), 720, 300);
              if (b) downloadBlob(exportName + '.png', b);
            }}
          />
          <Btn small title="PDF" onPress={() => printSvg(spec.title || exportName, exportSpec())} />
        </Row>
      ) : null}
    </View>
  );
}
