import { COUNTRIES, CITIES_BY_COUNTRY, countryCode } from "./countries";
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


function ProfileLocationFields({ traveler }) {
  const [origin, setOrigin] = useState(traveler.pays_origine || "");
  const [current, setCurrent] = useState(traveler.pays || "");
  const [city, setCity] = useState(traveler.ville || "");
  const [manual, setManual] = useState(false);
  const suggestions = CITIES_BY_COUNTRY[countryCode(current)] || [];
  const selectedCity = manual || (city && !suggestions.includes(city)) ? "__other" : city;
  function chooseCountry(value) {
    setCurrent(value);setCity("");setManual(false);
  }
  const countryOptions = (selected) => <>
    <option value="">Sélectionnez un pays</option>
    {selected && !COUNTRIES.some(c=>c.name===selected) && <option value={selected}>{selected}</option>}
    {COUNTRIES.map(c=><option key={c.code} value={c.name}>{c.name}</option>)}
  </>;
  return <>
    <label>Pays d'origine
      <select name="pays_origine" value={origin} onChange={e=>setOrigin(e.target.value)}>
        {countryOptions(origin)}
      </select>
    </label>
    <label>Pays actuel
      <select name="pays" value={current} onChange={e=>chooseCountry(e.target.value)}>
        {countryOptions(current)}
      </select>
    </label>
    <label>Ville actuelle
      <select aria-label="Choisir une ville" value={selectedCity} onChange={e=>{
        if(e.target.value==="__other"){setManual(true);setCity("");}
        else{setManual(false);setCity(e.target.value);}
      }}>
        <option value="">Sélectionnez une ville</option>
        {suggestions.map(name=><option key={name} value={name}>{name}</option>)}
        <option value="__other">Ma ville n'est pas dans la liste — saisir manuellement</option>
      </select>
      {(manual || (city && !suggestions.includes(city))) && <input
        aria-label="Saisir ma ville manuellement" type="text" maxLength={120}
        placeholder="Saisissez le nom de votre ville" value={city} onChange={e=>setCity(e.target.value)} />}
      <input type="hidden" name="ville" value={city} />
      {!suggestions.length && <small>Vous pouvez saisir votre ville en choisissant « Ma ville n'est pas dans la liste ».</small>}
    </label>
  </>;
}

export default function AccountPage({ renderSearch }) {
  const [token, setToken] = useState(getTravelerToken);
  const [user, setUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingType, setBookingType] = useState("hebergement");
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [rate, setRate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [travelerCount, setTravelerCount] = useState(1);
  const [routeChoice, setRouteChoice] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [register, setRegister] = useState(false);
  const [section, setSection] = useState("reservations");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [apkTheme, setApkTheme] = useState(() => { try { return localStorage.getItem("voyage_rdc_apk_theme") === "dark" ? "dark" : "light"; } catch { return "light"; } });
  function toggleApkTheme() { const next = apkTheme === "dark" ? "light" : "dark"; setApkTheme(next); try { localStorage.setItem("voyage_rdc_apk_theme", next); } catch {} }
  const isAndroidApp = typeof window !== "undefined" && !!window.VoyageRDCAndroid;
  const [filter, setFilter] = useState("toutes");
  const [identityFile, setIdentityFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh(current) {
    const [profile, saved, requests] = await Promise.all([request("/moi", {}, current), request("/voyages", {}, current), request("/reservations", {}, current)]);
    setUser(profile); setTrips(saved); setBookings(requests);

  }
  useEffect(() => { if (!token) return; let active=true; request("/moi",{},token).then(profile=>{if(!active)return;setUser(profile);if(profile.role==="admin"){window.location.replace("/admin");return;}return refresh(token);}).catch(err=>{if(!active)return;if(/Session expirée|Connectez-vous|invalide/i.test(err.message)){sessionStorage.removeItem(KEY);setToken("");setUser(null);}else{setError("Connexion au serveur momentanément indisponible. Réessayez sans vous déconnecter.");}});return ()=>{active=false;}; }, [token]);
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
      if (data.user.role === "admin") { window.location.replace("/admin"); return; }
      setToken(data.token); setUser(data.user); setSection("reservations");
      setMessage("Bienvenue dans votre espace Voyage RDC.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function saveProfile(event) {
    event.preventDefault(); setBusy(true);setError("");setMessage("");
    const f = new FormData(event.currentTarget);
    const keys = ["nom","postnom","prenom","lieu_naissance","date_naissance","telephone","pays_origine","pays","ville","adresse"];
    const data = Object.fromEntries(keys.map(k=>[k,f.get(k) || (k==="date_naissance" ? null : "")]));
    try {
      await request("/moi",{method:"PATCH",body:JSON.stringify(data)},token);
      if (identityFile) {
        if(identityFile.size>3*1024*1024)throw Error("La pièce d'identité ne doit pas dépasser 3 Mo.");
        if(!["application/pdf","image/jpeg","image/png"].includes(identityFile.type))throw Error("Choisissez un fichier PDF, JPG ou PNG.");
        const encoded = await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(String(reader.result).split(",")[1]);
          reader.onerror=()=>reject(new Error("Lecture du document impossible."));
          reader.readAsDataURL(identityFile);
        });
        await request("/moi/piece-identite",{method:"POST",body:JSON.stringify({filename:identityFile.name,content_type:identityFile.type,data:encoded})},token);
        setIdentityFile(null);
      }
      await refresh(token);setMessage("Informations de votre compte enregistrées.");
    } catch(e) {setError(e.message);}
    finally {setBusy(false);}
  }
  async function removeIdentity() {
    if(!window.confirm("Supprimer votre pièce d'identité enregistrée ?"))return;
    try {await request("/moi/piece-identite",{method:"DELETE"},token);await refresh(token);setMessage("Pièce d'identité supprimée.");}
    catch(e){setError(e.message);}
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
        voyageurs: Number(f.get("voyageurs")), details: f.get("details") || "",
        ...(isAndroidApp ? {source_apk:true, nom:f.get("nom") || "",postnom:f.get("postnom") || "",prenom:f.get("prenom") || "",lieu_naissance:f.get("lieu_naissance") || "",date_naissance:f.get("date_naissance") || null,telephone:f.get("telephone") || "",email:f.get("email") || "",numero_identite:f.get("numero_identite") || "",itineraire:f.get("itineraire") || "",prix_unitaire:f.get("prix_unitaire") ? Number(f.get("prix_unitaire")) : null,devise:f.get("devise") || "USD",modalite:f.get("modalite") || ""} : {})
      }) }, token);
      setMessage(data.message); event.currentTarget.reset(); setArrival("");setDeparture("");setRate("");setTravelerCount(1);setRouteChoice("");await refresh(token);
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
  return <div className={isAndroidApp ? "account-shell account-apk account-apk-" + apkTheme : "account-shell"}>{receipt && <BookingReceipt booking={receipt} traveler={user} onClose={() => setReceipt(null)} />}
    <header className="account-header"><a href="/"><img src="/voyage-rdc-logo.svg" alt="Voyage RDC" /></a><nav>{user ? <button type="button" onClick={()=>setSection("recherche")}>Rechercher un itinéraire</button> : <a href="/">Rechercher un itinéraire</a>}<a href="/compte" className="account-header-profile"><span className="account-avatar account-avatar-small" aria-hidden="true">●</span> Mon compte</a></nav>      {user && !isAndroidApp && <div className="account-web-top-actions"><span className="account-web-identity"><span className="account-avatar account-avatar-small" aria-hidden="true">{(user.prenom || user.nom || "V").trim().charAt(0).toLocaleUpperCase("fr")}</span><span><strong>{[user.nom,user.postnom,user.prenom].filter(Boolean).join(" ")}</strong><small>{user.email}</small></span></span><button type="button" className="account-web-settings" onClick={()=>{setSection("parametres");setError("");}}>⚙ Paramètres de mon compte</button><button type="button" className="account-signout" onClick={logout}>Se déconnecter</button></div>}
      {user && isAndroidApp && <div className="account-top-actions">
        <div className="account-profile-menu-wrap">
          <button type="button" className="account-top-profile" aria-expanded={profileMenuOpen} onClick={()=>setProfileMenuOpen(!profileMenuOpen)}>
            <span className="account-profile-circle" aria-hidden="true">{(user.prenom || user.nom || "V").trim().charAt(0).toLocaleUpperCase("fr")}</span> <span className="account-profile-label">Mon profil</span> <span aria-hidden="true">⌄</span>
          </button>
          {profileMenuOpen && <div className="account-profile-submenu">
            <button type="button" onClick={()=>{setSection("parametres");setProfileMenuOpen(false);}}>⚙ Paramètres de mon compte</button>
          </div>}
        </div>
        <button type="button" className="account-theme-toggle" aria-label={apkTheme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"} title={apkTheme === "dark" ? "Thème clair" : "Thème sombre"} onClick={toggleApkTheme}>{apkTheme === "dark" ? "☀" : "☾"}</button>
        <button type="button" className="account-top-logout" onClick={logout}>Se déconnecter</button>
      </div>}
</header>
    <main className="account-main">
      <div className="account-heading"><span>VOYAGE RDC · ESPACE VOYAGEUR</span><h1>{user ? "Bonjour, " + user.nom : register ? "Créer mon compte" : "Mon espace voyageur"}</h1>
        <p>Gérez vos réservations, suivez leur validation, préparez vos paiements et retrouvez vos documents.</p></div>
      {user?.role === "admin" && <section className="account-card"><h2>Administration Voyage RDC</h2><p>Vous êtes connecté comme administrateur.</p><a href="/admin">Accéder aux fonctions administrateur</a></section>}
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
        <div className="account-stats"><div><strong>{bookings.length}</strong><span>Mes réservations et demandes</span></div><div><strong>{confirmedBookings.length}</strong><span>Réservations confirmées</span></div><div><strong>{bookings.filter(b => b.paiement_methode).length}</strong><span>Préférences de paiement</span></div></div>
        {!isAndroidApp && <nav className="account-dashboard-nav" aria-label="Rubriques de mon compte">
          {[["reservations","Mes réservations"],["suivi","Suivre mes réservations"],["nouvelle","Nouvelle réservation"],["paiements","Mes paiements"],["itineraires","Mes itinéraires"]].map(([key,label]) =>
            <button type="button" key={key} className={section === key ? "selected" : ""} onClick={() => {setSection(key);setError("");}}>{label}</button>)}
        </nav>}
        {section === "parametres" && <section className="account-card"><h2>Paramètres de mon compte · Mes informations</h2>
          <p>Complétez vos informations personnelles. Elles seront reprises automatiquement lors de vos nouvelles demandes de réservation.</p>
          <form key={user.id + JSON.stringify(user)} onSubmit={saveProfile}>
            <div className="account-profile-grid">
              <label>Nom<input name="nom" defaultValue={user.nom || ""} maxLength={120} required /></label>
              <label>Postnom<input name="postnom" defaultValue={user.postnom || ""} maxLength={120} /></label>
              <label>Prénom<input name="prenom" defaultValue={user.prenom || ""} maxLength={120} /></label>
              <label>Lieu de naissance<input name="lieu_naissance" defaultValue={user.lieu_naissance || ""} maxLength={150} /></label>
              <label>Date de naissance<input name="date_naissance" type="date" max={new Date().toISOString().slice(0,10)} defaultValue={user.date_naissance || ""} /></label>
              <label>Numéro de téléphone<input name="telephone" type="tel" defaultValue={user.telephone || ""} maxLength={35} placeholder="+243..." /></label>
              <ProfileLocationFields traveler={user} />
              <label>Adresse<input name="adresse" defaultValue={user.adresse || ""} maxLength={300} /></label>
            </div>
            <label>Pièce d'identité (facultatif) · PDF, JPG ou PNG · 3 Mo maximum<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e=>setIdentityFile(e.target.files?.[0]||null)} /></label>
            {user.piece_identite && <p>Document enregistré : <strong>{user.piece_identite}</strong> <button type="button" onClick={removeIdentity}>Supprimer le document</button></p>}
            <p>La pièce d'identité est conservée chiffrée et n'est pas automatiquement transmise aux prestataires. Vous pouvez la supprimer à tout moment.</p>
            <button className="account-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer mes informations"}</button>
          </form>
        </section>}
        {section === "itineraires" && <section className="account-card"><h2>Mes itinéraires</h2>
          {trips.length ? trips.map(trip => <article className="account-trip" key={trip.id}>
            <div><h3>{trip.depart} → {trip.arrivee}</h3><p>Transport : {trip.modes.replaceAll(",", ", ")}</p><p><strong>{trip.statut}</strong></p><small>Enregistré le {new Date(trip.created_at).toLocaleDateString("fr-FR")}</small></div>
            <button type="button" onClick={() => remove(trip.id)}>Supprimer</button>
          </article>) : <p>Aucun itinéraire sauvegardé. Recherchez un trajet puis choisissez « Enregistrer dans mon compte ».</p>}
          <button className="account-primary" type="button" onClick={()=>setSection("recherche")}>+ Rechercher un nouvel itinéraire</button>
        </section>}
        {section === "recherche" && <><button className="account-primary" type="button" onClick={()=>setSection("itineraires")}>← Mes itinéraires</button>{renderSearch?.({traveler:user,onSaved:()=>refresh(token).catch(e=>setError(e.message)),onBooked:()=>refresh(token).catch(e=>setError(e.message)),onTrips:()=>setSection("itineraires")})}</>}
        {section === "nouvelle" && <section className="account-card"><h2>Nouvelle demande de réservation</h2>
          <p>Préparez une demande d'hébergement ou de transport. Les partenaires et disponibilités ne sont pas encore connectés : la demande doit être validée par le prestataire avant tout paiement sur place.</p>
          <div className="account-profile-summary"><h3>Informations du voyageur reprises depuis mon compte</h3><p><strong>{[user.nom,user.postnom,user.prenom].filter(Boolean).join(" ")}</strong> · {user.telephone || "Téléphone non renseigné"} · {[user.ville,user.pays].filter(Boolean).join(", ") || "Adresse non renseignée"}</p><p>{user.date_naissance ? "Né(e) le "+user.date_naissance+" à "+(user.lieu_naissance||"—") : "Date de naissance non renseignée"} · {user.piece_identite ? "Pièce d’identité enregistrée (non transmise)" : "Aucune pièce d’identité jointe"}</p><button type="button" onClick={()=>setSection("parametres")}>Modifier mes informations</button></div>
          <form onSubmit={createBooking}>
            <label>Type de demande<select value={bookingType} onChange={e => setBookingType(e.target.value)}><option value="hebergement">Hébergement</option><option value="transport">Transport</option></select></label>
            {isAndroidApp && bookingType === "transport" && <div className="account-apk-booking-fields"><h3>Informations obligatoires du voyageur</h3>
              <div className="account-profile-grid">
                <label>Nom *<input name="nom" defaultValue={user.nom || ""} required maxLength={120} /></label>
                <label>Postnom *<input name="postnom" defaultValue={user.postnom || ""} required maxLength={120} /></label>
                <label>Prénom *<input name="prenom" defaultValue={user.prenom || ""} required maxLength={120} /></label>
                <label>Lieu de naissance *<input name="lieu_naissance" defaultValue={user.lieu_naissance || ""} required maxLength={150} /></label>
                <label>Date de naissance *<input name="date_naissance" type="date" max={new Date().toISOString().slice(0,10)} defaultValue={user.date_naissance || ""} required /></label>
                <label>Téléphone *<input name="telephone" type="tel" defaultValue={user.telephone || ""} required maxLength={35} /></label>
                <label>E-mail (facultatif)<input name="email" type="email" defaultValue={user.email || ""} maxLength={254} /></label>
                <label>Numéro de pièce d'identité (facultatif)<input name="numero_identite" maxLength={100} /></label>
              </div>
              <label>Itinéraire *<select value={routeChoice} onChange={e=>setRouteChoice(e.target.value)} required>
                <option value="">Choisir un itinéraire enregistré</option>
                {trips.map(t=><option key={t.id} value={t.depart+" → "+t.arrivee}>{t.depart} → {t.arrivee} ({t.modes})</option>)}
                <option value="autre">Saisir mon itinéraire</option>
              </select></label>
              {routeChoice === "autre" ? <input name="itineraire" placeholder="Départ → arrivée" required maxLength={250} /> : <input type="hidden" name="itineraire" value={routeChoice} />}
              <p className="account-apk-note">La compagnie est indiquée dans le champ ci-dessous. Le prix du billet doit être communiqué par le transporteur.</p>
            </div>}
            <label>{bookingType === "hebergement" ? "Nom de l'hôtel" : "Nom de la compagnie de transport"}<input name="prestataire" minLength={2} maxLength={180} placeholder={bookingType === "hebergement" ? "Hôtel à contacter" : "Compagnie à contacter"} required /></label>
            <label>Ville<input name="ville" minLength={2} maxLength={120} required placeholder="Ex. Kinshasa" /></label>
            <label>{bookingType === "hebergement" ? "Date d'arrivée" : "Date de départ"}<input name="date_debut" type="date" min={new Date().toISOString().slice(0,10)} value={isAndroidApp ? arrival : undefined} onChange={isAndroidApp ? e=>setArrival(e.target.value) : undefined} required /></label>
            {bookingType === "hebergement" && <label>Date de départ de l'hôtel<input name="date_fin" type="date" min={arrival || new Date().toISOString().slice(0,10)} value={isAndroidApp ? departure : undefined} onChange={isAndroidApp ? e=>setDeparture(e.target.value) : undefined} required /></label>}
            <label>Nombre de voyageurs<input name="voyageurs" type="number" min="1" max="20" value={isAndroidApp ? travelerCount : undefined} defaultValue={!isAndroidApp ? 1 : undefined} onChange={isAndroidApp ? e=>setTravelerCount(Number(e.target.value)) : undefined} required /></label>
            {isAndroidApp && <div className="account-apk-booking-fields"><h3>{bookingType === "hebergement" ? "Séjour et montant estimatif" : "Billet et montant estimatif"}</h3>
              {bookingType === "hebergement" && <p><strong>Nombre de nuits : {arrival && departure && departure > arrival ? Math.round((new Date(departure+"T00:00:00")-new Date(arrival+"T00:00:00"))/86400000) : "—"}</strong></p>}
              <label>{bookingType === "hebergement" ? "Tarif communiqué par l’hôtel / nuit (facultatif)" : "Prix du billet communiqué par la compagnie / personne (facultatif)"}<input name="prix_unitaire" type="number" min="0" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} placeholder="À confirmer auprès du prestataire" /></label>
              <label>Devise<select name="devise" value={currency} onChange={e=>setCurrency(e.target.value)}><option value="USD">USD</option><option value="CDF">CDF</option></select></label>
              {bookingType === "hebergement" && <label>Modalités proposées par l’hôtel (si connues)<input name="modalite" maxLength={120} placeholder="Ex. à l’arrivée, acompte selon l’hôtel" /></label>}
              <p><strong>Total estimatif : {rate !== "" && (bookingType !== "hebergement" || (arrival && departure && departure > arrival)) ? (Number(rate) * (bookingType === "hebergement" ? Math.round((new Date(departure+"T00:00:00")-new Date(arrival+"T00:00:00"))/86400000) : travelerCount)).toLocaleString("fr-FR",{maximumFractionDigits:2})+" "+currency : "Tarif non communiqué"}</strong></p>
              <small>Montant indicatif uniquement, calculé à partir du tarif renseigné. Aucune disponibilité, modalité ou prix partenaire n’est confirmé automatiquement ; aucun paiement n’est encaissé.</small>
            </div>}
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
            </div><div className="account-booking-actions"><button type="button" onClick={() => setReceipt(b)}>{b.statut === "Réservation confirmée" ? "Voir la confirmation" : "Voir le récépissé"}</button>{isAndroidApp && <button type="button" onClick={() => setReceipt(b)}>Voir / Télécharger PDF</button>}{b.statut !== "Réservation confirmée" && <button type="button" onClick={() => {if(window.confirm("Supprimer cette demande de votre compte ?")) deleteBooking(b.id);}}>Supprimer</button>}</div>
          </article>)}
          <p><strong>Important :</strong> aucun tarif ni disponibilité n'est garanti, aucune carte ni donnée Mobile Money n'est demandée, aucun débit n'est effectué. Les confirmations et paiements réels seront activés après connexion des partenaires et d'un prestataire agréé.</p>
          <p>Contact : <a href="https://wa.me/243830033332" target="_blank" rel="noopener noreferrer">WhatsApp Voyage RDC</a>.</p>
        </section>}
        {isAndroidApp && <nav className="account-bottom-actions" aria-label="Navigation de mon compte">
          {[["reservations","▤","Mes réservations"],["nouvelle","＋","Nouvelle réservation"],["suivi","◎","Suivre mes réservations"],["paiements","▣","Mes paiements"],["itineraires","⌁","Mes itinéraires"]].map(([key,icon,label])=>
            <button key={key} type="button" className={section===key?"account-bottom-tab active":"account-bottom-tab"} aria-current={section===key?"page":undefined} onClick={()=>{setSection(key);setError("");setProfileMenuOpen(false);window.scrollTo({top:0,behavior:"smooth"});}}>
              <span aria-hidden="true">{icon}</span><span>{label}</span>
            </button>)}
        </nav>}
      </>}
    </main>
    <footer className="account-footer"><a href="/confidentialite">Confidentialité</a> · <a href="/contact">Contact</a> · Voyage RDC</footer>
  </div>;
}
