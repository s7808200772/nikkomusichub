"use client";

import { useState } from 'react';
import { Store, Music, RefreshCw, Settings } from 'lucide-react';
import Tabs from '@/components/Tabs';
import StoresClient from './StoresClient';
import LibraryClient from '../library/LibraryClient';
import OtaClient from '../ota/OtaClient';
import SettingsClient from '../settings/SettingsClient';

const TABS = [
  { key: 'stores', label: '店點列表', icon: Store },
  { key: 'library', label: '音樂庫', icon: Music },
  { key: 'ota', label: 'OTA', icon: RefreshCw },
  { key: 'settings', label: '預設 Broker', icon: Settings },
];

export default function StoresHubClient({
  initialStores,
  initialLogs,
  initialSettings,
  supabaseOk,
}) {
  const [activeTab, setActiveTab] = useState('stores');

  return (
    <Tabs tabs={TABS} activeKey={activeTab} onChange={setActiveTab}>
      {activeTab === 'stores' && (
        <StoresClient initialStores={initialStores} initialSettings={initialSettings} supabaseOk={supabaseOk} />
      )}
      {activeTab === 'library' && (
        <LibraryClient initialStores={initialStores} supabaseOk={supabaseOk} />
      )}
      {activeTab === 'ota' && (
        <OtaClient initialStores={initialStores} supabaseOk={supabaseOk} />
      )}
      {activeTab === 'settings' && (
        <SettingsClient initialSettings={initialSettings} supabaseOk={supabaseOk} />
      )}
    </Tabs>
  );
}
