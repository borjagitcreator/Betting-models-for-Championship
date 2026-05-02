import numpy as np
import pandas as pd
import joblib
import os

# Carga del modelo global en memoria al arrancar la API
MODEL_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'XGBoost_calibrated.joblib'))
try:
    xgb_model = joblib.load(MODEL_PATH)
except Exception as e:
    print(f"⚠️ Advertencia: No se pudo cargar el modelo XGBoost en {MODEL_PATH}. Error: {e}")
    xgb_model = None

def calcular_features_dinamicas(df_base, k, gamma=0.33):
    """
    La misma función exacta del Notebook para garantizar que las features 
    se calculen con la misma lógica en producción.
    """
    df_temp = df_base.copy()
    historial = []
    
    for index, row in df_temp.iterrows():
        pts_h = 3 if row.get('FTR') == 'H' else (1 if row.get('FTR') == 'D' else 0)
        pts_a = 3 if row.get('FTR') == 'A' else (1 if row.get('FTR') == 'D' else 0)
        
        historial.append({'Date': row['Date'], 'Team': row['HomeTeam'], 'Role': 'Home', 
                          'GoalsScored': row.get('FTHG', 0), 'GoalsConceded': row.get('FTAG', 0), 
                          'ShotsTarget': row.get('HST', 0), 'Corners': row.get('HC', 0), 
                          'Points': pts_h, 'MatchID': index})
        historial.append({'Date': row['Date'], 'Team': row['AwayTeam'], 'Role': 'Away', 
                          'GoalsScored': row.get('FTAG', 0), 'GoalsConceded': row.get('FTHG', 0), 
                          'ShotsTarget': row.get('AST', 0), 'Corners': row.get('AC', 0), 
                          'Points': pts_a, 'MatchID': index})
        
    df_h = pd.DataFrame(historial).sort_values(by=['Team', 'Date'])
    
    for m in ['GoalsScored', 'ShotsTarget', 'Corners']:
        df_h[f'Past_{k}_{m}'] = df_h.groupby('Team')[m].transform(lambda x: x.shift(1).rolling(window=k).mean())
    
    df_h['Past_Streak'] = df_h.groupby('Team')['Points'].transform(lambda x: x.shift(1).rolling(window=k).apply(lambda y: y.sum() / (3 * k), raw=True))
    pesos = np.arange(1, k + 1)
    df_h['Past_WStreak'] = df_h.groupby('Team')['Points'].transform(lambda x: x.shift(1).rolling(window=k).apply(lambda y: np.average(y, weights=pesos) / 3, raw=True))
    
    df_h['Cum_Scored'] = df_h.groupby('Team')['GoalsScored'].transform(lambda x: x.shift(1).cumsum().fillna(0))
    df_h['Cum_Conceded'] = df_h.groupby('Team')['GoalsConceded'].transform(lambda x: x.shift(1).cumsum().fillna(0))
    df_h['GD'] = df_h['Cum_Scored'] - df_h['Cum_Conceded']
    
    cols_stats = [f'Past_{k}_GoalsScored', f'Past_{k}_ShotsTarget', f'Past_{k}_Corners', 'Past_Streak', 'Past_WStreak', 'GD']
    
    home_stats = df_h[df_h['Role'] == 'Home'].set_index('MatchID')[cols_stats]
    home_stats.columns = ['HGKPP', 'HSTKPP', 'HCKPP', 'HSt', 'HStWeighted', 'HTGD']
    away_stats = df_h[df_h['Role'] == 'Away'].set_index('MatchID')[cols_stats]
    away_stats.columns = ['AGKPP', 'ASTKPP', 'ACKPP', 'ASt', 'AStWeighted', 'ATGD']
    
    df_temp = df_temp.join(home_stats).join(away_stats)
    
    h_form_list, a_form_list = [], []
    estado_forma = {}
    
    for index, row in df_temp.iterrows():
        ht, at, res = row['HomeTeam'], row['AwayTeam'], row.get('FTR', '?')
        if ht not in estado_forma: estado_forma[ht] = 1.0
        if at not in estado_forma: estado_forma[at] = 1.0
            
        f_ht, f_at = estado_forma[ht], estado_forma[at]
        h_form_list.append(f_ht)
        a_form_list.append(f_at)
        
        # Solo actualizamos la forma si hay resultado real (evita que la fila fantasma altere el dict)
        if res == 'H':
            estado_forma[ht], estado_forma[at] = f_ht + (gamma * f_at), f_at - (gamma * f_at)
        elif res == 'A':
            estado_forma[ht], estado_forma[at] = f_ht - (gamma * f_ht), f_at + (gamma * f_ht)
        elif res == 'D':
            diff = f_ht - f_at
            estado_forma[ht], estado_forma[at] = f_ht - (gamma * diff), f_at - (gamma * -diff)

    df_temp['HForm'], df_temp['AForm'] = h_form_list, a_form_list
    
    df_temp['FormDifferential'] = df_temp['HForm'] - df_temp['AForm']
    df_temp['GDDifferential'] = df_temp['HTGD'] - df_temp['ATGD']
    df_temp['GKPP'] = df_temp['HGKPP'] - df_temp['AGKPP']
    df_temp['STKPP'] = df_temp['HSTKPP'] - df_temp['ASTKPP']
    df_temp['CKPP'] = df_temp['HCKPP'] - df_temp['ACKPP']
    df_temp['StDifferential'] = df_temp['HSt'] - df_temp['ASt']
    df_temp['StWeightedDifferential'] = df_temp['HStWeighted'] - df_temp['AStWeighted']
    
    return df_temp

