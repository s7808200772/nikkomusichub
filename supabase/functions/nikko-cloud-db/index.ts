import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nikko-secret",
};

function secureEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const expectedSecret = Deno.env.get("NIKKO_SUPABASE_PROXY_SECRET") || "";
  const suppliedSecret = req.headers.get("x-nikko-secret") || "";
  if (!expectedSecret || !secureEqual(suppliedSecret, expectedSecret)) {
    return Response.json({ error: "Unauthorized" }, {
      status: 401,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Supabase credentials not configured" },
      { status: 500, headers: corsHeaders },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = req.method === "POST" ? await req.json() : {};

    switch (body.action) {
      case "listStores": {
        const { data, error } = await supabase.from("stores").select("data").order("id");
        if (error) throw error;
        return Response.json(
          { data: (data || []).map((row) => row.data) },
          { headers: corsHeaders },
        );
      }

      case "getStore": {
        const { data, error } = await supabase
          .from("stores")
          .select("data")
          .eq("id", body.storeId)
          .maybeSingle();
        if (error) throw error;
        return Response.json(
          { data: data?.data || null },
          { headers: corsHeaders },
        );
      }

      case "saveStore": {
        const store = body.store;
        const { error } = await supabase.from("stores").upsert(
          {
            id: store.storeId,
            data: store,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
        if (error) throw error;
        return Response.json({ data: store }, { headers: corsHeaders });
      }

      case "deleteStore": {
        const { error } = await supabase
          .from("stores")
          .delete()
          .eq("id", body.storeId);
        if (error) throw error;
        return Response.json({ data: true }, { headers: corsHeaders });
      }

      case "getSettings": {
        const { data, error } = await supabase
          .from("settings")
          .select("data")
          .eq("id", "global")
          .maybeSingle();
        if (error) throw error;
        return Response.json(
          { data: data?.data || {} },
          { headers: corsHeaders },
        );
      }

      case "saveSettings": {
        const { error } = await supabase.from("settings").upsert(
          {
            id: "global",
            data: body.settings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
        if (error) throw error;
        return Response.json({ data: body.settings }, { headers: corsHeaders });
      }

      case "listAlerts": {
        const limit = Math.min(parseInt(body.limit || "50", 10), 200);
        const { data, error } = await supabase
          .from("alerts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw error;
        return Response.json({ data: data || [] }, { headers: corsHeaders });
      }

      case "createAlert": {
        const { data, error } = await supabase
          .from("alerts")
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
        return Response.json({ data }, { headers: corsHeaders });
      }

      case "acknowledgeAlert": {
        const { data, error } = await supabase
          .from("alerts")
          .update({ acknowledged_at: new Date().toISOString() })
          .eq("id", body.alertId)
          .is("acknowledged_at", null)
          .select()
          .single();
        if (error) throw error;
        return Response.json({ data }, { headers: corsHeaders });
      }

      case "listUpdateLogs": {
        const limit = Math.min(parseInt(body.limit || "50", 10), 200);
        const { data, error } = await supabase
          .from("update_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw error;
        return Response.json({ data: data || [] }, { headers: corsHeaders });
      }

      case "createUpdateLog": {
        const { data, error } = await supabase
          .from("update_log")
          .insert({
            store_id: body.log.storeId,
            action: body.log.action,
            status: body.log.status,
            version_before: body.log.versionBefore,
            version_after: body.log.versionAfter,
            error: body.log.error,
            finished_at:
              body.log.status !== "started" ? new Date().toISOString() : null,
          })
          .select()
          .single();
        if (error) throw error;
        return Response.json({ data }, { headers: corsHeaders });
      }

      case "finishUpdateLog": {
        const { data, error } = await supabase
          .from("update_log")
          .update({
            status: body.log.status,
            version_after: body.log.versionAfter,
            error: body.log.error,
            finished_at: new Date().toISOString(),
          })
          .eq("id", body.logId)
          .select()
          .single();
        if (error) throw error;
        return Response.json({ data }, { headers: corsHeaders });
      }

      default:
        return Response.json(
          { error: "Unknown action" },
          { status: 400, headers: corsHeaders },
        );
    }
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Database operation failed" },
      { status: 500, headers: corsHeaders },
    );
  }
});
