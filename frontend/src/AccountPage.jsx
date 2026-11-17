import React, { useEffect, useState } from "react";

const KEY = "voyage_rdc_session";
async function request(path, options = {}, token = "") {
  const response = await fetch("/api/compte" + path, {
    ...options, cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Une erreur est survenue.");
  return data;
}
export function getTravelerToken() { try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; } }
export async function saveTravelerTrip(depart, arrivee, modes) {
  const token = getTravelerToken();
  if (!token) { window.location.href = "/compte"; return null; }
  return request("/voyages", { method: "POST", body: JSON.stringify({ depart, arrivee, modes }) }, token);
}

export default function AccountPage() {
  const [token, setToken] = useState(getTravelerToken);
  const [user, setUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh(current) {
    const [profile, saved] = await Promise.all([request("/moi", {}, current), request("/voyages", {}, current)]);
    setUser(profile); setTrips(saved);
  }
  useEffect(() => { if (token) refresh(token).catch(() => { sessionStorage.removeItem(KEY); setToken(""); setUser(null); }); }, [token]);
  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await request(register ? "/inscription" : "/connexion", {
        method: "POST", body: JSON.stringify({
          ...(register ? { nom: form.get("nom") } : {}),
          email: form.get("email"), password: form.get("password")
        })
      });
      sessionStorage.setItem(KEY, data.token);
      setToken(data.token); setUser(data.user);
      setMessage("Bienvenue dans votre espace Voyage RDC.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    try { await request("/deconnexion", { method: "POST" }, token); } catch {}
    sessionStorage.removeItem(KEY); setToken(""); setUser(null); setTrips([]); setMessage("");
  }
  async function remove(id) {
    try { await request("/voyages/" + encodeURIComponent(id), { method: "DELETE" }, token); await refresh(token); }
    catch (e) { setError(e.message); }
  }
  return <div className="account-shell">
    <header className="account-header"><a href="/"><img src="/voyage-rdc-logo.svg" alt="Voyage RDC" /></a><nav><a href="/">Rechercher un itinéraire</a><a href="/compte">Mon compte</a></nav></header>
    <main className="account-main">
      <div className="account-heading"><span>VOYAGE RDC · ESPACE VOYAGEUR</span><h1>{user ? "Bonjour, " + user.nom : register ? "Créer mon compte" : "Mon espace voyageur"}</h1>
        <p>Conservez vos projets d’itinéraires et retrouvez-les lors de vos prochaines visites.</p></div>
      {error && <p className="account-alert" role="alert">{error}</p>}
      {message && <p className="account-success" role="status">{message}</p>}
      {!user ? <section className="account-card">
        <div className="account-tabs"><button className={!register ? "selected" : ""} type="button" onClick={() => { setRegister(false); setError(""); }}>Connexion</button><button className={register ? "selected" : ""} type="button" onClick={() => { setRegister(true); setError(""); }}>Créer un compte</button></div>
        <form onSubmit={submit}>
          {register && <label>Nom complet<input name="nom" type="text" minLength={2} maxLength={120} required autoComplete="name" placeholder="Votre nom" /></label>}
          <label>Adresse e-mail<input name="email" type="email" required autoComplete="email" placeholder="vous@exemple.com" /></label>
          <label>Mot de passe<input name="password" type="password" minLength={register ? 10 : undefined} required autoComplete={register ? "new-password" : "current-password"} placeholder={register ? "10 caractères minimum" : "Votre mot de passe"} /></label>
          <button className="account-primary" disabled={busy} type="submit">{busy ? "Veuillez patienter…" : register ? "Créer mon compte gratuitement" : "Me connecter"}</button>
        </form>
        <p className="account-note">Votre compte permet de sauvegarder des projets de voyage. Il ne constitue pas une réservation.</p>
      </section> : <>
        <div className="account-toolbar"><span>{user.email}</span><button type="button" onClick={logout}>Se déconnecter</button></div>
        <div className="account-stats"><div><strong>{trips.length}</strong><span>Projets enregistrés</span></div><div><strong>0</strong><span>Réservations confirmées</span></div><div><strong>0</strong><span>Paiements effectués</span></div></div>
        <section className="account-card"><h2>Mes itinéraires</h2>
          {trips.length ? trips.map(trip => <article className="account-trip" key={trip.id}>
            <div><h3>{trip.depart} → {trip.arrivee}</h3><p>Transport : {trip.modes.replaceAll(",", ", ")}</p><p><strong>{trip.statut}</strong></p><small>Enregistré le {new Date(trip.created_at).toLocaleDateString("fr-FR")}</small></div>
            <button type="button" onClick={() => remove(trip.id)}>Supprimer</button>
          </article>) : <p>Aucun itinéraire sauvegardé. Recherchez un trajet puis choisissez « Enregistrer dans mon compte ».</p>}
          <a className="account-link" href="/">+ Rechercher un nouvel itinéraire</a>
        </section>
        <section className="account-card"><h2>Hébergements et paiements</h2>
          <p>La réservation d’hébergement, le paiement en ligne et le suivi des confirmations ne sont pas encore disponibles. Aucun prélèvement n’est effectué par Voyage RDC.</p>
          <p>Pour une demande d’information : <a href="https://wa.me/243830033332" target="_blank" rel="noopener noreferrer">WhatsApp Voyage RDC</a>.</p>
        </section>
      </>}
    </main>
    <footer className="account-footer"><a href="/confidentialite">Confidentialité</a> · <a href="/contact">Contact</a> · Voyage RDC</footer>
  </div>;
}
