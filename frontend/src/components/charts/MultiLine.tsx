'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { AXIS_COLOR, GRID_COLOR, TOOLTIP_STYLE, CHART_COLORS } from './ChartTheme';

interface Props {
  data: Record<string, string | number>[];
  xKey: string;
  series: string[];
  height?: number;
  yLabelFormatter?: (v: number) => string;
}

export function MultiLine({
  data,
  xKey,
  series,
  height = 320,
  yLabelFormatter,
}: Props) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
          <XAxis dataKey={xKey} stroke={AXIS_COLOR} fontSize={11} />
          <YAxis
            stroke={AXIS_COLOR}
            fontSize={12}
            tickFormatter={yLabelFormatter ?? ((v) => `${v}`)}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: 'rgba(255,255,255,0.08)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#9CA3AF', paddingTop: 8 }}
            iconType="plainline"
          />
          {series.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2, fill: CHART_COLORS[i % CHART_COLORS.length] }}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
