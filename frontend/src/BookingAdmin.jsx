import React, { useState } from "react";

export default function BookingAdmin() {
  const [token,setToken]=useState("");
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
  return <main className="account-shell"><div className="account-main"><a href="/admin">← Administration</a><h1>Validation des demandes</h1><p>Validez uniquement les prestations effectivement confirmées auprès du transporteur ou de l'hébergement. Le paiement sur place reste non encaissé.</p>
    <section className="account-card"><label>Jeton administrateur<input type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off"/></label><button className="account-primary" onClick={load} disabled={!token||busy}>Afficher les demandes</button></section>
    {error&&<p role="alert" className="account-alert">{error}</p>}
    {rows.map(row=><section className="account-card" key={row.id}><h2>{row.prestataire} · {row.ville}</h2><p>{row.voyageur_nom} · {row.voyageur_email}</p><p>{row.type} · {row.date_debut}{row.date_fin?" → "+row.date_fin:""} · {row.voyageurs} personne(s)</p><p>Référence : {row.id}</p><p><strong>{row.statut}</strong> · {row.paiement_statut}</p><div className="account-booking-actions"><button disabled={busy} onClick={()=>validate(row,"confirmee",true)}>Valider — paiement sur place</button><button disabled={busy} onClick={()=>validate(row,"confirmee",false)}>Valider — autre paiement</button><button disabled={busy} onClick={()=>validate(row,"refusee",false)}>Refuser</button></div></section>)}
  </div></main>;
}
