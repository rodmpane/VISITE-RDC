import React,{useEffect,useState} from "react";
import {getTravelerToken} from "./AccountPage";
const modes=["avion","bus","voiture","moto","fleuve","lac","bac","train","hebergement"];
const flags=[["transmission","Transmission automatique"],["confirmation_paiement","Confirmation de paiement"],["confirmation_reservation","Confirmation de réservation"]];
async function api(path="",method="GET",body){
 const r=await fetch("/api/admin/prestataires"+path,{method,cache:"no-store",headers:{Authorization:"Bearer "+getTravelerToken(),"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok)throw Error(typeof data.detail==="string"?data.detail:"Configuration invalide");return data;
}
export default function ProviderAdmin(){
 const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function load(){try{setRows(await api());}catch(e){setMessage(e.message);}}
 useEffect(()=>{load();},[]);
 async function save(e){e.preventDefault();setBusy(true);setMessage("");const f=new FormData(e.currentTarget);
 const body=Object.fromEntries(f);body.api_url=body.api_url||null;for(const [k] of flags)body[k]=f.has(k);
 if(selected&&!body.identifiant&&!body.cle_api){delete body.identifiant;delete body.cle_api;}
 try{await api(selected?"/"+selected.id:"",selected?"PATCH":"POST",body);setSelected(null);e.target.reset();await load();setMessage("Configuration enregistrée.");}catch(err){setMessage(err.message);}finally{setBusy(false);}
 }
 return <main className="admin-main container"><h1>Prestataires et intégrations API</h1><p>Préparez les connexions API, e-mail et SMS. Aucun envoi ni paiement automatique n’est actif.</p><p role="status">{message}</p><div className="admin-columns"><section className="admin-list"><h2>Prestataires</h2><button onClick={()=>setSelected(null)}>Ajouter un prestataire</button>{!rows.length&&<p>Aucun prestataire enregistré.</p>}{rows.map(r=><button className="admin-row" key={r.id} onClick={()=>setSelected(r)}>{r.nom} — {r.mode} — Inactif</button>)}</section><section className="admin-edit"><form key={selected?.id||"new"} onSubmit={save}><h2>{selected?"Modifier":"Ajouter"} un prestataire</h2>{[["nom","Nom","text"],["api_url","Adresse API HTTPS","url"],["email","E-mail","email"],["telephone","Téléphone SMS","tel"],["identifiant","Identifiant API","password"],["cle_api","Clé API","password"]].map(([k,label,type])=><label key={k}>{label}<input name={k} type={type} required={k==="nom"} defaultValue={type==="password"?"":selected?.[k]||""} autoComplete={type==="password"?"new-password":"off"}/></label>)}{selected?.identifiants_configures?<p>Identifiants enregistrés. Laissez les deux champs secrets vides pour les conserver.</p>:null}<label>Mode<select name="mode" defaultValue={selected?.mode||"avion"}>{modes.map(m=><option key={m}>{m}</option>)}</select></label>{flags.map(([k,label])=><label className="checkbox-line" key={k}><input type="checkbox" name={k} defaultChecked={Boolean(selected?.[k])}/>{label}</label>)}<p>Activation indisponible avant validation technique.</p><button className="search-submit" disabled={busy}>Enregistrer</button></form></section></div></main>;
}
