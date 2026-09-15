import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Max. Anzahl Claude-Zusammenfassungen pro Nutzer und 24h (auch fuer zahlende Nutzer,
// als Schutz gegen Kosten-Missbrauch).
const DAILY_LIMIT = 3;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Nutzer aus dem JWT ermitteln (verify_jwt ist fuer diese Function aktiv,
    // d.h. hier laeuft nur eine gueltige, angemeldete Anfrage ein).
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Nicht angemeldet.", code: "UNAUTHENTICATED" }, 401);
    }
    const userId = userData.user.id;

    // Privilegierter Client fuer Abo-Check und Rate-Limit-Log (bypassed RLS bewusst).
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Trial/Abo-Check: kein aktiver Zugriff -> kein Claude-Call, kein Kostenrisiko.
    const { data: hasAccess, error: accessErr } = await admin.rpc("has_active_access", {
      p_user_id: userId,
    });
    if (accessErr) throw accessErr;
    if (!hasAccess) {
      return jsonResponse(
        {
          error: "Deine Testphase ist abgelaufen. Schalte ein Abo frei, um weiter KI-Feedback zu bekommen.",
          code: "SUBSCRIPTION_REQUIRED",
        },
        402,
      );
    }

    // 2) Rate-Limit: max. DAILY_LIMIT Aufrufe pro rollierende 24h, unabhaengig vom Abo-Status.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await admin
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if (countErr) throw countErr;
    if ((count ?? 0) >= DAILY_LIMIT) {
      return jsonResponse(
        {
          error: `Tageslimit erreicht (max. ${DAILY_LIMIT} Zusammenfassungen/Tag). Versuch's morgen wieder.`,
          code: "RATE_LIMITED",
        },
        429,
      );
    }

    const { context } = await req.json();
    const prompt =
      "Du bist ein persönlicher High-Performance-Coach. Schreib eine prägnante, ehrliche " +
      "Tageszusammenfassung auf Deutsch (max ~180 Wörter): 1) kurze Einordnung, 2) was stark war, " +
      "3) 2-3 konkrete, umsetzbare Verbesserungsvorschläge für morgen. Direkt, motivierend, " +
      "kein Bullshit, sprich die Person mit 'du' an.\n\nTagesdaten:\n" +
      JSON.stringify(context, null, 2);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text = (data.content || []).map((b: any) => b.text || "").join("");

    // 3) Nutzung erst bei Erfolg loggen (fehlgeschlagene Claude-Calls zaehlen nicht ins Limit).
    await admin.from("ai_usage_log").insert({ user_id: userId });

    return jsonResponse({ text });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
