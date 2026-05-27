'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { AXIS_COLOR, GRID_COLOR, TOOLTIP_STYLE, CHART_COLORS } from './ChartTheme';

interface Item {
  name: string;
  value: number;
}

interface Props {
  data: Item[];
  height?: number;
  unit?: string;
}

export function YieldBar({ data, height = 320, unit = '%' }: Props) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
        >
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            stroke={AXIS_COLOR}
            fontSize={11}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis
            stroke={AXIS_COLOR}
            fontSize={12}
            tickFormatter={(v) => `${v}${unit}`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            formatter={(v) => [`${Number(v).toFixed(2)}${unit}`, 'Value']}
          />
          <Bar dataKey="value" radius={[2, 2, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
