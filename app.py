from flask import Flask, render_template, jsonify, make_response
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import io
import csv

app = Flask(__name__)

# --- GESTION DE LA CONNEXION ---
def get_db_connection():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL manquante. Vérifie tes variables d'environnement sur Render.")
    conn = psycopg2.connect(database_url, cursor_factory=RealDictCursor)
    return conn

# --- ROUTES HTML (PAGES) ---
@app.route("/")
def observatoire(): return render_template("observatoire.html")

@app.route("/explorateur")
def explorateur(): return render_template("explorateur.html")

@app.route("/tendances")
def tendances(): return render_template("tendances.html")

@app.route("/startup")
def startup(): return render_template("startup.html")

@app.route("/explanation")
def explanation(): return render_template("explanation.html")

@app.route("/index")
def big_picture(): return render_template("index.html")

@app.route("/methodology")
def methodology(): return render_template("methodology.html")

# --- ROUTES API (DONNÉES) ---

@app.route("/api/jobs")
def api_jobs():
    """
    Route principale optimisée pour la mémoire (RAM) de Render.
    Exclut les colonnes de texte lourd (description) mais inclut TOUT ce dont
    les tableaux de bord (JS) ont besoin.
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # SÉLECTION PRÉCISE des colonnes requises par tes fichiers JS :
        # - observatoire.js : skills, domains, dates, hybrid, visa...
        # - page1-dashboard.js : salary_type, source, company...
        # - explorateur.html : link, benefits...
        
        query = """
            SELECT 
                id, 
                title, 
                company, 
                country, 
                location, 
                link,
                source,
                date_posted,
                salary_value, 
                salary_currency, 
                salary_type,
                seniority_level, 
                experience_years, 
                technical_skills, 
                tools_used, 
                soft_skills, 
                domains,
                benefits,
                hybrid_policy, 
                visa_sponsorship
            FROM jobs
            ORDER BY date_posted DESC
            LIMIT 2000;
        """
        # LIMIT 2000 est vital pour le plan gratuit (512 Mo RAM).
        
        cur.execute(query)
        jobs = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(jobs)
    except Exception as e: 
        print(f"ERREUR SQL api_jobs: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/job/<int:job_id>")
def api_job(job_id: int):
    """
    Récupère une offre unique AVEC la description complète.
    Utilisé si tu cliques sur une offre spécifique (selon l'implémentation JS).
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM jobs WHERE id = %s;", (job_id,))
        job = cur.fetchone()
        cur.close()
        conn.close()
        if not job: return jsonify({"error": "Not found"}), 404
        return jsonify(job)
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route("/api/d3-data")
def api_d3_data():
    """
    Données pour la page Tendances (Nuage de points).
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # On essaie de sélectionner les colonnes qui existent dans ta table d3_data
        # Note : Si 'topic_filtered' manque dans la DB, le JS mettra les points en gris/noir.
        query = """
            SELECT 
                id, 
                title, 
                x_umap, 
                y_umap, 
                salary_value, 
                skills_tech, 
                topic_keywords, 
                domains 
            FROM d3_data 
            LIMIT 2000;
        """
        cur.execute(query)
        data = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(data)
    except Exception as e: 
        print(f"ERREUR SQL api_d3_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

# --- ROUTES DE COMPATIBILITÉ (POUR QUE LE VIEUX JS FONCTIONNE) ---

@app.route("/api/jobs/light")
def api_jobs_light():
    # Redirige vers la route principale (qui est déjà optimisée)
    return api_jobs()

@app.route("/api/data")
def api_data_compat():
    # Utilisé par observatoire.js
    return api_jobs()

@app.route("/api/stats-data")
def api_stats_data_compat():
    # Utilisé par page1-dashboard.js et explorateur.html
    return api_jobs()

# --- TÉLÉCHARGEMENT CSV (GÉNÉRÉ À LA VOLÉE) ---

@app.route("/download/stats")
def download_stats():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # On limite à 3000 pour éviter le timeout lors de la génération du CSV
        cur.execute("SELECT * FROM jobs LIMIT 3000") 
        rows = cur.fetchall()
        cur.close()
        conn.close()

        if not rows: return "Pas de données", 404

        si = io.StringIO()
        writer = csv.DictWriter(si, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        
        output = make_response(si.getvalue())
        output.headers["Content-Disposition"] = "attachment; filename=dataset.csv"
        output.headers["Content-type"] = "text/csv"
        return output
    except Exception as e: return str(e), 500

@app.route("/download/d3")
def download_d3():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM d3_data LIMIT 3000")
        rows = cur.fetchall()
        cur.close()
        conn.close()

        if not rows: return "Pas de données", 404

        si = io.StringIO()
        writer = csv.DictWriter(si, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        
        output = make_response(si.getvalue())
        output.headers["Content-Disposition"] = "attachment; filename=dataset_d3.csv"
        output.headers["Content-type"] = "text/csv"
        return output
    except Exception as e: return str(e), 500

if __name__ == "__main__":
    app.run(debug=True)
