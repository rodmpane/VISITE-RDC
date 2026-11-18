"""Opt-in partner email alerts for booking requests; never confirms a booking."""
import os
import smtplib
import ssl
from email.message import EmailMessage
from .db import connection, execute, fetchone
from .catalogue import init_catalogue

def notify_partner(booking_id):
    """Best-effort delivery, auditable and fail-closed when SMTP/partner not configured."""
    with connection() as conn:
        init_catalogue(conn)
        booking=fetchone(conn,"SELECT id,reference,type,prestataire,ville,date_debut,date_fin,voyageurs,details FROM demandes_reservation WHERE id=?",(booking_id,))
        if not booking:return
        category="hotel" if booking["type"]=="hebergement" else "transporteur"
        partner=fetchone(conn,"""SELECT id,nom,email FROM catalogue_partenaires
          WHERE categorie=? AND LOWER(TRIM(nom))=LOWER(TRIM(?))
          AND notification_active=1 AND publie=1 AND email IS NOT NULL AND TRIM(email)<>''""",
          (category,booking["prestataire"]))
        if not partner:
            status="non_configuree"
        elif not all(os.getenv(k) for k in ("SMTP_HOST","SMTP_USER","SMTP_PASSWORD","SMTP_FROM")):
            status="smtp_non_configure"
        else:
            status="echec"
            try:
                msg=EmailMessage()
                msg["From"]=os.environ["SMTP_FROM"]
                msg["To"]=partner["email"]
                msg["Subject"]="Voyage RDC - nouvelle demande "+booking["reference"]
                msg.set_content(
                    "Nouvelle demande reçue via Voyage RDC.\n\n"
                    "Référence : "+booking["reference"]+"\n"
                    "Prestataire : "+partner["nom"]+"\n"
                    "Type : "+booking["type"]+"\n"
                    "Ville : "+booking["ville"]+"\n"
                    "Date de début : "+booking["date_debut"]+"\n"
                    "Date de fin : "+str(booking["date_fin"] or "-")+"\n"
                    "Voyageurs : "+str(booking["voyageurs"])+"\n"
                    "Détails : "+(booking["details"] or "-")+"\n\n"
                    "Ceci est une demande, PAS une réservation confirmée. "
                    "Contactez l'administrateur Voyage RDC pour la traiter.\n")
                port=int(os.getenv("SMTP_PORT","465"))
                with smtplib.SMTP_SSL(os.environ["SMTP_HOST"],port,timeout=12,context=ssl.create_default_context()) as smtp:
                    smtp.login(os.environ["SMTP_USER"],os.environ["SMTP_PASSWORD"])
                    smtp.send_message(msg)
                status="envoyee"
            except (OSError,smtplib.SMTPException,ValueError):
                status="echec"
        execute(conn,"UPDATE demandes_reservation SET notification_partenaire=? WHERE id=?",(status,booking_id))
