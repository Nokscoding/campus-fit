import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { callRpc } from "../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sessionCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

const adminCookie = {
  ...sessionCookie,
  maxAge: 60 * 60 * 24 * 7,
};

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

async function getContext() {
  const jar = await cookies();
  const token = jar.get("cf_session")?.value || null;
  const adminValue = jar.get("cf_admin")?.value || "";
  const isAdmin = safeEqual(adminValue, process.env.CAMPUS_FIT_ADMIN_SESSION_TOKEN || "__none__");
  return { jar, token, isAdmin };
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const { token, isAdmin } = await getContext();
  if (!token) return json({ error: "not_joined" }, 401);

  const state = await callRpc("campus_fit_state", { p_token: token });
  if (state?.error === "invalid_session") return json(state, 401);

  const themePool = await callRpc("campus_fit_theme_pool", { p_token: token });

  return json({
    ...state,
    themePool: Array.isArray(themePool) ? themePool : (state?.themePool || []),
    isAdmin,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const { jar, token, isAdmin } = await getContext();

  if (action === "join") {
    const result = await callRpc("campus_fit_join", { p_username: body.username });
    if (result?.sessionToken) jar.set("cf_session", result.sessionToken, sessionCookie);
    return json(result, result?.error ? 400 : 200);
  }

  if (action === "logout") {
    jar.delete("cf_session");
    jar.delete("cf_admin");
    return json({ ok: true });
  }

  if (action === "admin_login") {
    if (!safeEqual(body.pin, process.env.CAMPUS_FIT_ADMIN_PIN || "__disabled__")) {
      return json({ error: "pin_invalid" }, 403);
    }
    jar.set("cf_admin", process.env.CAMPUS_FIT_ADMIN_SESSION_TOKEN, adminCookie);
    return json({ ok: true });
  }

  if (action === "admin_logout") {
    jar.delete("cf_admin");
    return json({ ok: true });
  }

  if (!token) return json({ error: "not_joined" }, 401);

  if (action === "propose_theme") {
    return json(await callRpc("campus_fit_propose_theme", {
      p_token: token,
      p_theme: body.theme,
    }));
  }

  if (action === "vote") {
    return json(await callRpc("campus_fit_submit_votes", {
      p_token: token,
      p_week_id: body.weekId,
      p_scores: body.scores,
    }));
  }

  if (action === "push_subscribe") {
    return json(await callRpc("campus_fit_push_subscribe", {
      p_token: token,
      p_subscription: body.subscription,
    }));
  }

  if (!isAdmin) return json({ error: "admin_required" }, 403);
  const serverKey = process.env.CAMPUS_FIT_SERVER_KEY;

  if (action === "admin_spin") {
    return json(await callRpc("campus_fit_admin_spin", {
      p_server_key: serverKey,
      p_week_id: body.weekId,
    }));
  }

  if (action === "admin_schedule") {
    return json(await callRpc("campus_fit_admin_schedule", {
      p_server_key: serverKey,
      p_week_id: body.weekId,
      p_challenge_at: body.challengeAt,
      p_challenge_text: body.challengeText || null,
    }));
  }

  if (action === "admin_week_status") {
    return json(await callRpc("campus_fit_admin_week_status", {
      p_server_key: serverKey,
      p_week_id: body.weekId,
      p_action: body.statusAction,
    }));
  }

  if (action === "admin_finalize") {
    return json(await callRpc("campus_fit_admin_finalize", {
      p_server_key: serverKey,
      p_week_id: body.weekId,
    }));
  }

  return json({ error: "unknown_action" }, 400);
}
