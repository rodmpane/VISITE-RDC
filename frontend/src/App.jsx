import ProviderAdmin from "./ProviderAdmin";
import AdminGate from "./AdminGate";
import AccountAdmin from "./AccountAdmin";
import BookingAdmin from "./BookingAdmin";
import CatalogueAdmin from "./CatalogueAdmin";
import RouteAdmin from "./RouteAdmin";
import { AboutPage, ContactPage } from "./InfoPages";
import PrivacyPage from "./PrivacyPage";
import AccountPage, { saveTravelerTrip, getTravelerToken } from "./AccountPage";
import BookingReceipt from "./BookingReceipt";
import { HOTELS } from "./hotels";
import { AIR_CARRIERS } from "./airCarriers";
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
const CONTACT = "+243830033332";
const EAST_PROVINCES = new Set(["nord-kivu", "sud-kivu", "ituri", "haut-uele", "bas-uele", "maniema", "tanganyika", "tshopo"]);
const CRITERE_LABEL = { rapide: "Le plus rapide", economique: "Le plus économique", court: "Le plus court", alternative: "Autre itinéraire avec correspondance" };

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { ...opts, headers: { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) }, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof json.detail === "string" ? json.detail : Array.isArray(json.detail) ? json.detail.map(d=>`${(d.loc||[]).slice(-1).join("")}: ${d.msg}`).join(" ; ") : "Le serveur a rencontré un problème.";
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

// Match only the declared direction. A reverse flight is not evidence of service.
const PLACE_ALIASES = { "bandundu-ville": "bandundu", "mahagi (frontière ouganda)": "mahagi", "moanda": "moanda" };
function placeKey(value) {
  const key = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return PLACE_ALIASES[key] || key;
}
function transportOptions(segment) {
  if (segment.niveau_publication === "hypothese_retour") return [];
  if (segment.mode === "avion") {
    const listed = AIR_CARRIERS.filter(carrier => carrier.routes?.some(([from, to]) =>
      placeKey(from) === placeKey(segment.depart_id) && placeKey(to) === placeKey(segment.arrivee_id)));
    // Older seed records identify operators without a detailed route declaration.
    // Do not present these as confirmed or currently available flights.
    const named = AIR_CARRIERS.filter(carrier => !listed.includes(carrier) &&
      (segment.operateur || "").toLowerCase().split(/\s*\/\s*/).some(part =>
        part.trim() === carrier.name.toLowerCase() ||
        (carrier.name === "CAA" && part.includes("compagnie africaine d'aviation"))));
    return [...listed.map(carrier => ({ carrier, source: "Liaison déclarée — à confirmer" })),
      ...named.map(carrier => ({ carrier, source: "Mentionné dans les données initiales — à confirmer" }))];
  }
  return [];
}
function SegmentOperators({ segment }) {
  const options = transportOptions(segment);
  return <div className="points-panel" style={{marginTop:10}}>
    <strong>{segment.mode === "avion" ? "✈ Compagnies pour cette étape" : "Transporteurs pour cette étape"}</strong>
    {options.length ? <><p>Compagnies référencées pour ce trajet, sans garantie de vol ni de place. Vérifiez directement les départs et les prix.</p>
      {options.map(({carrier,source}) => <div key={carrier.name} style={{padding:"9px 0",borderBottom:"1px solid #ddd"}}>
        <strong>{carrier.name}</strong><p><small>{source}</small></p>
        {carrier.phones?.map(([label,number],i) => <p key={i}>{label} : <a href={"tel:"+number}>{number}</a></p>)}
        {carrier.website && <p><a href={carrier.website} target="_blank" rel="noopener noreferrer">Consulter la compagnie ↗</a></p>}
        {carrier.emails?.map(email => <p key={email}><a href={"mailto:"+email}>{email}</a></p>)}
        {carrier.schedule?.filter(([,route]) => {
          const parts = route.split("→").map(placeKey);
          return parts.length === 2 && parts[0] === placeKey(segment.depart_id) && parts[1] === placeKey(segment.arrivee_id);
        }).map(([days,,hours],i) => <p key={i}><small>Horaire communiqué : {days}, {hours} — à confirmer</small></p>)}
      </div>)}</> : <p>{segment.mode === "avion"
      ? "Aucune compagnie identifiée pour ce sens dans notre répertoire. Le vol reste à confirmer."
      : segment.operateur && !/^(transporteur|compagnie|à confirmer)/i.test(segment.operateur)
        ? <>Opérateur indiqué dans les données : <strong>{segment.operateur}</strong>. Service, coordonnées et disponibilité à confirmer.</>
        : "Aucun transporteur précis enregistré pour cette étape. Nous ajouterons les compagnies de bus, véhicules, trains et bateaux progressivement."}</p>}
  </div>;
}

function Header({ admin }) {
  const [isAdmin,setIsAdmin]=useState(false);
  useEffect(()=>{const token=getTravelerToken();if(!token)return;fetch("/api/compte/moi",{headers:{Authorization:"Bearer "+token}}).then(r=>r.ok?r.json():null).then(u=>setIsAdmin(u?.role==="admin")).catch(()=>{});},[]);
  return <header className="header"><div className="container header-inner">
    <a href="/" className="brand" aria-label="Voyage RDC, accueil"><img src="/voyage-rdc-logo.svg" alt="Voyage RDC — Itinéraires partout en RDC" className="brand-logo" /></a>
    <nav aria-label="Navigation principale"><a className={!admin ? "nav-active" : ""} href="/">Itinéraires</a><a href="/compte" className="main-account-profile-link"><span className="main-account-avatar" aria-hidden="true">👤</span> Mon compte</a>{isAdmin && <a className={admin ? "nav-active" : ""} href="/admin">Administration</a>}</nav>
    <span className="header-label"><span className="status-dot" /> Service en ligne</span>
  </div></header>;
}

