"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const wheelColors = [
  "#f4df45", "#9bd7ff", "#c6a8ff", "#ff9d82", "#8fdfa6", "#f0b4d1",
  "#b8b4a3", "#8290ff", "#75d5cb", "#ffbd70", "#b7d7a9", "#d2b7ff"
];

function monthLabel(month) {
  if (!month) return "";
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" })
    .format(new Date(month.year, month.month - 1, 1))
    .replace(/^./, (c) => c.toUpperCase());
}

function dateLabel(value) {
  if (!value) return "Date à définir";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Lubumbashi",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function inputDate(value) {
  if (!value) return "";
  const d = new Date(value);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Lubumbashi",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const x = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return x.year + "-" + x.month + "-" + x.day + "T" + x.hour + ":" + x.minute;
}

function wheelBackground(pool) {
  const count = Math.max(1, Math.min(pool?.length || 1, 12));
  const size = 360 / count;
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    parts.push(wheelColors[i % wheelColors.length] + " " + (i * size) + "deg " + ((i + 1) * size) + "deg");
  }
  return "conic-gradient(" + parts.join(",") + ")";
}

function base64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const data = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(data);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function post(body) {
  const response = await fetch("/api/campus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export default function CampusFit() {
  const [mode, setMode] = useState("loading");
  const [data, setData] = useState(null);
  const [username, setUsername] = useState("");
  const [activeWeekNo, setActiveWeekNo] = useState(1);
  const [proposal, setProposal] = useState("");
  const [voteScores, setVoteScores] = useState({});
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [challengeText, setChallengeText] = useState("");
  const [standalone, setStandalone] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [notificationState, setNotificationState] = useState("off");
  const [wheelTurn, setWheelTurn] = useState(0);
  const toastTimer = useRef(null);

  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setMode((m) => (m === "ready" ? m : "loading"));
    try {
      const response = await fetch("/api/campus", { cache: "no-store" });
      if (response.status === 401) {
        setData(null);
        setMode("join");
        return;
      }
      const next = await response.json();
      if (next.error) {
        setMode("join");
        return;
      }
      setData(next);
      setMode("ready");
      setProposal(next.proposal?.themeName || "");
      setActiveWeekNo((current) => {
        if (next.weeks?.some((w) => w.weekNo === current)) return current;
        const candidate = next.weeks?.find((w) => !["completed", "skipped"].includes(w.status));
        return candidate?.weekNo || 1;
      });
    } catch {
      if (!quiet) notify("Impossible de charger Campus Fit");
    }
  }, [notify]);

  useEffect(() => {
    load();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const checkStandalone = () => {
      const iosStandalone = window.navigator.standalone === true;
      setStandalone(window.matchMedia("(display-mode: standalone)").matches || iosStandalone);
    };
    checkStandalone();
    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    if ("Notification" in window && Notification.permission === "granted") setNotificationState("on");
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [load]);

  useEffect(() => {
    if (mode !== "ready") return;
    const id = setInterval(() => load(true), 9000);
    return () => clearInterval(id);
  }, [mode, load]);

  const activeWeek = useMemo(
    () => data?.weeks?.find((w) => w.weekNo === activeWeekNo) || data?.weeks?.[0],
    [data, activeWeekNo]
  );

  useEffect(() => {
    if (!activeWeek || !data?.participant) return;
    const saved = Object.fromEntries((activeWeek.myVotes || []).map((v) => [v.targetId, Number(v.score)]));
    const initial = {};
    for (const p of data.participants || []) {
      if (p.id !== data.participant.id) initial[p.id] = saved[p.id] || 5;
    }
    setVoteScores(initial);
    setScheduleAt(inputDate(activeWeek.challengeAt));
    setChallengeText(activeWeek.challengeText || "");
  }, [activeWeek?.id, activeWeek?.votingStatus, data?.participant?.id]);

  async function join(event) {
    event.preventDefault();
    if (!username.trim()) return;
    setBusy("join");
    const { response, data: result } = await post({ action: "join", username: username.trim() });
    setBusy("");
    if (!response.ok || result.error) return notify("Username invalide");
    await load();
  }

  async function logout() {
    await post({ action: "logout" });
    setData(null);
    setMode("join");
  }

  async function proposeTheme(event) {
    event.preventDefault();
    if (!proposal.trim()) return;
    setBusy("proposal");
    const { data: result } = await post({ action: "propose_theme", theme: proposal.trim() });
    setBusy("");
    if (result.error) return notify("Ce thème ne peut pas être ajouté");
    notify("Thème proposé pour ce mois");
    await load(true);
  }

  async function submitVotes() {
    if (!activeWeek) return;
    const scores = Object.entries(voteScores).map(([targetId, score]) => ({ targetId, score: Number(score) }));
    setBusy("vote");
    const { data: result } = await post({ action: "vote", weekId: activeWeek.id, scores });
    setBusy("");
    if (result.error) return notify("Les votes sont fermés");
    notify("Tes notes sont enregistrées");
    await load(true);
  }

  async function adminLogin(event) {
    event.preventDefault();
    setBusy("admin-login");
    const { response } = await post({ action: "admin_login", pin: adminPin });
    setBusy("");
    if (!response.ok) return notify("Code admin incorrect");
    setAdminPin("");
    setAdminOpen(false);
    notify("Mode admin activé");
    await load(true);
  }

  async function adminAction(action, extra = {}) {
    if (!activeWeek) return;
    setBusy(action);
    const { data: result } = await post({ action, weekId: activeWeek.id, ...extra });
    setBusy("");
    if (result.error) {
      const labels = {
        no_votes: "Aucun vote à finaliser",
        cannot_open: "Impossible d’ouvrir les votes",
        week_finalized: "Cette semaine est déjà finalisée",
      };
      return notify(labels[result.error] || "Action impossible");
    }
    await load(true);
    return result;
  }

  async function spin() {
    setWheelTurn((v) => v + 1440 + Math.floor(Math.random() * 720));
    const result = await adminAction("admin_spin");
    if (result?.themeName) notify("Thème tiré : " + result.themeName);
  }

  async function saveSchedule() {
    if (!scheduleAt) return notify("Choisis une date et une heure");
    const iso = new Date(scheduleAt).toISOString();
    const result = await adminAction("admin_schedule", { challengeAt: iso, challengeText });
    if (result?.ok) notify("Challenge programmé");
  }

  async function setWeekStatus(statusAction) {
    const result = await adminAction("admin_week_status", { statusAction });
    if (result?.ok) {
      if (statusAction === "open") notify("Votes ouverts");
      if (statusAction === "close") notify("Votes fermés");
      if (statusAction === "skip") notify("Semaine sautée");
    }
  }

  async function finalizeWeek() {
    const result = await adminAction("admin_finalize");
    if (result?.ok) notify("Podium verrouillé · points attribués");
  }

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
      return;
    }
    notify("iPhone : Partager → Sur l’écran d’accueil");
  }

  async function enableNotifications() {
    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isiOS && !standalone) {
      notify("Ajoute d’abord Campus Fit à l’écran d’accueil");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      notify("Notifications non compatibles sur ce navigateur");
      return;
    }
    if (!data?.vapidPublicKey) {
      notify("Notifications pas encore configurées");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotificationState("blocked");
        return notify("Autorisation de notifications refusée");
      }
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(data.vapidPublicKey),
        });
      }
      const { data: result } = await post({ action: "push_subscribe", subscription: subscription.toJSON() });
      if (result.error) throw new Error(result.error);
      setNotificationState("on");
      notify("Rappels activés");
    } catch {
      notify("Impossible d’activer les notifications");
    }
  }

  if (mode === "loading") {
    return (
      <main className="center-screen">
        <div className="brand-mark">CF</div>
        <p>Campus Fit</p>
      </main>
    );
  }

  if (mode === "join") {
    return (
      <main className="join-screen">
        <section className="join-card">
          <div className="brand-mark big">CF</div>
          <p className="eyebrow">CAMPUS FIT</p>
          <h1>Entre dans le jeu.</h1>
          <p className="muted">Pas de compte. Pas de mot de passe. Entre seulement ton username.</p>
          <form onSubmit={join} className="join-form">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ton username"
              maxLength={24}
              autoCapitalize="words"
              autoComplete="off"
            />
            <button disabled={busy === "join"}>{busy === "join" ? "Entrée…" : "Participer"}</button>
          </form>
          <div className="join-rules">
            <span>4 semaines</span><span>3 · 2 · 1 pts</span><span>1 champion / mois</span>
          </div>
        </section>
      </main>
    );
  }

  const leaderboard = data?.leaderboard || [];
  const annual = data?.annual || [];
  const top = leaderboard.slice(0, 3);
  const currentPlayer = data?.participant;
  const isiOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const canVote = activeWeek?.votingStatus === "open";
  const finalResults = activeWeek?.results || [];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CAMPUS FIT</p>
          <h1>{monthLabel(data.month)}</h1>
        </div>
        <div className="top-actions">
          <button className={"mini-action " + (data.isAdmin ? "admin-on" : "")} onClick={() => setAdminOpen(true)}>
            {data.isAdmin ? "ADMIN" : "🔒"}
          </button>
          <button className="avatar-button" onClick={logout} title="Quitter">
            {currentPlayer?.username?.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </header>

      {!standalone && (
        <section className="install-card">
          <div className="install-icon">↗</div>
          <div>
            <strong>Installe Campus Fit</strong>
            <p>{isiOS ? "Sur iPhone : Partager → Sur l’écran d’accueil." : "Garde l’app comme une vraie application."}</p>
          </div>
          <button onClick={install}>Installer</button>
        </section>
      )}

      <section className="month-strip">
        <div>
          <span>TON PROFIL</span>
          <strong>@{currentPlayer?.username}</strong>
        </div>
        <button className={notificationState === "on" ? "notif on" : "notif"} onClick={enableNotifications}>
          {notificationState === "on" ? "🔔 Activées" : "🔔 Rappels"}
        </button>
      </section>

      <nav className="week-tabs">
        {(data.weeks || []).map((week) => (
          <button
            key={week.id}
            className={"week-tab " + (week.weekNo === activeWeekNo ? "active " : "") + (week.status === "completed" ? "done " : "") + (week.status === "skipped" ? "skipped" : "")}
            onClick={() => setActiveWeekNo(week.weekNo)}
          >
            S{week.weekNo}
          </button>
        ))}
      </nav>

      <section className="hero-card">
        <div className="hero-status">
          <span className={"dot " + (activeWeek?.votingStatus === "open" ? "live" : "")}></span>
          Semaine {activeWeek?.weekNo}
          <span>·</span>
          {activeWeek?.status === "skipped" ? "sautée" : activeWeek?.votingStatus === "open" ? "votes ouverts" : activeWeek?.status === "completed" ? "terminée" : "en préparation"}
        </div>

        <div className="wheel-wrap">
          <div
            className="wheel"
            style={{
              background: wheelBackground(data.themePool),
              transform: "rotate(" + wheelTurn + "deg)",
            }}
          ></div>
          <div className="pointer"></div>
          <div className="wheel-core"><span>WEEK</span><strong>{activeWeek?.weekNo}</strong></div>
        </div>

        <div className="theme-copy">
          <p className="eyebrow">THÈME</p>
          <h2>{activeWeek?.themeName || "À tirer"}</h2>
          <p>{activeWeek?.themeName ? activeWeek.challengeText : "Le thème sera tiré aléatoirement parmi le catalogue et les propositions du groupe."}</p>
        </div>

        <div className="challenge-date">
          <span>📅</span>
          <div><small>Challenge</small><strong>{dateLabel(activeWeek?.challengeAt)}</strong></div>
          <span className={"status-chip " + (activeWeek?.status || "")}>{activeWeek?.status || "pending"}</span>
        </div>

        {data.isAdmin && activeWeek?.votingStatus !== "finalized" && (
          <button className="primary-button" onClick={spin} disabled={busy === "admin_spin"}>
            {busy === "admin_spin" ? "La roulette tourne…" : activeWeek?.themeName ? "Relancer la roulette" : "Lancer la roulette"}
          </button>
        )}
      </section>

      {canVote && (
        <section className="section-card voting-card">
          <div className="section-head">
            <div><p className="eyebrow live-label">VOTE EN COURS</p><h3>Note les outfits</h3></div>
            <span className="live-pill">LIVE</span>
          </div>
          <p className="muted">Note chaque autre participant sur 10. Tu ne peux pas te noter toi-même.</p>
          <div className="vote-list">
            {(data.participants || []).filter((p) => p.id !== currentPlayer.id).map((p) => (
              <div className="vote-row" key={p.id}>
                <div className="person">
                  <span className="person-avatar">{p.username.slice(0, 2).toUpperCase()}</span>
                  <strong>{p.username}</strong>
                </div>
                <div className="score-control">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={voteScores[p.id] || 5}
                    onChange={(e) => setVoteScores((v) => ({ ...v, [p.id]: Number(e.target.value) }))}
                  />
                  <b>{voteScores[p.id] || 5}/10</b>
                </div>
              </div>
            ))}
          </div>
          <button className="primary-button" onClick={submitVotes} disabled={busy === "vote"}>
            {busy === "vote" ? "Enregistrement…" : "Enregistrer mes notes"}
          </button>
        </section>
      )}

      {activeWeek?.votingStatus === "finalized" && (
        <section className="section-card">
          <div className="section-head">
            <div><p className="eyebrow">RÉSULTATS SEMAINE {activeWeek.weekNo}</p><h3>Podium officiel</h3></div>
            <span className="points-pill">3 · 2 · 1</span>
          </div>
          <div className="result-list">
            {finalResults.map((result) => (
              <div className="result-row" key={result.participantId}>
                <span className="rank-badge">#{result.rank}</span>
                <div><strong>{result.username}</strong><small>{Number(result.averageScore).toFixed(1)}/10 · {result.voteCount} vote(s)</small></div>
                <b>+{result.points} pt{result.points > 1 ? "s" : ""}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section-card">
        <div className="section-head">
          <div><p className="eyebrow">CE MOIS-CI</p><h3>Classement</h3></div>
          <span className="points-pill">PTS</span>
        </div>

        <div className="podium">
          {[top[1], top[0], top[2]].map((p, index) => {
            const rank = index === 0 ? 2 : index === 1 ? 1 : 3;
            return p ? (
              <div className={"podium-item rank-" + rank} key={p.participantId}>
                <span className="podium-avatar">{p.username.slice(0, 2).toUpperCase()}</span>
                <strong>{p.username}</strong>
                <small>{p.points} pts</small>
                <b>#{rank}</b>
              </div>
            ) : <div key={index}></div>;
          })}
        </div>

        <div className="list">
          {leaderboard.map((p, i) => (
            <div className="list-row" key={p.participantId}>
              <span>#{i + 1}</span><strong>{p.username}</strong><b>{p.points} pts</b>
            </div>
          ))}
        </div>
        <p className="footnote">Le classement repart à zéro au nouveau mois. Le #1 gagne une victoire mensuelle.</p>
      </section>

      <section className="section-card">
        <div className="section-head">
          <div><p className="eyebrow">SAISON {data.month?.year}</p><h3>Championnat annuel</h3></div>
          <span className="points-pill yellow">🏆 WINS</span>
        </div>
        {annual[0] && (
          <div className="season-leader">
            <span>Leader actuel</span>
            <strong>{annual[0].username}</strong>
            <small>{annual[0].monthlyWins} win(s) · {annual[0].points} pts cumulés</small>
          </div>
        )}
        <div className="list">
          {annual.map((p, i) => (
            <div className="list-row annual-row" key={p.participantId}>
              <span>#{i + 1}</span>
              <div><strong>{p.username}</strong><small>{p.points} pts saison</small></div>
              <b>{p.monthlyWins} win{p.monthlyWins > 1 ? "s" : ""}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-head">
          <div><p className="eyebrow">1 PAR PERSONNE / MOIS</p><h3>Proposer un thème</h3></div>
        </div>
        <form onSubmit={proposeTheme} className="proposal-form">
          <input value={proposal} onChange={(e) => setProposal(e.target.value)} maxLength={40} placeholder="Ex. Full Beige" />
          <button disabled={busy === "proposal"}>{data.proposal ? "Modifier" : "Ajouter"}</button>
        </form>
        <div className="proposal-cloud">
          {(data.proposals || []).map((p) => (
            <span key={p.id}><b>{p.themeName}</b> · {p.username}</span>
          ))}
        </div>
      </section>

      {data.isAdmin && (
        <section className="section-card admin-card">
          <div className="section-head">
            <div><p className="eyebrow">ADMIN · NOKS</p><h3>Contrôle semaine {activeWeek?.weekNo}</h3></div>
            <span className="admin-badge">ADMIN</span>
          </div>

          <label className="field">
            <span>Date et heure du challenge</span>
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </label>
          <label className="field">
            <span>Défi de la semaine</span>
            <textarea value={challengeText} onChange={(e) => setChallengeText(e.target.value)} rows={3} />
          </label>
          <button className="secondary-button" onClick={saveSchedule}>Enregistrer le planning</button>

          <div className="admin-grid">
            {activeWeek?.votingStatus !== "open" && activeWeek?.votingStatus !== "finalized" && (
              <button onClick={() => setWeekStatus("open")}>Ouvrir les votes</button>
            )}
            {activeWeek?.votingStatus === "open" && (
              <button onClick={() => setWeekStatus("close")}>Fermer les votes</button>
            )}
            {activeWeek?.votingStatus !== "finalized" && activeWeek?.status !== "skipped" && (
              <button className="success" onClick={finalizeWeek}>Finaliser 3 · 2 · 1</button>
            )}
            {activeWeek?.votingStatus !== "finalized" && (
              <button className="danger" onClick={() => setWeekStatus("skip")}>Sauter la semaine</button>
            )}
          </div>
        </section>
      )}

      <section className="rules">
        <div><b>01</b><span>Notes sur 10 entre participants</span></div>
        <div><b>02</b><span>Top 3 = 3, 2 et 1 points</span></div>
        <div><b>03</b><span>Le plus de points gagne le mois</span></div>
        <div><b>04</b><span>Le plus de wins mensuels gagne l’année</span></div>
      </section>

      <footer>Campus Fit · fait pour la fac, pas pour les algorithmes.</footer>

      {adminOpen && (
        <div className="modal-backdrop" onClick={() => setAdminOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {data.isAdmin ? (
              <>
                <p className="eyebrow">MODE ADMIN</p>
                <h3>Tu es connecté comme admin.</h3>
                <p className="muted">Tu peux tirer les thèmes, programmer les jours, ouvrir les votes et finaliser les podiums.</p>
                <button className="secondary-button" onClick={async () => {
                  await post({ action: "admin_logout" });
                  setAdminOpen(false);
                  await load(true);
                }}>Quitter le mode admin</button>
              </>
            ) : (
              <form onSubmit={adminLogin}>
                <p className="eyebrow">ACCÈS ADMIN</p>
                <h3>Code administrateur</h3>
                <p className="muted">Le username seul ne donne jamais les droits admin.</p>
                <input className="pin-input" type="password" inputMode="numeric" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} maxLength={12} placeholder="••••••" />
                <button className="primary-button" disabled={busy === "admin-login"}>{busy === "admin-login" ? "Vérification…" : "Déverrouiller"}</button>
              </form>
            )}
          </div>
        </div>
      )}

      <div className={"toast " + (toast ? "show" : "")}>{toast}</div>
    </main>
  );
}
