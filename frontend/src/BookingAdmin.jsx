import {getTravelerToken} from "./AccountPage";
import React, { useState,useEffect } from "react";

export default function BookingAdmin() {
  const [token,setToken]=useState(getTravelerToken);
  const [rows,setRows]=useState([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function api(path,method="GET",body) {
    const res=await fetch("/api/compte/admin/reservations"+path,{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store"});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(data.detail||"Erreur serveur");
    return data;
  }
  async function load() {
    setBusy(true);setError("");
    try {setRows(await api(""));}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function validate(row,statut,paiement_sur_place) {
    if(!window.confirm(statut==="confirmee"?"Confirmer cette réservation après vérification auprès du prestataire ?":"Refuser cette demande ?"))return;
    setBusy(true);setError("");
    try {await api("/"+row.id+"/validation","PATCH",{statut,paiement_sur_place});setRows(await api(""));}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function validatePayment(row,encaisse){const reference=window.prompt(encaisse?"Référence de preuve d'encaissement (reçu, transaction, bordereau) :":"Référence du contrôle de paiement :");if(!reference||reference.trim().length<4)return;if(!window.confirm(encaisse?"Confirmer que l'argent a réellement été encaissé et vérifié ?":"Marquer ce paiement comme non encaissé ?"))return;setBusy(true);setError("");try{await api("/"+row.id+"/paiement-valide","PATCH",{reference:reference.trim(),encaisse});setRows(await api(""));}catch(e){setError(e.message);}finally{setBusy(false);}}
  useEffect(()=>{if(token)load();},[]);
  return <main className="account-shell"><div className="account-main"><a href="/admin">← Administration</a><h1>Validation des demandes</h1><p>Validez uniquement les prestations effectivement confirmées auprès du transporteur ou de l'hébergement. Le paiement sur place reste non encaissé.</p>
    <button className="account-primary" onClick={load} disabled={!token||busy}>Actualiser les demandes</button>
    {error&&<p role="alert" className="account-alert">{error}</p>}
    {rows.map(row=><section className="account-card" key={row.id}><h2>{row.prestataire} · {row.ville}</h2><p>{row.voyageur_nom} · {row.voyageur_email}</p><p>{row.type} · {row.date_debut}{row.date_fin?" → "+row.date_fin:""} · {row.voyageurs} personne(s)</p><p>Référence : {row.reference || row.id}</p><p><strong>Notification partenaire :</strong> {row.notification_partenaire==="envoyee"?"E-mail transmis":row.notification_partenaire==="echec"?"Échec de transmission":row.notification_partenaire==="smtp_non_configure"?"En attente de configuration e-mail":row.notification_partenaire==="non_configuree"?"Partenaire non activé pour les notifications":"En attente de traitement"}</p><p><strong>{row.statut}</strong> · {row.paiement_statut}</p>{row.paiement_reference&&<p>Justificatif de contrôle : {row.paiement_reference}</p>}<div className="account-booking-actions"><button disabled={busy} onClick={()=>validate(row,"confirmee",true)}>Valider — paiement sur place</button><button disabled={busy} onClick={()=>validate(row,"confirmee",false)}>Valider — autre paiement</button><button disabled={busy} onClick={()=>validate(row,"refusee",false)}>Refuser</button><button disabled={busy||row.statut!=="Réservation confirmée"} onClick={()=>validatePayment(row,true)}>Valider paiement encaissé</button><button disabled={busy||row.statut!=="Réservation confirmée"} onClick={()=>validatePayment(row,false)}>Paiement non encaissé</button></div></section>)}
  </div></main>;
}
