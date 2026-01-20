from flask import Flask, render_template, jsonify, make_response
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import io
import csv
import re

app = Flask(__name__)

# --- GESTION DE LA CONNEXION BDD ---
def get_db_connection():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL missing. see the variables on render.")
    conn = psycopg2.connect(database_url, cursor_factory=RealDictCursor)
    return conn

# --- ROUTES HTML (PAGES) ---
@app.route("/")
def startup(): return render_template("startup.html")

@app.route("/explorateur")
def explorateur(): return render_template("explorateur.html")

@app.route("/tendances")
def tendances(): return render_template("tendances.html")

@app.route("/observatoire")
def observatoire(): return render_template("observatoire.html")

@app.route("/explanation")
def explanation(): return render_template("explanation.html")

@app.route("/index")
def big_picture(): return render_template("index.html")

@app.route("/methodology")
def methodology(): return render_template("methodology.html")

# --- ROUTES API  ---

@app.route("/api/jobs")
def api_jobs():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        query = """
            SELECT 
                id, title, company, country, location, link, source, date_posted,
                salary_value, salary_currency, salary_type,
                seniority_level, experience_years, 
                technical_skills, tools_used, soft_skills, domains,
                tasks, benefits, hybrid_policy, visa_sponsorship, description
            FROM jobs
            ORDER BY date_posted ASC
            LIMIT 2000;
        """
        cur.execute(query)
        jobs = cur.fetchall()
        cur.close()
        conn.close()

        # --- cleaning ---
        # transform "{Python,SQL}" en listes ["Python", "SQL"]
        cleaned_jobs = []
        for job in jobs:
            new_job = dict(job) 
            
            #  list_cols to clean
            list_cols = ["technical_skills", "tools_used", "soft_skills", "domains", "tasks", "benefits"]
            
            for col in list_cols:
                val = new_job.get(col)
                if not val:
                    new_job[col] = []
                elif isinstance(val, list):
                    new_job[col] = val 
                elif isinstance(val, str):
                    clean_str = val.replace("{", "").replace("}", "").replace("[", "").replace("]", "").replace("'", "").replace('"', "")
                    new_job[col] = [x.strip() for x in clean_str.split(",") if x.strip()]
                else:
                    new_job[col] = []

            cleaned_jobs.append(new_job)

        return jsonify(cleaned_jobs)

    except Exception as e: 
        print(f"ERREUR SQL api_jobs: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/d3-data")
def api_d3_data():
    """
Data for the Trends page (Scatter plot).
Note: If the graph is incomplete, it's because the d3_data table doesn't have all the columns. 
We use SELECT * to retrieve all the available data.
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM d3_data LIMIT 2000;")
        data = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(data)
    except Exception as e: 
        print(f"ERREUR SQL api_d3_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

# --- ROUTES ---
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

# --- ROUTES compatibilty ---

@app.route("/api/jobs/light")
def api_jobs_light():
    return api_jobs()

@app.route("/api/data")
def api_data_compat():
    # Utilisé par observatoire.js (const DATA_FILE = "/api/data";)
    return api_jobs()

@app.route("/api/stats-data")
def api_stats_data_compat():
    # Utilisé par page1-dashboard.js (const dataPath = "/api/stats-data";)
    return api_jobs()

# --- CSV ---

@app.route("/download/stats")
def download_stats():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Limite de sécurité pour l'export CSV
        cur.execute("SELECT * FROM jobs LIMIT 3000") 
        rows = cur.fetchall()
        cur.close()
        conn.close()

        if not rows: return "no data", 404

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

        if not rows: return "no data", 404

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
