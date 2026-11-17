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
  const [section, setSection] = useState("reservations");
  const [filter, setFilter] = useState("toutes");
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
  const confirmedBookings = bookings.filter(b => b.statut === "Réservation confirmée");
  const visibleBookings = bookings.filter(b => filter === "toutes" || (filter === "confirmees" ? b.statut === "Réservation confirmée" : filter === "attente" ? b.statut !== "Réservation confirmée" && b.statut !== "Demande refusée" : b.statut === "Demande refusée"));
  return <div className="account-shell">{receipt && <BookingReceipt booking={receipt} traveler={user} onClose={() => setReceipt(null)} />}
    <header className="account-header"><a href="/"><img src="/voyage-rdc-logo.svg" alt="Voyage RDC" /></a><nav><a href="/">Rechercher un itinéraire</a><a href="/compte">Mon compte</a></nav></header>
    <main className="account-main">
      <div className="account-heading"><span>VOYAGE RDC · ESPACE VOYAGEUR</span><h1>{user ? "Bonjour, " + user.nom : register ? "Créer mon compte" : "Mon espace voyageur"}</h1>
        <p>Gérez vos réservations, suivez leur validation, préparez vos paiements et retrouvez vos documents.</p></div>
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
        <p className="account-note">Après connexion : Mes réservations, suivi, gestion des demandes, mes paiements, documents et itinéraires. Les paiements en ligne ne sont pas encore activés.</p>
      </section> : <>
        <div className="account-toolbar"><span>{user.email}</span><button type="button" onClick={logout}>Se déconnecter</button></div>
        <div className="account-stats"><div><strong>{bookings.length}</strong><span>Mes réservations et demandes</span></div><div><strong>{confirmedBookings.length}</strong><span>Réservations confirmées</span></div><div><strong>{bookings.filter(b => b.paiement_methode).length}</strong><span>Préférences de paiement</span></div></div>
        <nav className="account-dashboard-nav" aria-label="Rubriques de mon compte">
          {[["reservations","Mes réservations"],["suivi","Suivre mes réservations"],["nouvelle","Nouvelle réservation"],["paiements","Mes paiements"],["itineraires","Mes itinéraires"]].map(([key,label]) =>
            <button type="button" key={key} className={section === key ? "selected" : ""} onClick={() => {setSection(key);setError("");}}>{label}</button>)}
        </nav>
        {section === "itineraires" && <section className="account-card"><h2>Mes itinéraires</h2>
          {trips.length ? trips.map(trip => <article className="account-trip" key={trip.id}>
            <div><h3>{trip.depart} → {trip.arrivee}</h3><p>Transport : {trip.modes.replaceAll(",", ", ")}</p><p><strong>{trip.statut}</strong></p><small>Enregistré le {new Date(trip.created_at).toLocaleDateString("fr-FR")}</small></div>
            <button type="button" onClick={() => remove(trip.id)}>Supprimer</button>
          </article>) : <p>Aucun itinéraire sauvegardé. Recherchez un trajet puis choisissez « Enregistrer dans mon compte ».</p>}
          <a className="account-link" href="/">+ Rechercher un nouvel itinéraire</a>
        </section>}
        {section === "nouvelle" && <section className="account-card"><h2>Nouvelle demande de réservation</h2>
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
        </section>}
        {(section === "reservations" || section === "suivi" || section === "paiements") && <section className="account-card"><h2>{section === "paiements" ? "Mes paiements" : section === "suivi" ? "Suivi de mes réservations" : "Mes réservations · Gérer mes demandes"}</h2>
          {section === "reservations" && <div className="account-filters"><label>Afficher <select value={filter} onChange={e => setFilter(e.target.value)}><option value="toutes">Toutes</option><option value="attente">En attente</option><option value="confirmees">Confirmées</option><option value="refusees">Refusées</option></select></label><button type="button" onClick={() => setSection("nouvelle")}>+ Nouvelle demande</button></div>}
          {section === "suivi" && <p>Suivez ici l’état de chaque demande. La validation est effectuée par Voyage RDC après vérification auprès du prestataire. Une demande enregistrée ne garantit pas une place.</p>}
          {section === "paiements" && <p>Consultez le mode de paiement choisi et son état. « Paiement sur place » signifie un règlement futur auprès du prestataire, uniquement après confirmation. Aucun paiement en ligne n’est actuellement possible et aucun règlement n’est enregistré comme encaissé.</p>}
          {!bookings.length && <p>Aucune demande enregistrée pour le moment.</p>}
          {(section === "reservations" ? visibleBookings : bookings).map(b => <article className="account-trip" key={b.id}>
            <div><h3>{b.type === "hebergement" ? "🏨" : "🚌"} {b.prestataire} · {b.ville}</h3>
              <p>{b.date_debut}{b.date_fin ? " → " + b.date_fin : ""} · {b.voyageurs} voyageur(s)</p><small>Référence : {b.reference || b.id}</small>
              <p><strong>{b.statut}</strong></p>{section === "suivi" && <p>{b.statut === "Réservation confirmée" ? "✓ Réservation validée — téléchargez votre confirmation ci-dessous." : b.statut === "Demande refusée" ? "Demande refusée — contactez Voyage RDC pour une autre option." : "⏳ En attente de validation par Voyage RDC et le prestataire."}</p>}
              <p>Paiement : {b.paiement_statut}</p>
              <label>Mode de paiement envisagé<select value={b.paiement_methode || ""} onChange={e => paymentChoice(b.id,e.target.value)}>
                <option value="" disabled>Choisir pour plus tard</option><option value="sur_place">Paiement sur place (après validation)</option><option value="mpesa">M-Pesa</option><option value="airtel_money">Airtel Money</option><option value="orange_money">Orange Money</option><option value="carte">Carte bancaire</option>
              </select></label>
              <small>Le paiement sur place dépend de l’accord du prestataire et de la confirmation de votre réservation. Les paiements en ligne ne sont pas encore activés.</small>
            </div><div className="account-booking-actions"><button type="button" onClick={() => setReceipt(b)}>{b.statut === "Réservation confirmée" ? "Voir la confirmation" : "Voir le récépissé"}</button>{b.statut !== "Réservation confirmée" && <button type="button" onClick={() => {if(window.confirm("Supprimer cette demande de votre compte ?")) deleteBooking(b.id);}}>Supprimer</button>}</div>
          </article>)}
          <p><strong>Important :</strong> aucun tarif ni disponibilité n'est garanti, aucune carte ni donnée Mobile Money n'est demandée, aucun débit n'est effectué. Les confirmations et paiements réels seront activés après connexion des partenaires et d'un prestataire agréé.</p>
          <p>Contact : <a href="https://wa.me/243830033332" target="_blank" rel="noopener noreferrer">WhatsApp Voyage RDC</a>.</p>
        </section>}
      </>}
    </main>
    <footer className="account-footer"><a href="/confidentialite">Confidentialité</a> · <a href="/contact">Contact</a> · Voyage RDC</footer>
  </div>;
}
