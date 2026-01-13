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
        raise ValueError("DATABASE_URL manquante")
    conn = psycopg2.connect(database_url, cursor_factory=RealDictCursor)
    return conn

# --- ROUTES HTML ---
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

# --- ROUTES API (JSON) ---
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

# --- ROUTES DE TÉLÉCHARGEMENT (Génération CSV dynamique) ---
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