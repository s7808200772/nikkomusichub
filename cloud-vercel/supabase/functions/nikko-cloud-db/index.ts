import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nikko-secret',
};

function toSnake(str: string) {
  return str.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function storeToRow(store: Record<string, any>) {
  return {
    store_id: store.storeId,
    store_name: store.storeName,
    device_id: store.deviceId || '',
    role: store.role || 'store',
    mqtt_broker: store.mqttBroker,
    mqtt_port: store.mqttPort,
    mqtt_username: store.mqttUsername || '',
    mqtt_password: store.mqttPassword || '',
    mqtt_tls: store.mqttTls !== false,
    updated_at: new Date().toISOString(),
  };
}

function rowToStore(row: Record<string, any>) {
  return {
    storeId: row.store_id,
    storeName: row.store_name,
    deviceId: row.device_id || '',
    role: row.role || 'store',
    mqttBroker: row.mqtt_broker,
    mqttPort: row.mqtt_port,
    mqttUsername: row.mqtt_username || '',
    mqttPassword: row.mqtt_password || '',
    mqttTls: row.mqtt_tls !== false,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get('NIKKO_SUPABASE_PROXY_SECRET');
  const providedSecret = req.headers.get('x-nikko-secret');
  if (!expectedSecret || expectedSecret !== providedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Supabase credentials not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    switch (body.action) {
      case 'listStores': {
        const { data, error } = await supabase.from('stores').select('*').order('store_id');
        if (error) throw error;
        return new Response(JSON.stringify({ data: (data || []).map(rowToStore) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getStore': {
        const { data, error } = await supabase.from('stores').select('*').eq('store_id', body.storeId).single();
        if (error) throw error;
        return new Response(JSON.stringify({ data: rowToStore(data) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'saveStore': {
        const row = storeToRow(body.store);
        const { data, error } = await supabase.from('stores').upsert(row, { onConflict: 'store_id' }).select().single();
        if (error) throw error;
        return new Response(JSON.stringify({ data: rowToStore(data) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'deleteStore': {
        const { error } = await supabase.from('stores').delete().eq('store_id', body.storeId);
        if (error) throw error;
        return new Response(JSON.stringify({ data: { ok: true } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'getSettings': {
        const { data, error } = await supabase.from('cloud_settings').select('key, value');
        if (error) throw error;
        const settings: Record<string, string> = {};
        (data || []).forEach((r: any) => { settings[r.key] = r.value; });
        return new Response(JSON.stringify({ data: settings }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'saveSettings': {
        const entries = Object.entries(body.settings || {}).map(([key, value]) => ({
          key,
          value: String(value),
          updated_at: new Date().toISOString(),
        }));
        if (entries.length) {
          const { error } = await supabase.from('cloud_settings').upsert(entries, { onConflict: 'key' });
          if (error) throw error;
        }
        return new Response(JSON.stringify({ data: body.settings }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'listAlerts': {
        const limit = Math.min(parseInt(body.limit || '50', 10), 200);
        const { data, error } = await supabase
          .from('alerts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return new Response(JSON.stringify({ data: data || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'createAlert': {
        const { data, error } = await supabase
          .from('alerts')
          .insert({
            store_id: body.alert.storeId,
            severity: body.alert.severity,
            type: body.alert.type,
            message: body.alert.message,
            details: body.alert.details || {},
          })
          .select()
          .single();
        if (error) throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'acknowledgeAlert': {
        const { data, error } = await supabase
          .from('alerts')
          .update({ acknowledged_at: new Date().toISOString() })
          .eq('id', body.alertId)
          .is('acknowledged_at', null)
          .select()
          .single();
        if (error) throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'listUpdateLogs': {
        const limit = Math.min(parseInt(body.limit || '50', 10), 200);
        const { data, error } = await supabase
          .from('update_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return new Response(JSON.stringify({ data: data || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'createUpdateLog': {
        const { data, error } = await supabase
          .from('update_log')
          .insert({
            store_id: body.log.storeId,
            action: body.log.action,
            status: body.log.status,
            version_before: body.log.versionBefore,
            version_after: body.log.versionAfter,
            error: body.log.error,
            finished_at: body.log.status !== 'started' ? new Date().toISOString() : null,
          })
          .select()
          .single();
        if (error) throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'finishUpdateLog': {
        const { data, error } = await supabase
          .from('update_log')
          .update({
            status: body.log.status,
            version_after: body.log.versionAfter,
            error: body.log.error,
            finished_at: new Date().toISOString(),
          })
          .eq('id', body.logId)
          .select()
          .single();
        if (error) throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
