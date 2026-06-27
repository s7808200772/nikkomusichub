import { createClient } from "jsr:@supabase/supabase-js@2";

const API_SECRET_SHA256 =
  "a287718d8da62807979361a6b27691d03e7431a2d9dce55773296028ba5f2f63";

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function secureEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const suppliedSecretHash = await sha256(
    req.headers.get("x-nikko-secret") || "",
  );
  if (!secureEqual(suppliedSecretHash, API_SECRET_SHA256)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (body.action === "listStores") {
      const { data, error } = await supabase.from("stores").select("data");
      if (error) throw error;
      return Response.json({ data: (data || []).map((row) => row.data) });
    }
    if (body.action === "getStore") {
      const { data, error } = await supabase
        .from("stores")
        .select("data")
        .eq("id", body.storeId)
        .maybeSingle();
      if (error) throw error;
      return Response.json({ data: data?.data || null });
    }
    if (body.action === "saveStore") {
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
      return Response.json({ data: store });
    }
    if (body.action === "deleteStore") {
      const { error } = await supabase
        .from("stores")
        .delete()
        .eq("id", body.storeId);
      if (error) throw error;
      return Response.json({ data: true });
    }
    if (body.action === "getSettings") {
      const { data, error } = await supabase
        .from("settings")
        .select("data")
        .eq("id", "global")
        .maybeSingle();
      if (error) throw error;
      return Response.json({ data: data?.data || {} });
    }
    if (body.action === "saveSettings") {
      const { error } = await supabase.from("settings").upsert(
        {
          id: "global",
          data: body.settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) throw error;
      return Response.json({ data: body.settings });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Database operation failed" }, {
      status: 500,
    });
  }
});
