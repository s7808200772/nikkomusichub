"use client";

import { useState } from 'react';
import { Bell, FileText } from 'lucide-react';
import Tabs from '@/components/Tabs';
import AlertsClient from '../alerts/AlertsClient';
import LogsClient from '../logs/LogsClient';

const TABS = [
  { key: 'alerts', label: '告警中心', icon: Bell },
  { key: 'logs', label: '遠端 Log', icon: FileText },
];

export default function MonitoringClient({ initialAlerts, initialStores, supabaseOk }) {
  const [activeKey, setActiveKey] = useState('alerts');

  return (
    <>
      <Tabs tabs={TABS} activeKey={activeKey} onChange={setActiveKey} />
      {activeKey === 'alerts' && (
        <AlertsClient initialAlerts={initialAlerts} supabaseOk={supabaseOk} />
      )}
      {activeKey === 'logs' && (
        <LogsClient initialStores={initialStores} supabaseOk={supabaseOk} />
      )}
    </>
  );
}
