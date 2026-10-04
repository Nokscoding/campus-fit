import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export default async () => {
  const url = Netlify.env.get("SUPABASE_URL");
  const key = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serverKey = Netlify.env.get("CAMPUS_FIT_SERVER_KEY");
  const publicKey = Netlify.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const privateKey = Netlify.env.get("VAPID_PRIVATE_KEY");
  const subject = Netlify.env.get("VAPID_SUBJECT") || "mailto:nksserviceshelp@gmail.com";

  if (!url || !key || !serverKey || !publicKey || !privateKey) {
    console.error("Campus Fit push environment is incomplete");
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const { data: jobs, error } = await supabase.rpc("campus_fit_due_pushes", {
    p_server_key: serverKey,
  });

  if (error) {
    console.error("Unable to load Campus Fit notifications", error.message);
    return;
  }

  for (const job of jobs || []) {
    let ok = false;
    let gone = false;
    try {
      await webpush.sendNotification(
        job.subscription,
        JSON.stringify({ title: job.title, body: job.body, url: job.url || "/" })
      );
      ok = true;
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      gone = statusCode === 404 || statusCode === 410;
      console.error("Push failed", statusCode, error?.message);
    }

    await supabase.rpc("campus_fit_mark_push", {
      p_server_key: serverKey,
      p_delivery_id: job.deliveryId,
      p_ok: ok,
      p_gone: gone,
    });
  }
};

export const config = { schedule: "15 * * * *" };
