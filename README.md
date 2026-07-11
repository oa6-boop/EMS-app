# EMS App


---

## 🧰 Outils utilisés

| Outil | Rôle | Lien |
|---|---|---|
| **Docker Desktop** | Conteneurisation & lancement du projet | https://www.docker.com/products/docker-desktop |
| **React + Vite** | Frontend — interface de l'application | https://react.dev · https://vitejs.dev |
| **FastAPI (Python)** | Backend — API et logique métier | https://fastapi.tiangolo.com |
| **PostgreSQL** | Base de données de l'application | https://www.postgresql.org |
| **Mosquitto (MQTT)** | Messagerie temps réel | https://mosquitto.org |
| **Node-RED** | Acquisition et routage des données | https://nodered.org |
| **Apache Kafka** | Streaming de données distribué | https://kafka.apache.org |
| **Apache Flink** | Traitement temps réel | https://flink.apache.org |
| **Prosys OPC UA** | Simulateur des capteurs (source des données) | https://prosysopc.com/products/opc-ua-simulation-server/ |

---

## 🚀 Lancer le projet (tout en Docker)

Prérequis : **Docker Desktop** installé et démarré + **Prosys OPC UA** lancé sur le PC.

```bash
cd EMS/EMS_Dataplatform-main
docker compose up --build -d
```

Attendre ~5 minutes (que tous les services soient démarrés), puis ouvrir :
**http://localhost:5173**

> 💡 Pour repartir de zéro (efface la base) : `docker compose down -v` avant le `up`.

### Vérifier que les données circulent

```bash
docker logs bridge --tail 20
docker logs ems-backend --tail 20
```

---

## 🔗 URLs & accès

| Service | Lien | Identifiants |
|---|---|---|
| **Application** | http://localhost:5173 | admin@jesagroup.com / admin123 |
| API Swagger | http://localhost:8000/docs | — |
| Base de données (pgAdmin) | http://localhost:5050 | admin@jesagroup.com / admin123 |
| Node-RED | http://localhost:1880 | — |
| Flink UI | http://localhost:8081 | — |

---

**Compte administrateur :** `admin@jesagroup.com` / `admin123`
