import os
import psycopg2
import psycopg2.extras
from flask import Flask, jsonify, request, abort

app = Flask(__name__)


def get_db():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 5432)),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


@app.route("/api/health")
def health():
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return jsonify(status="ok"), 200
    except Exception as e:
        return jsonify(status="error", error=str(e)), 503


@app.route("/api/battle", methods=["GET"])
def battle():
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, name, emoji, slogan, wins, losses FROM candidates ORDER BY RANDOM() LIMIT 2")
            rows = cur.fetchall()
            if len(rows) < 2:
                abort(503, description="no hay candidatos suficientes")
            return jsonify(rows)


@app.route("/api/vote", methods=["POST"])
def vote():
    data = request.get_json(silent=True) or {}
    winner_id = data.get("winner_id")
    loser_id = data.get("loser_id")
    if winner_id is None or loser_id is None or winner_id == loser_id:
        abort(400, description="voto invalido")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE candidates SET wins = wins + 1 WHERE id = %s", (winner_id,))
            if cur.rowcount == 0:
                abort(404, description="ganador no existe")
            cur.execute("UPDATE candidates SET losses = losses + 1 WHERE id = %s", (loser_id,))
            if cur.rowcount == 0:
                abort(404, description="perdedor no existe")
            conn.commit()
    return jsonify(ok=True), 200


@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, name, emoji, slogan, wins, losses,
                       (wins - losses) AS score
                FROM candidates
                ORDER BY score DESC, wins DESC
                """
            )
            return jsonify(cur.fetchall())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
