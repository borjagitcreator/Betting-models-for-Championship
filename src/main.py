from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import sqlite3
import os

from ml_models.Maher import predict_match_maher, get_kelly_stake
from ml_models.Dixon_Coles import get_params_at_time_enhanced, predict_match_dixon_coles
from ml_models.XGBoost import get_features_for_match, predict_match_xgboost

app = FastAPI(title="TFM Betting API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


def get_db_connection():
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=500, detail=f"Base de datos no encontrada en {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_history_from_db():
    with get_db_connection() as conn:
        df = pd.read_sql_query("SELECT * FROM matches", conn)

    df['Date'] = pd.to_datetime(df['Date'], dayfirst=True, errors='coerce')
    return df


def load_config_from_db(model_name: str):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM config WHERE model_name = ?", (model_name,))
        row = cursor.fetchone()
    
    if row is None:
        raise HTTPException(status_code=500, detail=f"Configuración para el modelo '{model_name}' no encontrada.")
    return dict(row)


def safe_odd(x):
    """Normaliza odds: <=1 o inválido -> 0.0"""
    try:
        val = float(x)
        return val if val > 1 else 0.0
    except (ValueError, TypeError):
        return 0.0


def is_value_bet(prob: float, odds: float, margin: float, max_odd: float) -> bool:
    """Determina si es una apuesta de valor según criterios del modelo.
    
    Args:
        prob: Probabilidad estimada por el modelo (0-1)
        odds: Cuota ofrecida por el mercado
        margin: Umbral EV mínimo (ej: 1.05 = 5% de margen)
        max_odd: Cuota máxima aceptable (filtro de liquidez)
    
    Returns:
        True si EV >= margin Y odds <= max_odd
    """
    if odds <= 1 or pd.isna(prob) or pd.isna(odds) or prob <= 0:
        return False
    ev = prob * odds
    return ev >= margin and odds <= max_odd


def analyze_match(
    match_row,
    params,
    avg_h_g,
    avg_a_g,
    config_maher: dict,
    config_dixon: dict,
    config_xg: dict,
    odds: dict,
    df_history: pd.DataFrame 
) -> dict:
    """
    Única fuente de verdad para análisis de un partido.
    
    Calcula:
    - Probabilidades (Maher + Dixon)
    - Kelly Stakes (usando get_kelly_stake con config['kelly'])
    - Value Bets (EV >= 1 + margin/100 y odds <= max_odd)
    
    Args:
        match_row: Serie/fila con HomeTeam, AwayTeam
        params: Parámetros calculados del modelo
        avg_h_g, avg_a_g: Medias globales
        config_maher: Config de Maher (kelly, margin, max_odd)
        config_dixon: Config de Dixon (kelly, margin, max_odd)  
        odds: Dict con keys 'home', 'draw', 'away' (ya normalizados)
    
    Returns:
        Dict con 'probabilities', 'kelly_stakes', 'value_bets' para ambos modelos
    """
    # 1. Probabilidades
    probs_dixon = predict_match_dixon_coles(match_row, params, avg_h_g, avg_a_g, rho=config_dixon['rho'])
    probs_maher = predict_match_maher(match_row, params, avg_h_g, avg_a_g)
    probs_xg_dict = {"Home": 0.0, "Draw": 0.0, "Away": 0.0}
    target_date = match_row.get('Date')

    if target_date:
        X_pred = get_features_for_match(
            target_date=target_date, 
            home_team=match_row['HomeTeam'], 
            away_team=match_row['AwayTeam'], 
            df_history=df_history, 
            odds_dict=odds
        )
        if X_pred is not None:
            try:
                probs_xg_raw = predict_match_xgboost(X_pred)
                probs_xg_dict = {
                    "Home": round(float(probs_xg_raw['Prob_Home']), 4),
                    "Draw": round(float(probs_xg_raw['Prob_Draw']), 4),
                    "Away": round(float(probs_xg_raw['Prob_Away']), 4)
                }
            except Exception as e:
                print(f"Error prediciendo XGBoost para {match_row['HomeTeam']} vs {match_row['AwayTeam']}: {e}")
    
    probabilities = {
        "Maher": {
            "Home": round(float(probs_maher['Prob_Home']), 4),
            "Draw": round(float(probs_maher['Prob_Draw']), 4),
            "Away": round(float(probs_maher['Prob_Away']), 4)
        },
        "Dixon": {
            "Home": round(float(probs_dixon['Prob_Home']), 4),
            "Draw": round(float(probs_dixon['Prob_Draw']), 4),
            "Away": round(float(probs_dixon['Prob_Away']), 4)
        },
        "XGBoost": probs_xg_dict
    }
    
    # 2. Kelly Stakes y Value Bets para Maher
    kelly_frac_m = config_maher['kelly']
    margin_m = config_maher['margin']
    max_odd_m = config_maher['max_odd']
    
    probs_m = probabilities["Maher"]
    
    is_value_home_m = is_value_bet(probs_m['Home'], odds['home'], margin_m, max_odd_m)
    is_value_draw_m = is_value_bet(probs_m['Draw'], odds['draw'], margin_m, max_odd_m)
    is_value_away_m = is_value_bet(probs_m['Away'], odds['away'], margin_m, max_odd_m)

    # Añadimos la condición (if is_value...) aquí:
    stake_home_m = get_kelly_stake(probs_m['Home'], odds['home'], kelly_frac_m) if is_value_home_m else 0.0
    stake_draw_m = get_kelly_stake(probs_m['Draw'], odds['draw'], kelly_frac_m) if is_value_draw_m else 0.0
    stake_away_m = get_kelly_stake(probs_m['Away'], odds['away'], kelly_frac_m) if is_value_away_m else 0.0
    
    
    # 3. Kelly Stakes y Value Bets para Dixon
    kelly_frac_d = config_dixon['kelly']
    margin_d = config_dixon['margin']
    max_odd_d = config_dixon['max_odd']
    
    probs_d = probabilities["Dixon"]
    
    is_value_home_d = is_value_bet(probs_d['Home'], odds['home'], margin_d, max_odd_d)
    is_value_draw_d = is_value_bet(probs_d['Draw'], odds['draw'], margin_d, max_odd_d)
    is_value_away_d = is_value_bet(probs_d['Away'], odds['away'], margin_d, max_odd_d)

    # Añadimos la condición (if is_value...) aquí:
    stake_home_d = get_kelly_stake(probs_d['Home'], odds['home'], kelly_frac_d) if is_value_home_d else 0.0
    stake_draw_d = get_kelly_stake(probs_d['Draw'], odds['draw'], kelly_frac_d) if is_value_draw_d else 0.0
    stake_away_d = get_kelly_stake(probs_d['Away'], odds['away'], kelly_frac_d) if is_value_away_d else 0.0
    
    # 4. Kelly Stakes y Value Bets para XGBoost
    kelly_frac_x = config_xg.get('kelly')
    margin_x = config_xg.get('margin')
    max_odd_x = config_xg.get('max_odd')
    
    probs_x = probabilities["XGBoost"]
    
    is_value_home_x = is_value_bet(probs_x['Home'], odds['home'], margin_x, max_odd_x)
    is_value_draw_x = is_value_bet(probs_x['Draw'], odds['draw'], margin_x, max_odd_x)
    is_value_away_x = is_value_bet(probs_x['Away'], odds['away'], margin_x, max_odd_x)

    stake_home_x = get_kelly_stake(probs_x['Home'], odds['home'], kelly_frac_x) if is_value_home_x else 0.0
    stake_draw_x = get_kelly_stake(probs_x['Draw'], odds['draw'], kelly_frac_x) if is_value_draw_x else 0.0
    stake_away_x = get_kelly_stake(probs_x['Away'], odds['away'], kelly_frac_x) if is_value_away_x else 0.0

    return {
        "probabilities": probabilities,
        "kelly_stakes": {
            "Maher": {
                "Home": round(float(stake_home_m), 4),
                "Draw": round(float(stake_draw_m), 4),
                "Away": round(float(stake_away_m), 4)
            },
            "Dixon": {
                "Home": round(float(stake_home_d), 4),
                "Draw": round(float(stake_draw_d), 4),
                "Away": round(float(stake_away_d), 4)
            },
            "XGBoost": {  # <-- AÑADIDO
                "Home": round(float(stake_home_x), 4),
                "Draw": round(float(stake_draw_x), 4),
                "Away": round(float(stake_away_x), 4)
            },
            "Kelly_Fraction_Used": {
                "Maher": kelly_frac_m,
                "Dixon": kelly_frac_d,
                "XGBoost": kelly_frac_x
            }
        },
        "value_bets": {
            "Maher": {
                "Home": is_value_home_m,
                "Draw": is_value_draw_m,
                "Away": is_value_away_m
            },
            "Dixon": {
                "Home": is_value_home_d,
                "Draw": is_value_draw_d,
                "Away": is_value_away_d
            },
            "XGBoost": {
                "Home": is_value_home_x,
                "Draw": is_value_draw_x,
                "Away": is_value_away_x
            }
        }
    }


@app.get("/api/config")
async def get_config():
    try:
        config_maher = load_config_from_db('maher')
        config_dixon = load_config_from_db('dixon')
        
        try:
            config_xg = load_config_from_db('xgboost')
        except:
            config_xg = {'kelly': 0.05, 'max_odd': 5.0, 'margin': 1.05}
        
        return {
            "Maher": {
                "kelly": config_maher['kelly'],
                "max_odd": config_maher['max_odd'],
                "margin": config_maher['margin']
            },
            "Dixon": {
                "kelly": config_dixon['kelly'],
                "max_odd": config_dixon['max_odd'],
                "margin": config_dixon['margin']
            },
            "XGBoost": {
                "kelly": config_xg['kelly'],
                "max_odd": config_xg['max_odd'],
                "margin": config_xg['margin']
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/latest-matchday")
async def get_latest_matchday():
    df_history = load_history_from_db()
    
    df_history['Date'] = pd.to_datetime(df_history['Date'], dayfirst=True, errors='coerce')
    df_history = df_history.dropna(subset=['Date'])
    
    if df_history.empty:
        raise HTTPException(status_code=404, detail="No matches found in database")
    
    latest_matches = df_history.sort_values('Date', ascending=False).head(12)
    
    try:
        config_maher = load_config_from_db('maher')
        config_dixon = load_config_from_db('dixon')
        try:
            config_xg = load_config_from_db('xgboost')
        except:
            config_xg = {'kelly': 0.05, 'max_odd': 5.0, 'margin': 1.05}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading config: {str(e)}")
    
    results = []
    for _, row in latest_matches.iterrows():
        try:
            params, avg_h_g, avg_a_g = get_params_at_time_enhanced(
                target_date=row['Date'],
                target_home_match_no=row['Home_Match_No'],
                target_away_match_no=row['Away_Match_No'],
                home_team=row['HomeTeam'],
                away_team=row['AwayTeam'],
                xi=config_dixon['xi'],
                df_history=df_history,
                w_g=config_dixon['w_g'],
                w_st=config_dixon['w_st'],
                w_tot=config_dixon['w_tot']
            )
            
            if params is None:
                print(f"DEBUG: Params es None para {row['HomeTeam']} vs {row['AwayTeam']}")
                continue
            
            b365_odds = {
                "home": safe_odd(row.get('B365H')),
                "draw": safe_odd(row.get('B365D')),
                "away": safe_odd(row.get('B365A'))
            }
            pinnacle_odds = {
                "home": safe_odd(row.get('PSH')),
                "draw": safe_odd(row.get('PSD')),
                "away": safe_odd(row.get('PSA'))
            }
            
            b365_analysis = analyze_match(
                match_row=row, params=params, avg_h_g=avg_h_g, avg_a_g=avg_a_g,
                config_maher=config_maher, config_dixon=config_dixon,
                config_xg=config_xg, odds=b365_odds, df_history=df_history
            )
            
            pinnacle_analysis = analyze_match(
                match_row=row, params=params, avg_h_g=avg_h_g, avg_a_g=avg_a_g,
                config_maher=config_maher, config_dixon=config_dixon,
                config_xg=config_xg, odds=pinnacle_odds, df_history=df_history
            )
            
            results.append({
                "date": str(row['Date']),
                "time": str(row.get('Time', '')),
                "home_team": row['HomeTeam'],
                "away_team": row['AwayTeam'],
                "home_match_no": int(row['Home_Match_No']) if pd.notna(row['Home_Match_No']) else 0,
                "away_match_no": int(row['Away_Match_No']) if pd.notna(row['Away_Match_No']) else 0,
                "b365_odds": b365_odds,
                "pinnacle_odds": pinnacle_odds,
                "probabilities": b365_analysis["probabilities"],
                "b365_kelly": b365_analysis["kelly_stakes"],
                "b365_values": b365_analysis["value_bets"],
                "pinnacle_kelly": pinnacle_analysis["kelly_stakes"],
                "pinnacle_values": pinnacle_analysis["value_bets"]
            })
        except Exception as e:
            import traceback
            print(f"ERROR CRÍTICO en partido {row.get('HomeTeam', 'Unknown')} vs {row.get('AwayTeam', 'Unknown')}: {e}")
            traceback.print_exc()
            continue
    
    return results


@app.get("/api/teams")
async def get_teams():
    df_history = load_history_from_db()
    teams = sorted(list(set(df_history['HomeTeam'].dropna().unique()) | set(df_history['AwayTeam'].dropna().unique())))
    return {"teams": teams}


@app.post("/api/predict")
async def predict_match(request: MatchPredictionRequest):
    df_history = load_history_from_db()
    
    try:
        config_maher = load_config_from_db('maher')
        config_dixon = load_config_from_db('dixon')

        try:
            config_xg = load_config_from_db('xgboost')
        except:
            config_xg = {'kelly': 0.05, 'max_odd': 5.0, 'margin': 1.05}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading config: {str(e)}")
    
    try:
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

    match_row = pd.Series({
        'Date': request.date,
        'HomeTeam': request.home_team,
        'AwayTeam': request.away_team,
        'Home_Match_No': request.target_home_match_no,
        'Away_Match_No': request.target_away_match_no
    })
    
    # Normalizar odds del request
    odds = {
        "home": safe_odd(request.home_odds),
        "draw": safe_odd(request.draw_odds),
        "away": safe_odd(request.away_odds)
    }
    
    # Análisis unificado - MISMA función que en /api/latest-matchday
    analysis = analyze_match(
        match_row=match_row,
        params=params,
        avg_h_g=avg_h_g,
        avg_a_g=avg_a_g,
        config_maher=config_maher,
        config_dixon=config_dixon,
        config_xg=config_xg,
        odds=odds,
        df_history=df_history
    )

    return {
        "match": f"{request.home_team} vs {request.away_team}",
        "date": request.date,
        "probabilities": analysis["probabilities"],
        "kelly_stakes": analysis["kelly_stakes"],
        "value_bets": analysis["value_bets"]
    }
