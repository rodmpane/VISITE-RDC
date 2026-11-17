import BookingReceipt from "./BookingReceipt";
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
  const [bookings, setBookings] = useState([]);
  const [bookingType, setBookingType] = useState("hebergement");
  const [receipt, setReceipt] = useState(null);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh(current) {
    const [profile, saved, requests] = await Promise.all([request("/moi", {}, current), request("/voyages", {}, current), request("/reservations", {}, current)]);
    setUser(profile); setTrips(saved); setBookings(requests);
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
    sessionStorage.removeItem(KEY); setToken(""); setUser(null); setTrips([]); setBookings([]); setMessage("");
  }
  async function remove(id) {
    try { await request("/voyages/" + encodeURIComponent(id), { method: "DELETE" }, token); await refresh(token); }
    catch (e) { setError(e.message); }
  }
  async function createBooking(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const f = new FormData(event.currentTarget);
    try {
      const data = await request("/reservations", { method: "POST", body: JSON.stringify({
        type: bookingType, prestataire: f.get("prestataire"), ville: f.get("ville"),
        date_debut: f.get("date_debut"), date_fin: bookingType === "hebergement" ? f.get("date_fin") : null,
        voyageurs: Number(f.get("voyageurs")), details: f.get("details") || ""
      }) }, token);
      setMessage(data.message); event.currentTarget.reset(); await refresh(token);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function paymentChoice(id, methode) {
    try {
      const data = await request("/reservations/" + id + "/paiement", { method: "PATCH", body: JSON.stringify({ methode }) }, token);
      setMessage(data.message); await refresh(token);
    } catch(e) { setError(e.message); }
  }
  async function deleteBooking(id) {
    try { await request("/reservations/" + id, { method: "DELETE" }, token); await refresh(token); }
    catch(e) { setError(e.message); }
  }
  return <div className="account-shell">{receipt && <BookingReceipt booking={receipt} traveler={user} onClose={() => setReceipt(null)} />}
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
        <div className="account-stats"><div><strong>{trips.length}</strong><span>Projets enregistrés</span></div><div><strong>{bookings.length}</strong><span>Demandes non confirmées</span></div><div><strong>0</strong><span>Paiements effectués</span></div></div>
        <section className="account-card"><h2>Mes itinéraires</h2>
          {trips.length ? trips.map(trip => <article className="account-trip" key={trip.id}>
            <div><h3>{trip.depart} → {trip.arrivee}</h3><p>Transport : {trip.modes.replaceAll(",", ", ")}</p><p><strong>{trip.statut}</strong></p><small>Enregistré le {new Date(trip.created_at).toLocaleDateString("fr-FR")}</small></div>
            <button type="button" onClick={() => remove(trip.id)}>Supprimer</button>
          </article>) : <p>Aucun itinéraire sauvegardé. Recherchez un trajet puis choisissez « Enregistrer dans mon compte ».</p>}
          <a className="account-link" href="/">+ Rechercher un nouvel itinéraire</a>
        </section>
        <section className="account-card"><h2>Demander une réservation</h2>
          <p>Préparez une demande d'hébergement ou de transport. Les partenaires et disponibilités ne sont pas encore connectés : la demande doit être validée par le prestataire avant tout paiement sur place.</p>
          <form onSubmit={createBooking}>
            <label>Type de demande<select value={bookingType} onChange={e => setBookingType(e.target.value)}><option value="hebergement">Hébergement</option><option value="transport">Transport</option></select></label>
            <label>Nom de l'établissement ou du transporteur<input name="prestataire" minLength={2} maxLength={180} placeholder="Prestataire à contacter" required /></label>
            <label>Ville<input name="ville" minLength={2} maxLength={120} required placeholder="Ex. Kinshasa" /></label>
            <label>{bookingType === "hebergement" ? "Date d'arrivée" : "Date de départ"}<input name="date_debut" type="date" min={new Date().toISOString().slice(0,10)} required /></label>
            {bookingType === "hebergement" && <label>Date de départ de l'hôtel<input name="date_fin" type="date" min={new Date().toISOString().slice(0,10)} required /></label>}
            <label>Nombre de voyageurs<input name="voyageurs" type="number" min="1" max="20" defaultValue="1" required /></label>
            <label>Précisions facultatives<textarea name="details" maxLength={500} placeholder="Chambre souhaitée, trajet, besoins particuliers…" /></label>
            <button className="account-primary" disabled={busy} type="submit">Enregistrer ma demande</button>
          </form>
        </section>
        <section className="account-card"><h2>Mes demandes et paiements</h2>
          {!bookings.length && <p>Aucune demande enregistrée pour le moment.</p>}
          {bookings.map(b => <article className="account-trip" key={b.id}>
            <div><h3>{b.type === "hebergement" ? "🏨" : "🚌"} {b.prestataire} · {b.ville}</h3>
              <p>{b.date_debut}{b.date_fin ? " → " + b.date_fin : ""} · {b.voyageurs} voyageur(s)</p>
              <p><strong>{b.statut}</strong></p>
              <p>Paiement : {b.paiement_statut}</p>
              <label>Mode de paiement envisagé<select value={b.paiement_methode || ""} onChange={e => paymentChoice(b.id,e.target.value)}>
                <option value="" disabled>Choisir pour plus tard</option><option value="sur_place">Paiement sur place (après validation)</option><option value="mpesa">M-Pesa</option><option value="airtel_money">Airtel Money</option><option value="orange_money">Orange Money</option><option value="carte">Carte bancaire</option>
              </select></label>
              <small>Le paiement sur place dépend de l’accord du prestataire et de la confirmation de votre réservation. Les paiements en ligne ne sont pas encore activés.</small>
            </div><div className="account-booking-actions"><button type="button" onClick={() => setReceipt(b)}>{b.statut === "Réservation confirmée" ? "Voir la confirmation" : "Voir le récépissé"}</button><button type="button" onClick={() => deleteBooking(b.id)}>Supprimer</button></div>
          </article>)}
          <p><strong>Important :</strong> aucun tarif ni disponibilité n'est garanti, aucune carte ni donnée Mobile Money n'est demandée, aucun débit n'est effectué. Les confirmations et paiements réels seront activés après connexion des partenaires et d'un prestataire agréé.</p>
          <p>Contact : <a href="https://wa.me/243830033332" target="_blank" rel="noopener noreferrer">WhatsApp Voyage RDC</a>.</p>
        </section>
      </>}
    </main>
    <footer className="account-footer"><a href="/confidentialite">Confidentialité</a> · <a href="/contact">Contact</a> · Voyage RDC</footer>
  </div>;
}
