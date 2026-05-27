'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  AXIS_COLOR,
  GRID_COLOR,
  TOOLTIP_STYLE,
  POSITIVE,
  NEGATIVE,
} from './ChartTheme';

interface Point {
  label: string;
  value: number;
}

interface Props {
  data: Point[];
  height?: number;
  unit?: string;
}

export function AppreciationArea({ data, height = 240, unit = '%' }: Props) {
  const last = data[data.length - 1]?.value ?? 0;
  const color = last >= 0 ? POSITIVE : NEGATIVE;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="appr-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
          <XAxis dataKey="label" stroke={AXIS_COLOR} fontSize={11} />
          <YAxis
            stroke={AXIS_COLOR}
            fontSize={11}
            tickFormatter={(v) => `${v}${unit}`}
          />
          <ReferenceLine y={0} stroke={AXIS_COLOR} strokeDasharray="2 2" />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: 'rgba(255,255,255,0.08)' }}
            formatter={(v) => [`${Number(v).toFixed(2)}${unit}`, 'Appreciation']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            fill="url(#appr-gradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
