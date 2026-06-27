"use client";

import { AlertTriangle } from 'lucide-react';

export default function SupabaseWarning() {
  return (
    <div
      style={{
        background: 'rgba(245, 158, 11, 0.12)',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        color: '#fde047',
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.9rem',
      }}
    >
      <AlertTriangle size={18} />
      <span>
        未偵測到 Supabase 環境變數（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）。
        店點資料只會保存在目前瀏覽器，遠端 MQTT 指令與連線測試將停用。
        請參考 SUPABASE_SETUP.md 設定 Vercel 環境變數。
      </span>
    </div>
  );
}
