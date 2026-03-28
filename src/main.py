from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
import sqlite3
import os

from ml_models.Maher import predict_match_maher, get_kelly_stake
from ml_models.Dixon_Coles import get_params_at_time_enhanced, predict_match_dixon_coles

app = FastAPI(title="TFM Betting API")

# Ruta a tu base de datos (sube un nivel desde src y entra en Data)
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Data", "historico.db"))

class MatchPredictionRequest(BaseModel):
    date: str
    home_team: str
    away_team: str
    target_home_match_no: int
    target_away_match_no: int
    home_odds: float
    draw_odds: float
    away_odds: float

def load_history_from_db():
    """Carga el histórico de partidos."""
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=500, detail=f"Base de datos no encontrada en {DB_PATH}")
    
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM matches", conn) 
    conn.close()
    return df

def load_config_from_db(model_name: str):
    """Carga los hiperparámetros óptimos de MLflow desde la base de datos."""
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=500, detail=f"Base de datos no encontrada en {DB_PATH}")
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Permite acceder a las columnas por su nombre
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM config WHERE model_name = ?", (model_name,))
    row = cursor.fetchone()
    conn.close()
    
    if row is None:
        raise HTTPException(status_code=500, detail=f"Configuración para el modelo '{model_name}' no encontrada.")
    
    return dict(row)

@app.post("/api/predict")
async def predict_match(request: MatchPredictionRequest):
    
    # 1. Cargar datos
    df_history = load_history_from_db()
    
    # 2. Cargar Hiperparámetros Dinámicos (Adiós al hardcodeo)
    config_dixon = load_config_from_db('dixon')
    
    try:
        # 3. Calculamos los parámetros usando los pesos y el xi (decaimiento) de Dixon
        params, avg_h_g, avg_a_g = get_params_at_time_enhanced(
            target_date=request.date,
            target_home_match_no=request.target_home_match_no,
            target_away_match_no=request.target_away_match_no,
            home_team=request.home_team,
            away_team=request.away_team,
            xi=config_dixon['xi'],
            df_history=df_history,
            w_g=config_dixon['w_g'], 
            w_st=config_dixon['w_st'], 
            w_tot=config_dixon['w_tot']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al calcular parámetros: {str(e)}")

    if params is None:
        raise HTTPException(status_code=400, detail="No hay datos históricos suficientes para calcular.")

    # Fila simulada para tus funciones originales
    match_row = pd.Series({'HomeTeam': request.home_team, 'AwayTeam': request.away_team})

    # 4. Predicción Dixon (inyectando su rho óptimo)
    probs_dixon = predict_match_dixon_coles(match_row, params, avg_h_g, avg_a_g, rho=config_dixon['rho'])
    
    # 5. Predicción Maher (usando los mismos parámetros de fuerza base)
    probs_maher = predict_match_maher(match_row, params, avg_h_g, avg_a_g)

    # 6. Calculamos Kelly Stakes basados en Dixon (el modelo superior) y tu Kelly óptimo
    kelly_frac = config_dixon['kelly']
    stake_home = get_kelly_stake(probs_dixon['Prob_Home'], request.home_odds, kelly_frac)
    stake_draw = get_kelly_stake(probs_dixon['Prob_Draw'], request.draw_odds, kelly_frac)
    stake_away = get_kelly_stake(probs_dixon['Prob_Away'], request.away_odds, kelly_frac)

    return {
        "match": f"{request.home_team} vs {request.away_team}",
        "date": request.date,
        "probabilities": {
            "Maher": {
                "Home": round(float(probs_maher['Prob_Home']), 4),
                "Draw": round(float(probs_maher['Prob_Draw']), 4),
                "Away": round(float(probs_maher['Prob_Away']), 4)
            },
            "Dixon": {
                "Home": round(float(probs_dixon['Prob_Home']), 4),
                "Draw": round(float(probs_dixon['Prob_Draw']), 4),
                "Away": round(float(probs_dixon['Prob_Away']), 4)
            }
        },
        "kelly_stakes_dixon": {
            "Home": round(float(stake_home), 4),
            "Draw": round(float(stake_draw), 4),
            "Away": round(float(stake_away), 4),
            "Kelly_Fraction_Used": kelly_frac
        }
    }