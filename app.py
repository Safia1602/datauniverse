from flask import Flask, render_template, jsonify, make_response
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import io
import csv

app = Flask(__name__)

# --- CONNEXION BDD ---
def get_db_connection():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        # Petite sécurité pour éviter un crash violent si la variable manque
        raise ValueError("DATABASE_URL manquante")
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

# --- ROUTES API (DONNÉES JSON) ---

@app.route("/api/jobs")
def api_jobs():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM jobs;")
        jobs = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(jobs)
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route("/api/job/<int:job_id>")
def api_job(job_id: int):
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
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM d3_data;")
        data = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(data)
    except Exception as e: return jsonify({"error": str(e)}), 500

# --- ROUTES MANQUANTES (AJOUTÉES ICI POUR CORRIGER LES ERREURS) ---

@app.route("/api/jobs/light")
def api_jobs_light():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # On ne sélectionne que les colonnes légères (comme dans ton ancien code)
        query = """
            SELECT id, title, company, country, location, seniority_level, 
                   salary_value, salary_currency, hybrid_policy, visa_sponsorship 
            FROM jobs;
        """
        cur.execute(query)
        jobs = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(jobs)
    except Exception as e: return jsonify({"error": str(e)}), 500

# Ces routes redirigent vers api_jobs() pour que ton vieux JavaScript fonctionne toujours
@app.route("/api/data")
def api_data_compat():
    return api_jobs()

@app.route("/api/stats-data")
def api_stats_data_compat():
    return api_jobs()


# --- ROUTES DE TÉLÉCHARGEMENT (GÉNÉRATION CSV) ---

@app.route("/download/stats")
def download_stats():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM jobs")
        rows = cur.fetchall()
        cur.close()
        conn.close()

        if not rows: return "Pas de données", 404

        si = io.StringIO()
        # Utilisation des clés du dictionnaire pour l'entête CSV
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
        cur.execute("SELECT * FROM d3_data")
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
