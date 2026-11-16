import React, { useEffect, useMemo, useState } from "react";

const MODES = [
  ["avion", "✈", "Avion"], ["bus", "▣", "Bus"], ["voiture", "◆", "Voiture"],
  ["moto", "◈", "Moto"], ["fleuve", "≋", "Fleuve"], ["lac", "≈", "Lac"],
  ["bac", "⇄", "Bac"], ["train", "▤", "Train"],
];
const MODE_LABEL = Object.fromEntries(MODES.map(([key, icon, name]) => [key, `${icon} ${name}`]));
const AIRLINES = [
  ["Air Congo", "https://www.air-congo.com/r%C3%A9servation/r%C3%A9servation-d%27un-voyage/r%C3%A9server-un-vol"],
  ["CAA", "https://caacongo.com/reservation.html"],
  ["Congo Airways", "https://www.congoairways.com/"],
  ["Ethiopian Airlines", "https://www.ethiopianairlines.com/cd/fr/book/booking/flight"],
];
const CONTACT = "+243810151533";
const EAST_PROVINCES = new Set(["nord-kivu", "sud-kivu", "ituri"]);
const CRITERE_LABEL = { rapide: "Le plus rapide", economique: "Le plus économique", court: "Le plus court" };

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { ...opts, headers: { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) }, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof json.detail === "string" ? json.detail : "Le serveur a rencontré un problème.";
    throw new Error(detail);
  }
  return json;
}