def get_features_for_match(target_date, home_team, away_team, df_history, odds_dict, k=7, gamma=0.33):
    """
    Extrae el vector de características exacto para un partido específico.
    """
    target_date = pd.to_datetime(target_date)
    
    # 1. Filtramos el histórico estrictamente antes de la fecha del partido
    past_matches = df_history[pd.to_datetime(df_history['Date']) < target_date].copy()
    
    if past_matches.empty:
        return None
        
    # 2. Creamos una fila "fantasma" para el partido que queremos predecir
    dummy_row = pd.DataFrame([{
        'Date': target_date,
        'HomeTeam': home_team,
        'AwayTeam': away_team,
        'FTR': '?', # Resultado desconocido
    }])
    
    # 3. Concatenamos y calculamos (la fila fantasma absorberá el estado rodante de los partidos anteriores)
    temp_df = pd.concat([past_matches, dummy_row], ignore_index=True)
    df_processed = calcular_features_dinamicas(temp_df, k, gamma)
    
    # 4. Extraemos la última fila (nuestra fila fantasma ya procesada)
    target_row = df_processed.iloc[-1].copy()
    
    # 5. Añadimos las variables de mercado (probabilidades implícitas de las odds recibidas de la UI)
    # Validamos que las cuotas sean mayores que 0 antes de dividir
    if odds_dict['home'] <= 0 or odds_dict['draw'] <= 0 or odds_dict['away'] <= 0:
        return None

    margin = (1/odds_dict['home']) + (1/odds_dict['draw']) + (1/odds_dict['away'])
    target_row['prob_B365H'] = (1/odds_dict['home']) / margin
    target_row['prob_B365D'] = (1/odds_dict['draw']) / margin
    target_row['prob_B365A'] = (1/odds_dict['away']) / margin
    
    # Suponemos un partido equilibrado en expectativa de goles (0.5) si no pasamos O/U desde el frontend
    target_row['goals_expectation'] = 0.5 
    
    # Construimos el vector final asegurando el orden exacto del entrenamiento
    features_modelo = [
        'FormDifferential', 'GDDifferential', 'GKPP', 'STKPP', 'CKPP', 
        'StDifferential', 'StWeightedDifferential',
        'prob_B365H', 'prob_B365D', 'prob_B365A', 'goals_expectation'
    ]
    
    X_pred = target_row[features_modelo].to_frame().T

    try:
        X_pred = X_pred.astype(float)
    except ValueError as e:
        print(f"Error al convertir features a float: {e}")
        return None
    
    # Validamos que no haya NaNs (ocurre si uno de los equipos no tiene 'k' partidos históricos)
    if X_pred.isna().any().any():
        return None
        
    return X_pred

def predict_match_xgboost(X_pred):
    """
    Realiza la inferencia usando el modelo cargado en memoria.
    Retorna Serie con Prob_Home, Prob_Draw, Prob_Away
    """
    if xgb_model is None:
        raise RuntimeError("El modelo XGBoost no está cargado en memoria.")
        
    # El output del modelo entrenado es: [Prob_Home(0), Prob_Away(1), Prob_Draw(2)]
    probs = xgb_model.predict_proba(X_pred)[0]
    
    return pd.Series(
        [probs[0], probs[2], probs[1]], 
        index=['Prob_Home', 'Prob_Draw', 'Prob_Away']
    )