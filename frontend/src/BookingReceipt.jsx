import React from "react";

export default function BookingReceipt({ booking, traveler, onClose }) {
  if (!booking) return null;
  const confirmed = booking.statut === "Réservation confirmée";
  const lines = [
    ["Référence", booking.id],
    ["Voyageur", traveler?.nom || "Compte voyageur"],
    ["E-mail", traveler?.email || "—"],
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
    ["Montant", "Non communiqué — à confirmer par le prestataire"],
    ["Demande créée le", new Date(booking.created_at).toLocaleString("fr-FR")]
  ];
  return <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Document Voyage RDC">
    <div className="receipt-sheet">
      <div className="receipt-actions"><button onClick={onClose} type="button">Fermer</button><button type="button" onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button></div>
      <header className="receipt-head"><img src="/voyage-rdc-logo.svg" alt="Logo Voyage RDC" /><div><h1>VOYAGE RDC</h1><p>38, avenue Ndelo, Sans-fil, Masina, Kinshasa, RDC</p><p>Tél. +243 830 033 332 · contact@voyage-rdc.com</p></div></header>
      <h2>{confirmed ? "Confirmation de réservation" : "Accusé de réception de demande"}</h2>
      <p className="receipt-warning">{confirmed ? "Réservation validée. Ce document n'est pas une preuve de paiement." : "Demande non confirmée : ce document ne garantit ni réservation ni disponibilité."}</p>
      <table className="receipt-table"><tbody>{lines.map(([label,value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>
      <p className="receipt-warning"><strong>Aucun paiement encaissé par Voyage RDC.</strong> En cas de paiement sur place, le reçu de règlement doit être délivré par le prestataire après encaissement effectif.</p>
      <footer>Voyage RDC — Document généré le {new Date().toLocaleString("fr-FR")} · Référence {booking.id}</footer>
    </div>
  </div>;
}
