import {getTravelerToken} from "./AccountPage";
import React, {useState} from "react";

const blank={categorie:"transporteur",nom:"",ville_id:"",adresse:"",telephone:"",email:"",site_web:"",description:"",photo_url:"",tarif:"",devise:"USD",source_verification:"",date_verification:"",publie:false};
const FIELDS=[["nom","Nom officiel","text"],["ville_id","Identifiant de la ville (ex. kinshasa)","text"],["adresse","Adresse","text"],["telephone","Téléphone","tel"],["email","E-mail","email"],["site_web","Site officiel HTTPS","url"],["photo_url","URL de photo autorisée (HTTPS)","url"],["tarif","Tarif indicatif (laisser vide si inconnu)","number"],["source_verification","Source de vérification","text"],["date_verification","Date de vérification","date"]];
function readable(error){return typeof error==="string"?error:Array.isArray(error)?error.map(x=>x.msg).join("; "):"Erreur serveur";}
export default function CatalogueAdmin(){
 const [token,setToken]=useState(getTravelerToken);const [items,setItems]=useState([]);const [selected,setSelected]=useState(null);const [form,setForm]=useState(blank);const [error,setError]=useState("");const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);const [loaded,setLoaded]=useState(false);
 async function request(path,method="GET",data){
  const res=await fetch("/api/admin/catalogue"+path,{method,headers:{"Authorization":"Bearer "+token,...(data?{"Content-Type":"application/json"}:{})},body:data?JSON.stringify(data):undefined,cache:"no-store"});
  const json=await res.json().catch(()=>({}));if(!res.ok)throw Error(readable(json.detail));return json;
 }
 async function refresh(){setBusy(true);setError("");try{setItems(await request(""));setLoaded(true);}catch(e){setError(e.message);}finally{setBusy(false);}}
 function edit(item){setSelected(item?.id||null);setForm(item?{...item,site_web:item.site_web||"",photo_url:item.photo_url||"",tarif:item.tarif??"",date_verification:item.date_verification||"",publie:!!item.publie}:blank);setError("");setNotice("");}
 async function save(e){e.preventDefault();setBusy(true);setError("");setNotice("");try{
  const payload={...form,nom:form.nom.trim(),site_web:form.site_web||null,photo_url:form.photo_url||null,tarif:form.tarif===""?null:Number(form.tarif),date_verification:form.date_verification||null};
  const saved=await request(selected?"/"+selected:"",selected?"PUT":"POST",payload);
  setItems(await request(""));edit(saved);setNotice("Enregistrement effectué. "+(saved.publie?"Fiche publiée.":"Fiche conservée en brouillon."));
 }catch(err){setError(err.message);}finally{setBusy(false);}}
 async function remove(){if(!selected||!window.confirm("Supprimer définitivement cette fiche ?"))return;setBusy(true);setError("");try{await request("/"+selected,"DELETE");setItems(await request(""));edit(null);setNotice("Fiche supprimée.");}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{if(token)refresh();},[]);
 return <main className="container catalogue-admin"><a href="/admin">← Administration des itinéraires</a><h1>Catalogue des partenaires</h1><p>Gérez les transporteurs, hôtels, photos autorisées et tarifs. Une fiche reste invisible pour les voyageurs tant qu'elle n'est pas vérifiée et publiée.</p>
<p><a href="/admin/reservations">Gérer les réservations →</a></p>
 {error&&<p role="alert" className="account-alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {loaded&&<div className="catalogue-layout"><aside className="account-card"><h2>Fiches ({items.length})</h2><button type="button" onClick={()=>edit(null)}>+ Nouvelle fiche</button>{items.map(item=><button type="button" className={"catalogue-entry "+(selected===item.id?"selected":"")} key={item.id} onClick={()=>edit(item)}><strong>{item.nom}</strong><small>{item.categorie==="hotel"?"Hôtel":"Transporteur"} · {item.publie?"Publié":"Brouillon"}</small></button>)}</aside>
 <form className="account-card catalogue-form" onSubmit={save}><h2>{selected?"Modifier la fiche":"Nouvelle fiche"}</h2><label>Catégorie<select value={form.categorie} onChange={e=>setForm({...form,categorie:e.target.value})}><option value="transporteur">Transporteur</option><option value="hotel">Hôtel</option></select></label>
 {FIELDS.map(([key,label,type])=><label key={key}>{label}<input type={type} value={form[key]??""} min={type==="number"?"0":undefined} step={type==="number"?"0.01":undefined} onChange={e=>setForm({...form,[key]:e.target.value})} required={key==="nom"} /></label>)}
 <label>Devise<select value={form.devise} onChange={e=>setForm({...form,devise:e.target.value})}><option value="USD">USD</option><option value="CDF">CDF</option></select></label>
 <label>Description<textarea value={form.description||""} maxLength={2000} onChange={e=>setForm({...form,description:e.target.value})}/></label>
 {form.photo_url&&<img className="catalogue-preview" src={form.photo_url} alt="Aperçu de la photo proposée" referrerPolicy="no-referrer"/>}
 <label className="checkbox-line"><input type="checkbox" checked={!!form.publie} onChange={e=>setForm({...form,publie:e.target.checked})}/> Publier cette fiche après vérification</label>
 <p className="small-note">La source et la date de vérification sont obligatoires pour publier. Une photo doit être autorisée par son propriétaire. Le tarif reste indicatif.</p>
 <div className="catalogue-actions"><button type="submit" disabled={busy}>{busy?"Enregistrement…":"Enregistrer"}</button>{selected&&<button type="button" disabled={busy} onClick={remove}>Supprimer</button>}</div>
 </form></div>}
 </main>;
}
