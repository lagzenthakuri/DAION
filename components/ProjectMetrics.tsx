import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ChartDataPoint } from '../types';

interface ProjectMetricsProps {
  data: ChartDataPoint[];
}

const ProjectMetrics: React.FC<ProjectMetricsProps> = ({ data }) => {
  return (
    <div className="h-full w-full bg-zinc-900/30 border border-zinc-800 rounded-lg p-4 flex flex-col">
      <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-4">Quality Assurance Velocity</h3>
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorQuality" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorBugs" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis 
                dataKey="iteration" 
                stroke="#52525b" 
                fontSize={10} 
                tickFormatter={(value) => `Iter ${value}`}
            />
            <YAxis stroke="#52525b" fontSize={10} domain={[0, 100]} />
            <Tooltip 
                contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                itemStyle={{ fontSize: '12px' }}
            />
            <Area 
                type="monotone" 
                dataKey="quality" 
                name="Quality Score"
                stroke="#10b981" 
                fillOpacity={1} 
                fill="url(#colorQuality)" 
                strokeWidth={2}
                animationDuration={500}
            />
            <Area 
                type="monotone" 
                dataKey="bugs" 
                name="Bugs Detected"
                stroke="#ef4444" 
                fillOpacity={1} 
                fill="url(#colorBugs)" 
                strokeWidth={2}
                animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ProjectMetrics;
