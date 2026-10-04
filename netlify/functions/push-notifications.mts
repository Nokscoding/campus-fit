import type { Config } from "@netlify/functions";
import webpush from "web-push";

async function rpc(name: string, body: Record<string, unknown>) {
  const url = Netlify.env.get("SUPABASE_URL");
  const key = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Supabase environment variables are missing");

  const response = await fetch(url + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error("RPC " + name + " failed with " + response.status);
  return data;
}

export default async function () {
  const serverKey = Netlify.env.get("CAMPUS_FIT_SERVER_KEY");
  const publicKey = Netlify.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const privateKey = Netlify.env.get("VAPID_PRIVATE_KEY");
  const subject = Netlify.env.get("VAPID_SUBJECT") || "mailto:nksserviceshelp@gmail.com";

  if (!serverKey || !publicKey || !privateKey) {
    console.error("Campus Fit push variables are missing");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const raw = await rpc("campus_fit_due_pushes", { p_server_key: serverKey });
  const deliveries = Array.isArray(raw)
    ? raw.map((row: any) => row?.campus_fit_due_pushes || row).filter(Boolean)
    : [];

  for (const delivery of deliveries) {
    let ok = false;
    let gone = false;

    try {
      await webpush.sendNotification(
        delivery.subscription,
        JSON.stringify({
          title: delivery.title,
          body: delivery.body,
          url: delivery.url || "/"
        }),
        { TTL: 86400 }
      );
      ok = true;
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);
      gone = statusCode === 404 || statusCode === 410;
      console.error("Campus Fit push failed", statusCode);
    }

    await rpc("campus_fit_mark_push", {
      p_server_key: serverKey,
      p_delivery_id: delivery.deliveryId,
      p_ok: ok,
      p_gone: gone
    });
  }
}

export const config: Config = {
  schedule: "0 * * * *"
};