function Icon({ type, size = 20 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (type === "arrow") return <svg {...common}><path d="M4 12h16m-7-7 7 7-7 7" /></svg>;
  if (type === "pin") return <svg {...common}><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1116 0Z" /><circle cx="12" cy="10" r="2.7" /></svg>;
  if (type === "swap") return <svg {...common}><path d="M7 3v18m0-18-4 4m4-4 4 4M17 21V3m0 18 4-4m-4 4-4-4" /></svg>;
  if (type === "shield") return <svg {...common}><path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-4Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (type === "clock") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 10v6m0-9h.01" /></svg>;
}

function Header({ admin }) {
  return <header className="header"><div className="container header-inner">
    <a href="/" className="brand" aria-label="Voyage RDC, accueil"><span className="brand-mark"><Icon type="pin" size={24} /></span><span>voyage<span className="brand-rdc">rdc</span><small>Explorez sans limites</small></span></a>
    <nav aria-label="Navigation principale"><a className={!admin ? "nav-active" : ""} href="/">Itinéraires</a><a className={admin ? "nav-active" : ""} href="/admin">Administration</a></nav>
    <span className="header-label"><span className="status-dot" /> Service en ligne</span>
  </div></header>;
}

function SearchPage() {
  const [lieux, setLieux] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [modes, setModes] = useState(MODES.map(([m]) => m));
  const [routes, setRoutes] = useState([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState("recherche");
  const [operateurs, setOperateurs] = useState([]);
  const [points, setPoints] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState(null);

  useEffect(() => {
    api("/lieux").then(setLieux).catch(e => setError(`Impossible de charger les villes : ${e.message}`));
  }, []);
  const places = useMemo(() => [...lieux].sort((a, b) => a.nom.localeCompare(b.nom, "fr")), [lieux]);
  async function search(event) {
    event.preventDefault();
    if (!from || !to || from === to) { setError("Choisissez deux villes différentes."); return; }
    if (!modes.length) { setError("Sélectionnez au moins un transport."); return; }
    setLoading(true); setError(""); setSearched(true); setRoutes([]); setPoints(null); setSelectedRoute(null);
    try {
      const params = new URLSearchParams({ depart_id: from, arrivee_id: to, modes: modes.join(",") });
      const data = await api(`/itineraire?${params}`);
      const found = data["itinéraires"] || [];
      setRoutes(found);
      if (found.length && voiceEnabled && typeof window !== "undefined") {
        try {
          if (window.VoyageRDCAndroid?.announce) window.VoyageRDCAndroid.announce("Votre itinéraire est disponible");
          else if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const message = new SpeechSynthesisUtterance("Votre itinéraire est disponible");
            message.lang = "fr-FR"; message.rate = 0.95;
            window.speechSynthesis.speak(message);
          }
        } catch (_) { /* Le message visuel reste disponible si la voix est bloquée. */ }
      }
      setNotice(data.avertissement || "");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function showSection(next) {
    setSection(next); setError("");
    if (next === "operateurs" && !operateurs.length) {
      try { setOperateurs(await api("/operateurs")); } catch (e) { setError(e.message); }
    }
  }
  async function showPoints(id, name) {
    setPoints({ name, loading: true, list: [] });
    try { setPoints({ name, loading: false, list: await api(`/points?lieu_id=${encodeURIComponent(id)}`) }); }
    catch (e) { setPoints({ name, loading: false, list: [], error: e.message }); }
  }
  function toggleMode(mode) { setModes(current => current.includes(mode) ? current.filter(x => x !== mode) : [...current, mode]); }
  const placeById = Object.fromEntries(lieux.map(l => [l.id, l]));
  const roadModes = new Set(["bus", "voiture", "moto"]);
  const easternRoad = modes.some(m => roadModes.has(m)) && (EAST_PROVINCES.has(placeById[from]?.province_id) || EAST_PROVINCES.has(placeById[to]?.province_id) || routes.some(r => r.segments.some(s => roadModes.has(s.mode) && (EAST_PROVINCES.has(placeById[s.depart_id]?.province_id) || EAST_PROVINCES.has(placeById[s.arrivee_id]?.province_id)))));
  const whatsappLink = (kind, route) => {
    const desc = route.segments.map(s => `${s.depart_nom} → ${s.arrivee_nom} (${s.mode})`).join(" ; ");
    const msg = `Bonjour Voyage RDC, je souhaite ${kind} pour le trajet ${desc}. Merci de confirmer la disponibilité, le prix et les modalités officielles.`;
    return `https://wa.me/${CONTACT.slice(1)}?text=${encodeURIComponent(msg)}`;
  };
  const fmtMoney = (n) => n == null ? "À confirmer" : `${Math.round(n).toLocaleString("fr-FR")} $`;
  const fmtDuration = (n) => n == null ? "À confirmer" : n >= 24 ? `${Math.floor(n / 24)} j ${Math.round(n % 24)} h` : `${Math.floor(n)} h ${Math.round((n % 1) * 60)} min`;

  return <><Header admin={false} /><main>
    <section className="hero"><div className="container hero-grid"><div className="hero-copy">
      <div className="eyebrow"><span className="eyebrow-mark">✦</span> LE CONGO À PORTÉE DE MAIN</div>
      <h1>Le meilleur chemin<br />vers <em>votre destination.</em></h1>
      <p>Comparez les trajets en avion, bus, bateau et plus encore. Un seul endroit pour préparer vos déplacements à travers la RDC.</p>
      <div className="hero-benefits"><span><Icon type="shield" size={18} /> Estimations à confirmer</span><span><Icon type="clock" size={18} /> Recherche rapide</span></div>
    </div><div className="hero-art" aria-hidden="true"><span className="art-ring ring-one" /><span className="art-ring ring-two" /><span className="art-line" /><span className="art-pin pin-a"><Icon type="pin" size={22} /></span><span className="art-pin pin-b"><Icon type="pin" size={22} /></span><span className="art-label label-a">DÉPART</span><span className="art-label label-b">ARRIVÉE</span><span className="art-center">RDC<span>↗</span></span></div></div></section>

    <section className="container search-wrap"><div className="search-card">
      <div className="tabs" role="tablist" aria-label="Explorer Voyage RDC"><button type="button" className={section === "recherche" ? "tab active" : "tab"} onClick={() => showSection("recherche")}>↗ Rechercher un trajet</button><button type="button" className={section === "operateurs" ? "tab active" : "tab"} onClick={() => showSection("operateurs")}>▦ Transporteurs</button></div>
      {section === "recherche" ? <form onSubmit={search} className="search-form">
        <div className="field-grid"><label className="field"><span>VILLE DE DÉPART</span><div className="select-wrap"><span className="field-icon"><Icon type="pin" size={18} /></span><select aria-label="Ville de départ" value={from} onChange={e => setFrom(e.target.value)}><option value="">Choisissez une ville</option>{places.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}</select></div></label>
          <button type="button" className="swap-btn" title="Inverser départ et destination" aria-label="Inverser départ et destination" onClick={() => { setFrom(to); setTo(from); }}><Icon type="swap" size={19} /></button>
          <label className="field"><span>VILLE D’ARRIVÉE</span><div className="select-wrap"><span className="field-icon"><Icon type="pin" size={18} /></span><select aria-label="Ville d’arrivée" value={to} onChange={e => setTo(e.target.value)}><option value="">Choisissez une ville</option>{places.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}</select></div></label></div>
        {from && to && from !== to && <div className="selection-indicator" role="status" aria-live="polite"><span>Départ et arrivée sélectionnés. Prêt à rechercher votre itinéraire.</span></div>}
        <div className="modes-head"><strong>Moyens de transport</strong><span>Sélectionnez vos préférences</span></div><div className="mode-row">{MODES.map(([key, icon, name]) => <button type="button" key={key} aria-pressed={modes.includes(key)} className={modes.includes(key) ? "mode selected" : "mode"} onClick={() => toggleMode(key)}><span className="mode-icon">{icon}</span>{name}</button>)}</div>
        <div className="search-bottom"><div className="search-help"><p><Icon type="info" size={16} /> Tarifs confirmés par le gestionnaire de Voyage RDC ; horaires, disponibilité et sécurité à confirmer auprès des transporteurs.</p><label className="voice-choice"><input type="checkbox" checked={voiceEnabled} onChange={e => setVoiceEnabled(e.target.checked)} /> Annonce vocale des résultats</label></div><button className="search-submit" disabled={loading || !lieux.length}>{loading ? <><span className="rdc-spinner rdc-spinner-small" aria-hidden="true" /> Recherche en cours…</> : <>Trouver mon itinéraire <Icon type="arrow" size={19} /></>}</button></div>
      </form> : <div className="operator-panel"><h3>Répertoire des transporteurs</h3><p>Ces opérateurs proviennent des données de départ. Vérifiez directement leurs services et coordonnées.</p>{operateurs.length ? <div className="operator-list">{operateurs.map(o => <div className="operator" key={o.id}><span className="operator-avatar">{(o.nom || "?").slice(0, 1)}</span><div><strong>{o.nom}</strong><small>{o.type || "Transport"}</small></div></div>)}</div> : <p className="empty-operators">Aucun transporteur référencé pour le moment.</p>}</div>}
      <div className="booking-teaser"><strong>Réservation et paiement : assistance disponible</strong><p>Après la recherche, choisissez un trajet pour contacter le service de réservation. Les vols sont réservés et payés exclusivement sur les sites officiels des compagnies. Pour les autres transports, contactez le {CONTACT} ; aucun paiement n'est encaissé dans Voyage RDC.</p></div>
    </div></section>

    {section === "recherche" && <section className="container results-section" aria-live="polite"><div className="section-top"><div><span className="kicker">VOS OPTIONS</span><h2>Itinéraires disponibles</h2></div><span className="result-count">{searched ? `${routes.length} itinéraire${routes.length > 1 ? "s" : ""}` : "Prêt à explorer"}</span></div>
      {error && <div className="message error" role="alert">{error}</div>}
      {!searched && !error && <div className="empty-state"><span className="empty-symbol">⌁</span><h3>Votre prochain voyage commence ici.</h3><p>Choisissez deux villes et les moyens de transport souhaités pour découvrir les itinéraires estimatifs. Leur disponibilité réelle reste à confirmer.</p></div>}
      {loading && <div className="search-progress" role="status" aria-live="polite"><span className="rdc-spinner" aria-hidden="true" /><strong>Recherche de votre itinéraire…</strong><span>Nous consultons les données indicatives entre les villes choisies.</span></div>}
      {searched && !loading && !error && !!routes.length && <div className="route-available" role="status">✓ Votre itinéraire est disponible — disponibilité réelle à confirmer auprès du transporteur.</div>}
      {searched && !loading && !error && !routes.length && <div className="empty-state"><span className="empty-symbol">⌁</span><h3>Aucun itinéraire publié actuellement.</h3><p>Le réseau est en cours de vérification. Essayez d’autres villes ou modes de transport ; aucun trajet non confirmé ne sera proposé.</p></div>}
      {easternRoad && from && to && <div className="message error" role="alert"><strong>⚠ Insécurité — Est de la RDC</strong><p>Certains trajets en bus, voiture ou moto traversent ou rejoignent le Nord-Kivu, le Sud-Kivu ou l’Ituri. Risques de violences, barrages et fermetures soudaines. Ce signalement est préventif, pas une information en temps réel. Vérifiez les avis de sécurité et l’état des routes avant tout départ ; ne considérez jamais cet itinéraire comme sûr sans confirmation récente.</p></div>}
      {routes.map((route, i) => <article key={i} className="route-card"><div className="route-top"><span className="route-ranking">{CRITERE_LABEL[route.critere]}</span>{route.segments.some(s => s.niveau_publication === "hypothese_retour") ? <span className="unverified"><Icon type="info" size={14} /> Sens retour théorique — non confirmé</span> : route.segments.some(s => s.niveau_publication === "indicatif") ? <span className="unverified"><Icon type="info" size={14} /> Estimation non vérifiée</span> : <span className="verified"><Icon type="shield" size={14} /> Source vérifiée</span>}</div><div className="route-main"><div className="route-path"><h3>{places.find(l => l.id === from)?.nom} <span>→</span> {places.find(l => l.id === to)?.nom}</h3><div className="route-modes">{route.segments.map(s => <span key={s.id}>{MODE_LABEL[s.mode] || s.mode}</span>)}</div></div><div className="route-metrics"><div><small>DURÉE ESTIMÉE</small><strong>{fmtDuration(route.duree_h)}</strong></div><div><small>TARIF INDIQUÉ DÈS</small><strong>{fmtMoney(route.prix_min_usd)}</strong></div></div></div><div className="booking-actions" style={{marginTop:16,flexWrap:"wrap"}}>
        {route.segments.some(s => s.niveau_publication === "hypothese_retour") ? <span>Réservation indisponible pour ce trajet retour non confirmé</span> : route.segments.some(s => s.mode === "avion") ? <>
          <button type="button" onClick={() => setSelectedRoute(selectedRoute === i ? null : i)}>✈ Réserver un billet d'avion</button>
          <button type="button" onClick={() => setSelectedRoute(selectedRoute === i ? null : i)}>💳 Payer sur le site de la compagnie</button>
        </> : <>
          <a href={whatsappLink("réserver un billet",route)} rel="noopener noreferrer" className="booking-link">Réserver un billet · WhatsApp</a>
          <a href={whatsappLink("obtenir les instructions de paiement",route)} rel="noopener noreferrer" className="booking-link">Payer · contacter {CONTACT}</a>
        </>}
      </div>
      {selectedRoute === i && route.segments.some(s => s.mode === "avion") && <div className="points-panel"><strong>Compagnies aériennes — réservation et paiement sur leur site officiel</strong><p>Choisissez une compagnie qui dessert effectivement votre destination et confirmez les horaires et tarifs. Voyage RDC n'encaisse aucun paiement.</p>{AIRLINES.map(([name,url]) => <p key={name}><a href={url} rel="noopener noreferrer">{name} ↗</a></p>)}</div>}
      <details className="route-details"><summary>Voir les étapes et informations <span>⌄</span></summary><div className="route-legs">{route.segments.map((s, index) => <div className="leg" key={s.id}><span className="leg-index">{index + 1}</span><div><strong>{s.depart_nom} → {s.arrivee_nom}</strong><p>{MODE_LABEL[s.mode]} · {fmtDuration(s.duree_h)} · {fmtMoney(s.prix_min_usd)}{s.prix_max_usd != null ? ` à ${fmtMoney(s.prix_max_usd)}` : ""}</p><small>{s.niveau_publication === "hypothese_retour" ? "Sens retour théorique non enregistré" : s.niveau_publication === "indicatif" ? "Source initiale non vérifiée" : `Dernière vérification : ${s.verifie_le}`} · {s.source_info || "Transporteur à contacter pour confirmation"}</small><div><button className="text-link" onClick={() => showPoints(s.depart_id, s.depart_nom)} type="button">Points de départ</button> · <button className="text-link" onClick={() => showPoints(s.arrivee_id, s.arrivee_nom)} type="button">Points d’arrivée</button></div></div></div>)}</div>{points && <div className="points-panel"><h4>Points d’embarquement — {points.name}</h4>{points.loading ? <p>Chargement…</p> : points.error ? <p>{points.error}</p> : points.list.length ? points.list.map(p => <p key={p.id}>{p.nom} {p.verifie ? "· Emplacement indiqué comme vérifié" : "· Emplacement à confirmer"} {p.latitude && p.longitude && <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=13/${p.latitude}/${p.longitude}`}>Voir sur la carte ↗</a>}</p>) : <p>Aucun point enregistré pour cette ville.</p>}</div>}</details></article>)}
      {!!routes.length && <div className="disclaimer"><Icon type="info" size={20} /><p>{notice} Les horaires et places ne sont pas disponibles en temps réel. Réservations et paiements : mise en relation uniquement. Tarifs déclarés par le gestionnaire ; disponibilité et montant à confirmer auprès du transporteur.</p></div>}
    </section>}
    <section className="container features"><div className="feature"><span>01</span><div><h3>Plusieurs modes, un seul endroit</h3><p>Comparez routes routières, fluviales, ferroviaires et aériennes.</p></div></div><div className="feature"><span>02</span><div><h3>Une information transparente</h3><p>Les itinéraires estimatifs restent signalés comme non vérifiés. Confirmez votre trajet auprès du transporteur.</p></div></div><div className="feature"><span>03</span><div><h3>Pensé pour la RDC</h3><p>Une interface légère, accessible sur téléphone avec Internet.</p></div></div></section>
  </main><Footer /></>;
}

function AdminPage() {
  const [token, setToken] = useState("");
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [ready, setReady] = useState(false);
  const headers = { Authorization: `Bearer ${token}` };
  async function load(nextOffset = offset) {
    setBusy(true); setMessage("");
    try {
      const [data, stat] = await Promise.all([api(`/admin/liaisons?limit=50&offset=${nextOffset}`, { headers }), api("/admin/statistiques", { headers })]);
      setRows(data); setStats(stat); setOffset(nextOffset); setReady(true); setSelected(null);
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = {
      statut: form.get("statut"), publie: form.get("publie") === "on", verifie_le: form.get("verifie_le") || null,
      source_info: form.get("source_info"), duree_h: form.get("duree_h") ? Number(form.get("duree_h")) : null,
      prix_min_usd: form.get("prix_min_usd") ? Number(form.get("prix_min_usd")) : null,
      prix_max_usd: form.get("prix_max_usd") ? Number(form.get("prix_max_usd")) : null,
    };
    try {
      await api(`/admin/liaisons/${selected.id}`, { method: "PATCH", headers, body: JSON.stringify(body) });
      await load(offset); setMessage("Liaison enregistrée. Les publications sont désormais accessibles sur le site.");
    } catch (e) { setMessage(e.message); setBusy(false); }
  }
  return <><Header admin /><main className="admin-main container"><div className="admin-intro"><span className="kicker">ESPACE SÉCURISÉ</span><h1>Administration des liaisons</h1><p>Contrôlez les sources, les tarifs et la publication des itinéraires. Les modifications sont immédiatement visibles en ligne.</p></div><div className="admin-login"><label>Jeton administrateur <input aria-label="Jeton administrateur" type="password" autoComplete="off" value={token} onChange={e => { setToken(e.target.value); setReady(false); }} placeholder="Saisissez votre jeton" /></label><button type="button" onClick={() => load(0)} disabled={!token || busy}>Connexion</button></div>
    {message && <div role="status" className="message">{message}</div>}
    {ready && <><div className="stats">{[["Liaisons importées", stats?.total], ["Publiées", stats?.publiees], ["À vérifier", stats?.a_verifier]].map(([name, value]) => <div key={name}><small>{name}</small><strong>{value ?? 0}</strong></div>)}</div><div className="admin-columns"><div className="admin-list"><h2>Liaisons <small>(50 par page)</small></h2>{rows.map(r => <button key={r.id} type="button" onClick={() => setSelected(r)} className={selected?.id === r.id ? "admin-row active" : "admin-row"}><span>{r.depart_nom} → {r.arrivee_nom}<small>{MODE_LABEL[r.mode]} · {r.statut}</small></span><span className={r.publie ? "pill published" : "pill"}>{r.publie ? "Publiée" : "Masquée"}</span></button>)}<div className="pager"><button type="button" disabled={offset === 0 || busy} onClick={() => load(Math.max(0, offset - 50))}>← Précédent</button><button type="button" disabled={rows.length < 50 || busy} onClick={() => load(offset + 50)}>Suivant →</button></div></div><div className="admin-edit">{selected ? <form onSubmit={save} key={selected.id}><h2>Modifier une liaison</h2><p><strong>{selected.depart_nom} → {selected.arrivee_nom}</strong><br />{MODE_LABEL[selected.mode]}</p><label>Statut<select name="statut" defaultValue={selected.statut}><option value="a_verifier">À vérifier</option><option value="ok">OK</option><option value="suspendu">Suspendu</option></select></label><label>Source vérifiée (référence / contact)<textarea name="source_info" required={false} defaultValue={selected.source_info || ""} placeholder="Ex. transporteur, personne contactée, canal" /></label><label>Date de vérification<input type="date" name="verifie_le" defaultValue={selected.verifie_le || ""} /></label><div className="form-grid"><label>Durée (heures)<input name="duree_h" type="number" min="0.1" step="0.1" defaultValue={selected.duree_h ?? ""} /></label><label>Prix min (USD)<input name="prix_min_usd" type="number" min="0" step="0.01" defaultValue={selected.prix_min_usd ?? ""} /></label><label>Prix max (USD)<input name="prix_max_usd" type="number" min="0" step="0.01" defaultValue={selected.prix_max_usd ?? ""} /></label></div><label className="checkbox-line"><input type="checkbox" name="publie" defaultChecked={Boolean(selected.publie)} /> Publier cette liaison pour les voyageurs</label><p className="small-note">Publication possible uniquement avec statut OK, source et date de vérification renseignées.</p><button className="search-submit" disabled={busy} type="submit">{busy ? "Enregistrement…" : "Enregistrer"}</button></form> : <div className="admin-placeholder">← Sélectionnez une liaison pour contrôler ses informations et décider de sa publication.</div>}</div></div></>}
  </main><Footer /></>;
}

function Footer() { return <footer className="footer"><div className="container footer-inner"><div><strong>voyage<span>rdc</span></strong><p>Le Congo est vaste. Vos possibilités aussi.</p></div><p>© {new Date().getFullYear()} Voyage RDC · Service d’information gratuit, uniquement en ligne.</p></div></footer>; }
export default function App() { return window.location.pathname.startsWith("/admin") ? <AdminPage /> : <SearchPage />; }
