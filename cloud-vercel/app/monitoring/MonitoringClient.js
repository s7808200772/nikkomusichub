"use client";

import { useState } from 'react';
import { Bell, FileText, RefreshCw } from 'lucide-react';
import Tabs from '@/components/Tabs';
import AlertsClient from '../alerts/AlertsClient';
import LogsClient from '../logs/LogsClient';
import OtaLogsClient from './OtaLogsClient';

const TABS = [
  { key: 'alerts', label: '告警中心', icon: Bell },
  { key: 'logs', label: '遠端 Log', icon: FileText },
  { key: 'ota', label: 'OTA 紀錄', icon: RefreshCw },
];

export default function MonitoringClient({ initialAlerts, initialStores, initialLogs, supabaseOk }) {
  const [activeKey, setActiveKey] = useState('alerts');

  return (
    <>
      <Tabs tabs={TABS} activeKey={activeKey} onChange={setActiveKey} />
      {activeKey === 'alerts' && (
        <AlertsClient initialAlerts={initialAlerts} initialStores={initialStores} supabaseOk={supabaseOk} />
      )}
      {activeKey === 'logs' && (
        <LogsClient initialStores={initialStores} supabaseOk={supabaseOk} />
      )}
      {activeKey === 'ota' && (
        <OtaLogsClient initialLogs={initialLogs} supabaseOk={supabaseOk} />
      )}
    </>
  );
}
