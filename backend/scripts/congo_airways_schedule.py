from app.db import connection, fetchall, execute
ROWS = [["Kinshasa","Kisangani","Lundi, jeudi","07:00","10:05",125],["Kisangani","Kinshasa","Lundi, jeudi","11:00","11:55",115],["Kinshasa","Lubumbashi","Lundi","13:00","16:25",145],["Lubumbashi","Kinshasa","Lundi","17:30","18:50",140],["Kinshasa","Kindu","Mardi, vendredi","08:00","11:05",125],["Kindu","Kinshasa","Mardi, vendredi","12:00","12:55",115],["Kinshasa","Kananga","Mardi","14:00","16:35",95],["Kananga","Kinshasa","Mardi","17:40","18:05",85],["Kinshasa","Mbandaka","Mercredi, samedi","08:00","09:15",75],["Mbandaka","Kinshasa","Mercredi, samedi","10:20","11:30",70],["Kinshasa","Lubumbashi","Mercredi, samedi","12:30","15:55",145],["Lubumbashi","Kinshasa","Mercredi, samedi","17:00","18:20",140],["Kinshasa","Lubumbashi","Jeudi","13:40","17:05",145],["Lubumbashi","Kinshasa","Jeudi","18:10","19:30",140],["Kinshasa","Lubumbashi","Vendredi","14:30","17:55",145],["Lubumbashi","Kinshasa","Vendredi","19:00","20:20",140],["Kinshasa","Kananga","Dimanche","08:00","10:35",95],["Kananga","Kinshasa","Dimanche","11:30","12:55",85],["Kinshasa","Lubumbashi","Dimanche","14:00","17:25",145],["Lubumbashi","Kinshasa","Dimanche","18:30","19:50",140]]

def main():
    with connection() as conn:
        places={p['nom'].strip().casefold():p['id'] for p in fetchall(conn,'SELECT id,nom FROM lieux')}
        grouped={}
        for a,b,days,dep,arr,minutes in ROWS:
            grouped.setdefault((a,b,minutes),[]).append(f'{days} : {dep} - {arr}')
        execute(conn,"UPDATE liaisons SET statut='suspendu', publie=0 WHERE mode='avion' AND LOWER(TRIM(operateur))='congo airways'")
        for (a,b,minutes),slots in grouped.items():
            x,y=places.get(a.casefold()),places.get(b.casefold())
            if not x or not y:
                raise ValueError(f'Ville inconnue: {a} / {b}')
            frequency=' ; '.join(slots)
            source='Programme interne Congo Airways, novembre 2024; historique, non publiable'
            existing=fetchall(conn,"SELECT id FROM liaisons WHERE depart_id=? AND arrivee_id=? AND mode='avion' AND LOWER(TRIM(operateur))='congo airways'",(x,y))
            if existing:
                for row in existing:
                    execute(conn,"UPDATE liaisons SET frequence=?, duree_h=?, statut='suspendu', publie=0, verifie_le=?, source_info=? WHERE id=?",(frequency,minutes/60,'2024-11-16',source,row['id']))
            else:
                execute(conn,"INSERT INTO liaisons (mode,depart_id,arrivee_id,operateur,frequence,duree_h,statut,publie,verifie_le,source_info) VALUES (?,?,?,?,?,?,?,?,?,?)",('avion',x,y,'Congo Airways',frequency,minutes/60,'suspendu',0,'2024-11-16',source))

if __name__=='__main__':
    main()
