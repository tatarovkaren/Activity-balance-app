import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { chartSvg, type ChartSpec } from './chartsvg';
import { Btn, Row } from './kit';
import { downloadBlob, printSvg, svgToPng } from './files';
import { LIGHT, useTheme } from './theme';
import { useI18n } from '../i18n';

export function Chart({
  spec,
  height = 180,
  exportName,
}: {
  spec: Omit<ChartSpec, 'width' | 'height' | 'fmt'>;
  height?: number;
  /** Имя файла для выгрузки; без него кнопок выгрузки нет. */
  exportName?: string;
}) {
  const t = useTheme();
  const { tx, f } = useI18n();
  const [w, setW] = useState(0);
  const full: Omit<ChartSpec, 'width' | 'height'> = { markLabel: tx.charts.unusualDay, ...spec, fmt: f };
  const xml = w ? chartSvg({ ...full, width: w, height }, t) : '';
  const exportSpec = () => chartSvg({ ...full, width: 720, height: 300 }, LIGHT);
  return (
    <View>
      <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height }}>
        {xml ? <SvgXml xml={xml} width={w} height={height} /> : null}
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
