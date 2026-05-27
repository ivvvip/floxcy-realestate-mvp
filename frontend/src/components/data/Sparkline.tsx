'use client';

import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { POSITIVE, NEGATIVE, CHART_PRIMARY } from '../charts/ChartTheme';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  tone?: 'positive' | 'negative' | 'neutral' | 'auto';
  strokeWidth?: number;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  tone = 'auto',
  strokeWidth = 1.5,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return <div style={{ width, height }} className="bg-bg-elev/40 rounded-sm" />;
  }

  let color = CHART_PRIMARY;
  if (tone === 'positive') color = POSITIVE;
  else if (tone === 'negative') color = NEGATIVE;
  else if (tone === 'auto') {
    color = data[data.length - 1] >= data[0] ? POSITIVE : NEGATIVE;
  }

  const points = data.map((v, i) => ({ i, v }));

  return (
    <div style={{ width, height }} className="inline-block">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={strokeWidth}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
