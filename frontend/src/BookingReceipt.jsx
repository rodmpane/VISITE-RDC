import React from "react";

export default function BookingReceipt({ booking, traveler, onClose }) {
  if (!booking) return null;
  const confirmed = booking.statut === "Réservation confirmée";
  let info = {}; try { info = typeof booking.reservation_infos === "string" ? JSON.parse(booking.reservation_infos || "{}") : booking.reservation_infos || {}; } catch {}
  const isApk = !!window.VoyageRDCAndroid;
  const pdf = () => { if (isApk && typeof window.VoyageRDCAndroid.printPdf === "function") window.VoyageRDCAndroid.printPdf(); else window.print(); };
  const lines = [
    ["Référence", booking.reference || booking.id],
    ["Voyageur", [info.nom || traveler?.nom,info.postnom || traveler?.postnom,info.prenom || traveler?.prenom].filter(Boolean).join(" ") || "Compte voyageur"],
    ...(booking.type === "transport" ? [["Lieu de naissance",info.lieu_naissance || traveler?.lieu_naissance || "—"],["Date de naissance",info.date_naissance || traveler?.date_naissance || "—"],["Téléphone",info.telephone || traveler?.telephone || "—"],["N° pièce d’identité",info.numero_identite || "Non communiqué"],["Itinéraire",info.itineraire || "À confirmer"]] : []),
    ["E-mail", info.email || traveler?.email || "—"],
    ["Prestation", booking.type === "hebergement" ? "Hébergement" : "Transport"],
    ["Établissement / transporteur", booking.prestataire],
    ["Ville", booking.ville],
    ["Date de début", booking.date_debut],
    ["Date de fin", booking.date_fin || "—"],
    ["Nombre de voyageurs", booking.voyageurs],
    ["Informations complémentaires", booking.details || "—"],
    ["Statut", booking.statut],
    ["Moyen de paiement", booking.paiement_methode === "sur_place" ? "Sur place" : booking.paiement_methode || "Non choisi"],
    ["Statut du paiement", booking.paiement_statut],
    ...(booking.type === "hebergement" ? [["Nombre de nuits",info.nuits ?? "À confirmer"],["Modalités proposées",info.modalite || "À confirmer par l’hôtel"]] : []),
    ["Prix unitaire indicatif",info.prix_unitaire != null ? info.prix_unitaire+" "+(info.devise || "USD") : "Non communiqué"],
    ["Montant total estimatif",info.total_estime != null ? info.total_estime+" "+(info.devise || "USD")+" (non confirmé)" : "Non communiqué — à confirmer par le prestataire"],
    ["Demande créée le", new Date(booking.created_at).toLocaleString("fr-FR")]
  ];
  return <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Document Voyage RDC">
    <div className="receipt-sheet">
      <div className="receipt-actions"><button onClick={onClose} type="button">Fermer</button><button type="button" onClick={pdf}>{isApk ? "Télécharger PDF" : "Imprimer / Enregistrer en PDF"}</button></div>
      <header className="receipt-head"><img src="/voyage-rdc-logo.svg" alt="Logo Voyage RDC" /><div><h1>VOYAGE RDC</h1><p>38, avenue Ndelo, Sans-fil, Masina, Kinshasa, RDC</p><p>Tél. +243 830 033 332 · contact@voyage-rdc.com</p></div></header>
      <h2>{confirmed ? "Confirmation de réservation" : "Accusé de réception de demande"}</h2>
      <p className="receipt-warning">{confirmed ? "Réservation validée. Ce document n'est pas une preuve de paiement." : "Demande non confirmée : ce document ne garantit ni réservation ni disponibilité."}</p>
      <table className="receipt-table"><tbody>{lines.map(([label,value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>
      <p className="receipt-warning"><strong>Aucun paiement encaissé par Voyage RDC.</strong> En cas de paiement sur place, le reçu de règlement doit être délivré par le prestataire après encaissement effectif.</p>
      <footer>Voyage RDC — Document généré le {new Date().toLocaleString("fr-FR")} · Référence {booking.reference || booking.id}</footer>
    </div>
  </div>;
}
