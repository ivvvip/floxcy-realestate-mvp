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

interface Point {
  label: string;
  price?: number;
  yield?: number;
}

interface Props {
  data: Point[];
  height?: number;
  showYield?: boolean;
}

export function PriceTrend({ data, height = 280, showYield = true }: Props) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
          <XAxis dataKey="label" stroke={AXIS_COLOR} fontSize={12} />
          <YAxis
            yAxisId="price"
            stroke={AXIS_COLOR}
            fontSize={12}
            tickFormatter={(v) => `${Math.round(v)}`}
          />
          {showYield && (
            <YAxis
              yAxisId="yield"
              orientation="right"
              stroke={AXIS_COLOR}
              fontSize={12}
              tickFormatter={(v) => `${v}%`}
            />
          )}
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#A0A8B8' }} />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="price"
            name="Price / sqft (AED)"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS[0] }}
            activeDot={{ r: 5 }}
          />
          {showYield && (
            <Line
              yAxisId="yield"
              type="monotone"
              dataKey="yield"
              name="Avg yield (%)"
              stroke={CHART_COLORS[1]}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS[1] }}
              activeDot={{ r: 5 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
