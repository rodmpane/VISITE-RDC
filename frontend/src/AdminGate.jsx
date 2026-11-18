import React,{useEffect,useState} from "react";
import {getTravelerToken} from "./AccountPage";
export default function AdminGate({children}){
 const [allowed,setAllowed]=useState(null);
 useEffect(()=>{
  const token=getTravelerToken();
  if(!token){setAllowed(false);return;}
  fetch("/api/compte/moi",{headers:{Authorization:"Bearer "+token},cache:"no-store"})
   .then(async r=>{if(!r.ok)throw Error("Session expirée");return r.json();})
   .then(data=>setAllowed(data.role==="admin"))
   .catch(()=>setAllowed(false));
 },[]);
 if(allowed===null)return <main className="account-shell"><div className="account-main"><p>Vérification de votre session…</p></div></main>;
 if(!allowed)return <main className="account-shell"><div className="account-main"><h1>Accès administrateur</h1><p>Connectez-vous avec votre compte administrateur sur la page de connexion habituelle. Les comptes clients ne peuvent pas accéder à l'administration.</p><a className="account-primary" href="/compte">Se connecter</a></div></main>;
 return children;
}