function JourneyBooking({ route, destination, hotel, onBack, traveler, onBooked }) {
  const [formError,setFormError]=useState("");
  const [busy,setBusy]=useState(false);
  const [receipt,setReceipt]=useState(null);
  const [showDocument,setShowDocument]=useState(false);
  const [arrival,setArrival]=useState("");
  const [departure,setDeparture]=useState("");
  const [payment,setPayment]=useState("sur_place");
  const [price,setPrice]=useState("");
  const [emailWanted,setEmailWanted]=useState(false);
  const isHotel=!!hotel;
  const itinerary=route.segments.map(s=>s.depart_nom+" → "+s.arrivee_nom+" ("+(MODE_LABEL[s.mode]||s.mode)+")").join(" · ");
  const operators=route.segments.map(s=> {
    const listed=transportOptions(s);
    const direct=(s.operateur||"").trim();
    if(direct && !/^(transporteur|compagnie|à confirmer|non renseigné|inconnu)/i.test(direct)) return direct;
    return listed.length===1 ? listed[0].carrier.name : "";
  }).filter(Boolean);
  const candidates=[...new Set(route.segments.flatMap(s=>transportOptions(s).map(o=>o.carrier.name)).concat(operators))].filter(n=>n && n!=="Congo Airways");
  const [chosenProvider,setChosenProvider]=useState("");
  const provider=isHotel ? hotel.name : chosenProvider;
  const nights=arrival && departure && departure>arrival ? Math.round((new Date(departure+"T00:00:00")-new Date(arrival+"T00:00:00"))/86400000) : 0;
  async function submit(e) {
    e.preventDefault();if(!provider){setFormError("Choisissez une compagnie.");return;}setBusy(true);setFormError("");
    const f=new FormData(e.currentTarget);
    const body={type:isHotel?"hebergement":"transport",prestataire:f.get("prestataire"),ville:destination,
      date_debut:f.get("date_debut"),date_fin:isHotel?f.get("date_fin"):null,voyageurs:Number(f.get("voyageurs")),
      nom:f.get("nom"),postnom:f.get("postnom"),prenom:f.get("prenom"),lieu_naissance:f.get("lieu_naissance"),
      date_naissance:f.get("date_naissance"),telephone:f.get("telephone"),email:f.get("email")||"",
      numero_identite:f.get("numero_identite")||"",itineraire:itinerary,
      prix_unitaire:f.get("prix_unitaire")?Number(f.get("prix_unitaire")):null,
      devise:f.get("devise")||"USD",modalite:f.get("modalite")||"",
      paiement_methode:payment,details:f.get("details")||""};
    try {
      const token=getTravelerToken();
      const result=await api("/compte/reservations/invite",{method:"POST",headers:token?{Authorization:"Bearer "+token}:{},body:JSON.stringify(body)});
      setReceipt(result);setShowDocument(true);onBooked?.();
    }catch(err){setFormError(err.message);}
    finally{setBusy(false);}
  }
  if(receipt)return <div className="journey-booking-form"><h3>Demande enregistrée</h3><p><strong>Référence : {receipt.reference}</strong></p><p>{receipt.message}</p><p>Votre récépissé est disponible ci-dessous. Il ne constitue pas une réservation confirmée ni une preuve de paiement.</p>{emailWanted && <p>L'envoi automatique par e-mail n'est pas encore activé. Téléchargez votre document pour le conserver.</p>}<div className="booking-actions"><button type="button" onClick={()=>setShowDocument(true)}>Voir / Télécharger le PDF</button><button type="button" onClick={()=>{setReceipt(null);setShowDocument(false);}}>Nouvelle demande</button></div>{showDocument && <BookingReceipt booking={receipt} traveler={receipt.reservation_infos||{}} onClose={()=>setShowDocument(false)}/>}</div>;
  return <div className="journey-booking-form"><h3>3. Informations de réservation {isHotel?"— hôtel":"— transport"}</h3>
    <p>{traveler ? "Demande depuis votre compte : vérifiez vos informations avant de continuer." : "Réservation libre, avec ou sans compte. Les informations ci-dessous servent uniquement à transmettre une demande au prestataire."}</p>
    <p><strong>Itinéraire :</strong> {itinerary}</p>
    {isHotel && <p><strong>Hôtel :</strong> {hotel.name} · {hotel.address || destination}</p>}{!isHotel && <p><strong>Compagnie :</strong> {provider || "À sélectionner"}</p>}
    <form onSubmit={submit}>
      <div className="journey-form-grid">
        <label>Nom *<input defaultValue={traveler?.nom || ""} name="nom" required maxLength={120}/></label>
        <label>Postnom *<input defaultValue={traveler?.postnom || ""} name="postnom" required maxLength={120}/></label>
        <label>Prénom *<input defaultValue={traveler?.prenom || ""} name="prenom" required maxLength={120}/></label>
        <label>Lieu de naissance *<input defaultValue={traveler?.lieu_naissance || ""} name="lieu_naissance" required maxLength={150}/></label>
        <label>Date de naissance *<input defaultValue={traveler?.date_naissance || ""} name="date_naissance" type="date" required max={new Date().toISOString().slice(0,10)}/></label>
        <label>Téléphone *<input defaultValue={traveler?.telephone || ""} name="telephone" type="tel" required maxLength={35}/></label>
        <label>E-mail (facultatif)<input defaultValue={traveler?.email || ""} name="email" type="email" maxLength={254}/></label>
        <label>Numéro de pièce d'identité (facultatif)<input name="numero_identite" maxLength={100}/></label>
        <label>{isHotel?"Établissement":"Compagnie / transporteur (issu de l'itinéraire)"} *{isHotel ? <input name="prestataire" value={provider} readOnly required/> : <select name="prestataire" required value={provider} onChange={e=>setChosenProvider(e.target.value)}><option value="">Choisir une compagnie</option>{candidates.map(n=><option key={n} value={n}>{n}</option>)}</select>}</label>
        <label>{isHotel?"Date d'arrivée":"Date de départ"} *<input name="date_debut" type="date" required min={new Date().toISOString().slice(0,10)} value={arrival} onChange={e=>setArrival(e.target.value)}/></label>
        {isHotel && <label>Date de départ de l'hôtel *<input name="date_fin" type="date" required min={arrival||new Date().toISOString().slice(0,10)} value={departure} onChange={e=>setDeparture(e.target.value)}/></label>}
        <label>Nombre de voyageurs *<input name="voyageurs" type="number" min="1" max="20" defaultValue="1" required/></label>
        <label>{isHotel?"Prix communiqué par nuit":"Prix communiqué par billet"} (facultatif)<input name="prix_unitaire" type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="À confirmer"/></label>
        <label>Devise<select name="devise"><option value="USD">USD</option><option value="CDF">CDF</option></select></label>
        {isHotel && <label>Modalités communiquées par l'hôtel<input name="modalite" maxLength={120} placeholder="À confirmer"/></label>}
      </div>
      {isHotel && <p><strong>Durée du séjour : {nights||"—"} nuit(s)</strong>{price && nights ? " · Total estimé : "+(nights*Number(price)).toLocaleString("fr-FR")+" (devise sélectionnée)" : ""}</p>}
      <label>Informations complémentaires<textarea name="details" maxLength={500}/></label>
      <h4>4. Mode de paiement souhaité</h4>
      <p><strong>Paiement directement auprès du prestataire</strong></p><p>Voyage RDC ne perçoit aucun paiement. Le lien de paiement propre à votre réservation sera disponible après confirmation par la compagnie. Aucun paiement ni billet ne peut être confirmé automatiquement tant que son intégration API n’est pas active.</p>
      <label><input type="checkbox" checked={emailWanted} onChange={e=>setEmailWanted(e.target.checked)}/> Je souhaite recevoir mon document par e-mail lorsqu'un service d'envoi sera disponible.</label>
      <p><small>Le PDF est disponible immédiatement après l'enregistrement. L'envoi automatique par e-mail n'est pas encore opérationnel.</small></p>
      {formError && <p role="alert" className="message error">{formError}</p>}
      <div className="booking-actions"><button type="submit" disabled={busy}>{busy?"Enregistrement…":"5. Valider ma demande et voir le PDF"}</button><button type="button" onClick={onBack}>Retour au choix de l'hôtel</button></div>
    </form>
  </div>;
}


const VEHICLE_ART = [
  {name:"Avion", body:<><path d="M9 37 61 23 89 7 99 10 85 28 113 26 127 33 129 39 81 44 63 69 54 71 57 45 25 49 13 59 6 58 10 43 3 42Z" fill="currentColor"/><path d="M62 23 85 28 99 10" fill="none" stroke="#d9e9ff" strokeWidth="2"/><path d="M57 45 81 44" stroke="#d9e9ff" strokeWidth="2"/></>},
  {name:"Bateau",body:<><path d="M13 45H127L109 63H35Z" fill="currentColor"/><path d="M32 31H100V45H32Z" fill="#d9e9ff"/><path d="M44 18H86V31H44Z" fill="currentColor"/><path d="M66 8V18M25 69q11-6 22 0t22 0t22 0t22 0" stroke="#73c9f6" strokeWidth="3" fill="none"/><path d="M49 34h10m9 0h10m9 0h8" stroke="#174581" strokeWidth="4"/></>},
  {name:"Bus",body:<><rect x="14" y="17" width="112" height="45" rx="9" fill="currentColor"/><path d="M22 25h71v22H22Z" fill="#d9e9ff"/><path d="M98 25h18v22H98Z" fill="#8fc6f0"/><path d="M45 25v22m24-22v22" stroke="#174581" strokeWidth="3"/><circle cx="38" cy="62" r="9" fill="#102c55"/><circle cx="105" cy="62" r="9" fill="#102c55"/><circle cx="38" cy="62" r="4" fill="#d9e9ff"/><circle cx="105" cy="62" r="4" fill="#d9e9ff"/></>},
  {name:"Voiture",body:<><path d="M16 40 29 37 43 21H95L111 38 123 42V60H13V47Z" fill="currentColor"/><path d="M48 26H69V39H36Zm27 0h17l12 13H75Z" fill="#d9e9ff"/><circle cx="39" cy="61" r="10" fill="#102c55"/><circle cx="103" cy="61" r="10" fill="#102c55"/><circle cx="39" cy="61" r="4" fill="#d9e9ff"/><circle cx="103" cy="61" r="4" fill="#d9e9ff"/><path d="M14 47h10m89 0h10" stroke="#f9b82f" strokeWidth="4"/></>},
  {name:"Moto",body:<><circle cx="30" cy="59" r="16" stroke="currentColor" strokeWidth="5" fill="none"/><circle cx="108" cy="59" r="16" stroke="currentColor" strokeWidth="5" fill="none"/><path d="M30 59 55 31 75 59H30L51 43M75 59 97 35 108 59M92 32h14M52 31h17M67 26l-10-7" stroke="#d9e9ff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><path d="M60 19h20l10 15H69Z" fill="currentColor"/></>},
  {name:"Train",body:<><rect x="26" y="7" width="88" height="58" rx="14" fill="currentColor"/><rect x="35" y="18" width="31" height="23" rx="4" fill="#d9e9ff"/><rect x="74" y="18" width="31" height="23" rx="4" fill="#d9e9ff"/><circle cx="44" cy="52" r="5" fill="#f9b82f"/><circle cx="96" cy="52" r="5" fill="#f9b82f"/><path d="m42 65-10 9m66-9 10 9M42 70h56" stroke="#d9e9ff" strokeWidth="4" strokeLinecap="round"/></>}
];
function TransportIllustration({index}) {
  return <svg className="art-vehicle-svg" viewBox="0 0 140 80" role="img" aria-label={VEHICLE_ART[index].name} xmlns="http://www.w3.org/2000/svg">{VEHICLE_ART[index].body}</svg>;
}

function SearchPage({ embedded = false, traveler = null, onSaved, onBooked, onTrips } = {}) {
  const [lieux, setLieux] = useState([]);
  const [catalogueHotels,setCatalogueHotels] = useState([]);
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
  const [carrierFilter, setCarrierFilter] = useState("");
  const [points, setPoints] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [chosenJourney, setChosenJourney] = useState(null);
  const [showHotels, setShowHotels] = useState(false);
  const [bookingStep,setBookingStep]=useState(false);
  const [selectedHotel,setSelectedHotel]=useState(null);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    api("/lieux").then(setLieux).catch(e => setError(`Impossible de charger les villes : ${e.message}`));
    api("/catalogue?categorie=hotel").then(rows=>setCatalogueHotels(rows.map(h=>({id:h.id,cityId:h.ville_id,name:h.nom,address:h.adresse,priceFrom:h.tarif,currency:h.devise,phone:h.telephone,email:h.email,website:h.site_web,cityPhotos:h.photo_url?[h.photo_url]:[],roomPhotos:[],verifiedAt:h.date_verification})))).catch(()=>{});
  }, []);
  const places = useMemo(() => [...lieux].sort((a, b) => a.nom.localeCompare(b.nom, "fr")), [lieux]);
  async function search(event) {
    event.preventDefault();
    if (!from || !to || from === to) { setError("Choisissez deux villes différentes."); return; }
    if (!modes.length) { setError("Sélectionnez au moins un transport."); return; }
    const loadingStartedAt = Date.now();
    setLoading(true); setError(""); setSearched(true); setRoutes([]); setPoints(null); setSelectedRoute(null); setChosenJourney(null); setShowHotels(false);setBookingStep(false);setSelectedHotel(null);
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
    finally {
      // Keep the full-screen loading animation visible even for instant API responses.
      const remaining = Math.max(0, 1100 - (Date.now() - loadingStartedAt));
      if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
      setLoading(false);
    }
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
  const chosen = chosenJourney == null ? null : routes[chosenJourney];
  const hotelCity = placeById[to]?.nom || "votre destination";
  const localHotels = [...HOTELS.filter(h => h.cityId === to), ...catalogueHotels.filter(h => h.cityId === to)];
  const journeyIsUnconfirmed = chosen?.segments.some(s => ["a_verifier", "hypothese_retour"].includes(s.niveau_publication));
  const contactJourney = chosen ? whatsappLink("obtenir les contacts et les conditions de réservation", chosen) : "";
  const fmtMoney = (n) => n == null ? "À confirmer" : `${Math.round(n).toLocaleString("fr-FR")} $`;
  const fmtDuration = (n) => n == null ? "À confirmer" : n >= 24 ? `${Math.floor(n / 24)} j ${Math.round(n % 24)} h` : `${Math.floor(n)} h ${Math.round((n % 1) * 60)} min`;

  return <>{!embedded && <Header admin={false} />}<main className={embedded ? "account-search-embedded" : undefined}>
    {!embedded && <section className="hero"><div className="container hero-grid"><div className="hero-copy">
      <div className="eyebrow"><span className="eyebrow-mark">✦</span> LE CONGO À PORTÉE DE MAIN</div>
      <h1>Le meilleur chemin<br />vers <em>votre destination.</em></h1>
      <p>Comparez les trajets en avion, bus, bateau et plus encore. Un seul endroit pour préparer vos déplacements à travers la RDC.</p>
      <div className="hero-benefits"><span><Icon type="shield" size={18} /> Estimations à confirmer</span><span><Icon type="clock" size={18} /> Recherche rapide</span></div>
    </div><div className="hero-art" aria-hidden="true"><span className="art-ring ring-one" /><span className="art-ring ring-two" /><span className="art-line" /><span className="art-pin pin-a"><Icon type="pin" size={22} /></span><span className="art-pin pin-b"><Icon type="pin" size={22} /></span><span className="art-label label-a">DÉPART</span><span className="art-label label-b">ARRIVÉE</span><span className="art-center">RDC<span>↗</span></span><span className="art-traffic" aria-hidden="true">{VEHICLE_ART.map((vehicle,i)=><span className={"art-vehicle art-vehicle-"+i} key={vehicle.name}><TransportIllustration index={i}/><span className="art-vehicle-label">{vehicle.name}</span></span>)}</span></div></div></section>}

    <section className="container search-wrap"><div className="search-card">
      <div className="tabs" role="tablist" aria-label="Explorer Voyage RDC"><button type="button" className={section === "recherche" ? "tab active" : "tab"} onClick={() => showSection("recherche")}>↗ Rechercher un trajet</button><button type="button" className={section === "operateurs" ? "tab active" : "tab"} onClick={() => showSection("operateurs")}>▦ Transporteurs</button></div>
      {section === "recherche" ? <form onSubmit={search} className="search-form">
        <div className="field-grid"><label className="field"><span>VILLE DE DÉPART</span><div className="select-wrap"><span className="field-icon"><Icon type="pin" size={18} /></span><select aria-label="Ville de départ" value={from} onChange={e => setFrom(e.target.value)}><option value="">Choisissez une ville</option>{places.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}</select></div></label>
          <button type="button" className="swap-btn" title="Inverser départ et destination" aria-label="Inverser départ et destination" onClick={() => { setFrom(to); setTo(from); }}><Icon type="swap" size={19} /></button>
          <label className="field"><span>VILLE D’ARRIVÉE</span><div className="select-wrap"><span className="field-icon"><Icon type="pin" size={18} /></span><select aria-label="Ville d’arrivée" value={to} onChange={e => setTo(e.target.value)}><option value="">Choisissez une ville</option>{places.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}</select></div></label></div>
        {from && to && from !== to && <div className="selection-indicator" role="status" aria-live="polite"><span>Départ et arrivée sélectionnés. Prêt à rechercher votre itinéraire.</span></div>}
        <div className="modes-head"><strong>Moyens de transport</strong><span>Sélectionnez vos préférences</span></div><div className="mode-row">{MODES.map(([key, icon, name]) => <button type="button" key={key} aria-pressed={modes.includes(key)} className={modes.includes(key) ? "mode selected" : "mode"} onClick={() => toggleMode(key)}><span className="mode-icon">{icon}</span>{name}</button>)}</div>
        <div className="search-bottom"><div className="search-help"><p><Icon type="info" size={16} /> Tarifs confirmés par le gestionnaire de Voyage RDC ; horaires, disponibilité et sécurité à confirmer auprès des transporteurs.</p><label className="voice-choice"><input type="checkbox" checked={voiceEnabled} onChange={e => setVoiceEnabled(e.target.checked)} /> Annonce vocale des résultats</label></div><button className="search-submit" disabled={loading || !lieux.length}>{loading ? <><span className="rdc-spinner rdc-spinner-small" aria-hidden="true" /> Recherche en cours…</> : <>Trouver mon itinéraire <Icon type="arrow" size={19} /></>}</button></div>
      </form> : <div className="operator-panel"><h3>Compagnies aériennes en RDC ({AIR_CARRIERS.length})</h3><p>Répertoire informatif : existence des vols, horaires, activité et tarifs à confirmer auprès des compagnies. Aucun paiement encaissé ici.</p><label>Rechercher une compagnie <input type="search" value={carrierFilter} onChange={e => setCarrierFilter(e.target.value)} placeholder="Nom de la compagnie" style={{display:"block",width:"100%",padding:12,marginTop:8,marginBottom:14}} /></label><div className="operator-list">{AIR_CARRIERS.filter(a => a.name.toLowerCase().includes(carrierFilter.toLowerCase())).map(a => <details key={a.name} className="route-details" style={{padding:12}}><summary><strong>✈ {a.name}</strong> <span>⌄</span></summary><div style={{paddingTop:12}}><p><small>{a.status}</small></p>{a.address && <p><strong>Adresse :</strong> {a.address}</p>}{a.phones?.map(([kind,num],i) => <p key={i}><strong>{kind} :</strong> <a href={"tel:"+num}>{num}</a></p>)}{a.emails?.map(email => <p key={email}><a href={"mailto:"+email}>{email}</a></p>)}{a.website && <p><a href={a.website} target="_blank" rel="noopener noreferrer">Site de la compagnie ↗</a></p>}{a.hours && <p><strong>Horaires du bureau :</strong> {a.hours}</p>}{a.payments && <p><strong>Moyens de paiement déclarés :</strong> {a.payments.join(", ")} — paiement uniquement via la compagnie</p>}{a.routes && <><strong>Liaisons déclarées (non confirmées) :</strong><ul>{a.routes.map(([from,to],i) => <li key={i}>{from} → {to}</li>)}</ul></>}{a.schedule && <><strong>Horaires de vol communiqués :</strong><ul>{a.schedule.map(([days,route,time],i) => <li key={i}>{days} : {route} · {time}</li>)}</ul></>}{a.note && <p><small>{a.note}</small></p>}</div></details>)}</div><h3 style={{marginTop:24}}>Autres transporteurs référencés</h3><p>Ces opérateurs proviennent des données de départ. Vérifiez directement leurs services et coordonnées.</p>{operateurs.length ? <div className="operator-list">{operateurs.map(o => <div className="operator" key={o.id}><span className="operator-avatar">{(o.nom || "?").slice(0, 1)}</span><div><strong>{o.nom}</strong><small>{o.type || "Transport"}</small></div></div>)}</div> : <p className="empty-operators">Aucun transporteur référencé pour le moment.</p>}</div>}
      <div className="booking-teaser"><strong>Réservation et paiement : assistance disponible</strong><p>Après la recherche, choisissez un trajet pour contacter le service de réservation. Les vols sont réservés et payés exclusivement sur les sites officiels des compagnies. Pour les autres transports, contactez le {CONTACT} ; aucun paiement n'est encaissé dans Voyage RDC.</p></div>
    </div></section>

    {section === "recherche" && <section className="container results-section" aria-live="polite"><div className="section-top"><div><span className="kicker">VOS OPTIONS</span><h2>Itinéraires disponibles</h2></div><span className="result-count">{searched ? `${routes.length} itinéraire${routes.length > 1 ? "s" : ""}` : "Prêt à explorer"}</span></div>
      {error && <div className="message error" role="alert">{error}</div>}
      {!searched && !error && <div className="empty-state"><span className="empty-symbol">⌁</span><h3>Votre prochain voyage commence ici.</h3><p>Choisissez deux villes et les moyens de transport souhaités pour découvrir les itinéraires estimatifs. Leur disponibilité réelle reste à confirmer.</p></div>}
      {loading && <div className="search-loading-overlay" role="status" aria-live="polite" aria-label="Recherche d’itinéraire en cours"><div className="search-progress"><span className="rdc-spinner" aria-hidden="true" /><strong>Recherche de votre itinéraire…</strong><span>Analyse des correspondances, des transports et des tarifs renseignés.</span><small>Veuillez patienter pendant la consultation du réseau Voyage RDC.</small></div></div>}
      {searched && !loading && !error && !!routes.length && <div className="route-available" role="status"><strong>✓ {routes.length} proposition{routes.length > 1 ? "s" : ""} d’itinéraire{routes.length > 1 ? "s" : ""} trouvée{routes.length > 1 ? "s" : ""}</strong><span>Comparez les étapes et choisissez votre trajet. Les départs et tarifs restent à confirmer auprès du transporteur.</span></div>}
      {searched && !loading && !error && !routes.length && <div className="empty-state"><span className="empty-symbol">⌁</span><h3>Aucun itinéraire enregistré pour cette combinaison.</h3><p>Le réseau est en cours de complément. Essayez d’autres villes ou modes de transport ; aucune liaison ne sera inventée.</p></div>}
      {easternRoad && from && to && <div className="message error" role="alert"><strong>⚠ Insécurité — Est de la RDC</strong><p>Certains trajets en bus, voiture ou moto traversent ou rejoignent les provinces de l’Est et du Nord-Est de la RDC. Risques de violences, barrages et fermetures soudaines. Ce signalement est préventif, pas une information en temps réel. Vérifiez les avis de sécurité et l’état des routes avant tout départ ; ne considérez jamais cet itinéraire comme sûr sans confirmation récente.</p></div>}
      {saveMessage && <p role="status" className="message">{saveMessage} {embedded ? <button type="button" onClick={onTrips}>Voir mes voyages</button> : <a href="/compte">Voir mes voyages</a>}</p>}
      {routes.map((route, i) => <article key={i} className="route-card"><div className="save-trip-bar"><button type="button" onClick={async () => { try { if (!getTravelerToken()) { window.location.href = "/compte"; return; } await saveTravelerTrip(placeById[from]?.nom || from, placeById[to]?.nom || to, modes.join(",")); setSaveMessage("Itinéraire enregistré dans votre compte."); onSaved?.(); } catch (e) { setSaveMessage(e.message); } }}>☆ Enregistrer dans mon compte</button></div><div className="route-top"><span className="route-ranking">{CRITERE_LABEL[route.critere]}</span>{route.segments.some(s => s.niveau_publication === "hypothese_retour") ? <span className="unverified"><Icon type="info" size={14} /> Sens retour théorique — non confirmé</span> : route.segments.some(s => s.niveau_publication === "a_verifier") ? <span className="unverified"><Icon type="info" size={14} /> Liaison à vérifier — non confirmée</span> : route.segments.some(s => s.niveau_publication === "indicatif") ? <span className="unverified"><Icon type="info" size={14} /> Estimation non vérifiée</span> : <span className="verified"><Icon type="shield" size={14} /> Source vérifiée</span>}</div><div className="route-main"><div className="route-path"><h3>{places.find(l => l.id === from)?.nom} <span>→</span> {places.find(l => l.id === to)?.nom}</h3><div className="route-modes">{route.segments.map(s => <span key={s.id}>{MODE_LABEL[s.mode] || s.mode}</span>)}</div></div><div className="route-metrics"><div><small>DURÉE ESTIMÉE</small><strong>{fmtDuration(route.duree_h)}</strong></div><div><small>TARIF INDIQUÉ DÈS</small><strong>{fmtMoney(route.prix_min_usd)}</strong></div></div></div><div className="booking-actions" style={{marginTop:16,flexWrap:"wrap"}}><button type="button" aria-pressed={chosenJourney === i} onClick={() => {setChosenJourney(i);setShowHotels(false);setSelectedRoute(null);setBookingStep(false);setSelectedHotel(null);}}>{chosenJourney === i ? "✓ Itinéraire sélectionné" : "Choisir cet itinéraire →"}</button>
        {route.segments.some(s => ["hypothese_retour", "a_verifier"].includes(s.niveau_publication)) ? <span>Réservation indisponible : au moins une correspondance n’est pas confirmée</span> : route.segments.some(s => s.mode === "avion") ? <>
          <button type="button" onClick={() => setSelectedRoute(selectedRoute === i ? null : i)}>✈ Réserver un billet d'avion</button>
          <button type="button" onClick={() => setSelectedRoute(selectedRoute === i ? null : i)}>💳 Payer sur le site de la compagnie</button>
        </> : <>
          <a href={whatsappLink("réserver un billet",route)} rel="noopener noreferrer" className="booking-link">Réserver un billet · WhatsApp</a>
          <a href={whatsappLink("obtenir les instructions de paiement",route)} rel="noopener noreferrer" className="booking-link">Payer · contacter {CONTACT}</a>
        </>}
      </div>
      {selectedRoute === i && route.segments.some(s => s.mode === "avion") && <div className="points-panel"><strong>Compagnies aériennes — réservation et paiement sur leur site officiel</strong><p>Choisissez une compagnie qui dessert effectivement votre destination et confirmez les horaires et tarifs. Voyage RDC n'encaisse aucun paiement.</p>{AIRLINES.map(([name,url]) => <p key={name}><a href={url} rel="noopener noreferrer">{name} ↗</a></p>)}</div>}
      {chosenJourney === i && <div className="points-panel" style={{marginTop:14}} role="region" aria-label="Parcours de réservation">
        <strong>1. Votre itinéraire est sélectionné</strong>
        <p>{route.segments.map(s => s.depart_nom+" → "+s.arrivee_nom+" ("+(MODE_LABEL[s.mode] || s.mode)+")").join(" · ")}</p>
        <p>{journeyIsUnconfirmed ? "⚠ Certaines liaisons ne sont pas confirmées. Ceci est une demande d'information, pas une réservation." : "La disponibilité, le tarif définitif et les horaires doivent être confirmés par le transporteur."}</p>
        {route.segments.map((s,j) => <div key={s.id} style={{marginBottom:10}}><strong>Étape {j+1} — {s.depart_nom} → {s.arrivee_nom}</strong><SegmentOperators segment={s} /></div>)}
        <p><a className="booking-link" href={whatsappLink("demander la réservation et vérifier la disponibilité",route)} target="_blank" rel="noopener noreferrer">Contacter Voyage RDC pour ce trajet ↗</a></p>
        <p><small>Aucun billet n'est réservé ou payé dans l'application.</small></p>
        <hr style={{margin:"20px 0"}}/>
        <strong>2. Souhaitez-vous aussi un hôtel à {hotelCity} ?</strong>
        <p>Découvrez les hébergements locaux, leurs chambres, les photos et les contacts lorsqu'ils sont vérifiés.</p>
        <div className="booking-actions"><button type="button" onClick={() => {setShowHotels(true);setBookingStep(false);setSelectedHotel(null);}}>Oui, voir les hôtels</button><button type="button" onClick={() => {setShowHotels(false);setBookingStep(true);setSelectedHotel(null);}}>Non, continuer sans hôtel</button></div>
        {showHotels && <div style={{marginTop:16}}><h4>Hébergements à {hotelCity}</h4><button type="button" onClick={()=>{setSelectedHotel(null);setBookingStep(true);}}>Continuer sans hôtel →</button>
          {localHotels.length ? localHotels.map(h => <article key={h.id} className="points-panel" style={{marginTop:12}}>
            <h4>{h.name}</h4><p>{h.address}</p><button type="button" onClick={()=>{setSelectedHotel(h);setBookingStep(true);}}>Choisir cet hôtel et continuer →</button><p>{h.priceFrom != null ? "À partir de "+h.priceFrom+" "+(h.currency || "USD")+" — à confirmer" : "Tarif à confirmer"}</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{(h.cityPhotos || []).map((url,k) => <img key={"city"+k} src={url} alt={"Vue de "+hotelCity} loading="lazy" style={{width:150,height:110,objectFit:"cover",borderRadius:8}} />)}{(h.roomPhotos || []).map((url,k) => <img key={"room"+k} src={url} alt={"Chambre de "+h.name} loading="lazy" style={{width:150,height:110,objectFit:"cover",borderRadius:8}} />)}</div>
            {h.phone && <p><a href={"tel:"+h.phone}>Appeler l'hôtel : {h.phone}</a></p>}
            {h.email && <p><a href={"mailto:"+h.email}>Écrire à l'hôtel</a></p>}
            {h.website && <p><a href={h.website} target="_blank" rel="noopener noreferrer">Site de l'hôtel ↗</a></p>}
            <p><small>Disponibilité des chambres à confirmer directement avec l'hôtel.</small></p>
          </article>) : <div className="empty-state" style={{padding:22}}><strong>Hôtels partenaires à venir à {hotelCity}</strong><p>Nous n'avons pas encore d'hôtel avec coordonnées, photos de ville et chambres vérifiées pour cette destination. Aucun établissement ou prix fictif ne sera affiché.</p><a href={"https://wa.me/"+CONTACT.slice(1)+"?text="+encodeURIComponent("Bonjour Voyage RDC, je cherche un hôtel à "+hotelCity+". Merci de m'indiquer les hébergements et contacts vérifiés.")} target="_blank" rel="noopener noreferrer">Demander des contacts d'hôtels via WhatsApp ↗</a></div>}
        </div>}
        {bookingStep && <JourneyBooking key={i+"-"+(selectedHotel?.id||"transport")} route={route} destination={hotelCity} hotel={selectedHotel} traveler={traveler} onBooked={onBooked} onBack={()=>{setBookingStep(false);setShowHotels(true);}}/>}
      </div>}
      <details className="route-details"><summary>Voir les étapes et informations <span>⌄</span></summary><div className="route-legs">{route.segments.map((s, index) => <div className="leg" key={s.id}><span className="leg-index">{index + 1}</span><div><strong>{s.depart_nom} → {s.arrivee_nom}</strong><p>{MODE_LABEL[s.mode]} · {fmtDuration(s.duree_h)} · {fmtMoney(s.prix_min_usd)}{s.prix_max_usd != null ? ` à ${fmtMoney(s.prix_max_usd)}` : ""}</p><small>{s.niveau_publication === "hypothese_retour" ? "Sens retour théorique non enregistré" : s.niveau_publication === "a_verifier" ? "Liaison non confirmée — vérification nécessaire" : s.niveau_publication === "indicatif" ? "Source initiale non vérifiée" : `Dernière vérification : ${s.verifie_le}`} · {s.source_info || "Transporteur à contacter pour confirmation"}</small><div><button className="text-link" onClick={() => showPoints(s.depart_id, s.depart_nom)} type="button">Points de départ</button> · <button className="text-link" onClick={() => showPoints(s.arrivee_id, s.arrivee_nom)} type="button">Points d’arrivée</button></div><SegmentOperators segment={s} /></div></div>)}</div>{points && <div className="points-panel"><h4>Points d’embarquement — {points.name}</h4>{points.loading ? <p>Chargement…</p> : points.error ? <p>{points.error}</p> : points.list.length ? points.list.map(p => <p key={p.id}>{p.nom} {p.verifie ? "· Emplacement indiqué comme vérifié" : "· Emplacement à confirmer"} {p.latitude && p.longitude && <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=13/${p.latitude}/${p.longitude}`}>Voir sur la carte ↗</a>}</p>) : <p>Aucun point enregistré pour cette ville.</p>}</div>}</details></article>)}
      {!!routes.length && <div className="disclaimer"><Icon type="info" size={20} /><p>{notice} Les horaires et places ne sont pas disponibles en temps réel. Réservations et paiements : mise en relation uniquement. Tarifs déclarés par le gestionnaire ; disponibilité et montant à confirmer auprès du transporteur.</p></div>}
    </section>}
    {!embedded && <section className="container features"><div className="feature"><span>01</span><div><h3>Plusieurs modes, un seul endroit</h3><p>Comparez routes routières, fluviales, ferroviaires et aériennes.</p></div></div><div className="feature"><span>02</span><div><h3>Une information transparente</h3><p>Les itinéraires estimatifs restent signalés comme non vérifiés. Confirmez votre trajet auprès du transporteur.</p></div></div><div className="feature"><span>03</span><div><h3>Pensé pour la RDC</h3><p>Une interface légère, accessible sur téléphone avec Internet.</p></div></div></section>}
  </main>{!embedded && <Footer />}</>;
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
  return <><Header admin /><main className="admin-main container"><p><a href="/admin/catalogue">Gérer les transporteurs, hôtels, photos et tarifs →</a> · <a href="/admin/reservations">Gérer les demandes de réservation et paiements sur place →</a></p><div className="admin-intro"><span className="kicker">ESPACE SÉCURISÉ</span><h1>Administration des liaisons</h1><p>Contrôlez les sources, les tarifs et la publication des itinéraires. Les modifications sont immédiatement visibles en ligne.</p></div><div className="admin-login"><label>Jeton administrateur <input aria-label="Jeton administrateur" type="password" autoComplete="off" value={token} onChange={e => { setToken(e.target.value); setReady(false); }} placeholder="Saisissez votre jeton" /></label><button type="button" onClick={() => load(0)} disabled={!token || busy}>Connexion</button></div>
    {message && <div role="status" className="message">{message}</div>}
    {ready && <><div className="stats">{[["Liaisons importées", stats?.total], ["Publiées", stats?.publiees], ["À vérifier", stats?.a_verifier]].map(([name, value]) => <div key={name}><small>{name}</small><strong>{value ?? 0}</strong></div>)}</div><div className="admin-columns"><div className="admin-list"><h2>Liaisons <small>(50 par page)</small></h2>{rows.map(r => <button key={r.id} type="button" onClick={() => setSelected(r)} className={selected?.id === r.id ? "admin-row active" : "admin-row"}><span>{r.depart_nom} → {r.arrivee_nom}<small>{MODE_LABEL[r.mode]} · {r.statut}</small></span><span className={r.publie ? "pill published" : "pill"}>{r.publie ? "Publiée" : "Masquée"}</span></button>)}<div className="pager"><button type="button" disabled={offset === 0 || busy} onClick={() => load(Math.max(0, offset - 50))}>← Précédent</button><button type="button" disabled={rows.length < 50 || busy} onClick={() => load(offset + 50)}>Suivant →</button></div></div><div className="admin-edit">{selected ? <form onSubmit={save} key={selected.id}><h2>Modifier une liaison</h2><p><strong>{selected.depart_nom} → {selected.arrivee_nom}</strong><br />{MODE_LABEL[selected.mode]}</p><label>Statut<select name="statut" defaultValue={selected.statut}><option value="a_verifier">À vérifier</option><option value="ok">OK</option><option value="suspendu">Suspendu</option></select></label><label>Source vérifiée (référence / contact)<textarea name="source_info" required={false} defaultValue={selected.source_info || ""} placeholder="Ex. transporteur, personne contactée, canal" /></label><label>Date de vérification<input type="date" name="verifie_le" defaultValue={selected.verifie_le || ""} /></label><div className="form-grid"><label>Durée (heures)<input name="duree_h" type="number" min="0.1" step="0.1" defaultValue={selected.duree_h ?? ""} /></label><label>Prix min (USD)<input name="prix_min_usd" type="number" min="0" step="0.01" defaultValue={selected.prix_min_usd ?? ""} /></label><label>Prix max (USD)<input name="prix_max_usd" type="number" min="0" step="0.01" defaultValue={selected.prix_max_usd ?? ""} /></label></div><label className="checkbox-line"><input type="checkbox" name="publie" defaultChecked={Boolean(selected.publie)} /> Publier cette liaison pour les voyageurs</label><p className="small-note">Publication possible uniquement avec statut OK, source et date de vérification renseignées.</p><button className="search-submit" disabled={busy} type="submit">{busy ? "Enregistrement…" : "Enregistrer"}</button></form> : <div className="admin-placeholder">← Sélectionnez une liaison pour contrôler ses informations et décider de sa publication.</div>}</div></div></>}
  </main><Footer /></>;
}

function Footer() { return <footer className="footer"><div className="container footer-inner"><div><strong>voyage<span>rdc</span></strong><p>Le Congo est vaste. Vos possibilités aussi.</p></div><p>© {new Date().getFullYear()} Voyage RDC · Service d’information gratuit, uniquement en ligne. · <a href="/a-propos">À propos</a> · <a href="/contact">Contact</a> · <a href="/confidentialite">Politique de confidentialité</a></p></div></footer>; }
export default function App() { return window.location.pathname.startsWith("/a-propos") ? <AboutPage /> : window.location.pathname.startsWith("/contact") ? <ContactPage /> : window.location.pathname.startsWith("/confidentialite") ? <PrivacyPage /> : window.location.pathname.startsWith("/compte") || window.location.pathname.startsWith("/mes-voyages") ? <AccountPage renderSearch={props => <SearchPage embedded {...props} />} /> : window.location.pathname.startsWith("/admin/prestataires") ? <AdminGate><ProviderAdmin /></AdminGate> : window.location.pathname.startsWith("/admin/comptes") ? <AdminGate><AccountAdmin /></AdminGate> : window.location.pathname.startsWith("/admin/reservations") ? <AdminGate><BookingAdmin /></AdminGate> : window.location.pathname.startsWith("/admin/catalogue") ? <AdminGate><CatalogueAdmin /></AdminGate> : window.location.pathname.startsWith("/admin") ? <AdminGate><RouteAdmin /></AdminGate> : <SearchPage />; }
