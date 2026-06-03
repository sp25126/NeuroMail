"use client";

import React, { useState } from 'react';
import { MODULE_IDENTITY } from '@/config/module-identity';

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState([
    { id: 'ff-1', key: 'freight_copilot_enabled', name: `${MODULE_IDENTITY.displayName} AI Copilot`, enabled: true, rollout: 100 },
    { id: 'ff-2', key: 'new_extraction_pipeline', name: 'v2 Extraction Engine', enabled: false, rollout: 0 },
    { id: 'ff-3', key: 'project44_adapter_beta', name: 'Project44 Adapter', enabled: true, rollout: 25 },
  ]);

  const toggleFlag = (id: string) => {
    setFlags(flags.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Feature Flags</h1>
      <p className="text-sm text-gray-500 mb-6">Internal tool for staged rollouts and kill switches.</p>

      <div className="bg-white p-6 rounded-lg shadow">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Key</th>
              <th>Rollout %</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {flags.map(flag => (
              <tr key={flag.id}>
                <td className="font-semibold">{flag.name}</td>
                <td className="font-mono text-xs">{flag.key}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={flag.rollout} 
                      className="range range-xs range-primary w-24" 
                      readOnly 
                    />
                    <span className="text-xs w-8 text-right">{flag.rollout}%</span>
                  </div>
                </td>
                <td>
                  <span className={`badge ${flag.enabled ? 'badge-success' : 'badge-error'}`}>
                    {flag.enabled ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <input 
                    type="checkbox" 
                    className="toggle toggle-primary" 
                    checked={flag.enabled} 
                    onChange={() => toggleFlag(flag.id)} 
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
