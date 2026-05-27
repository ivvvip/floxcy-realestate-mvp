'use client';

import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
} from 'recharts';
import { GRID_COLOR, TOOLTIP_STYLE, CHART_COLORS } from './ChartTheme';

type RadarPoint = Record<string, string | number>;

interface Props {
  data: RadarPoint[];
  areaNames: string[];
  height?: number;
}

export function ComparisonRadar({ data, areaNames, height = 360 }: Props) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid stroke={GRID_COLOR} />
          <PolarAngleAxis dataKey="metric" stroke="rgba(255,255,255,0.6)" fontSize={11} />
          <PolarRadiusAxis stroke={GRID_COLOR} angle={90} domain={[0, 10]} tick={false} />
          {areaNames.map((name, i) => (
            <Radar
              key={name}
              name={name}
              dataKey={name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.18}
              strokeWidth={2}
            />
          ))}
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#A0A8B8' }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
