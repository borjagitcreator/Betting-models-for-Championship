import numpy as np
import pandas as pd
from scipy.stats import poisson

def get_params_at_time_enhanced(
    target_date, target_home_match_no, target_away_match_no,
    home_team, away_team, xi, df_history, w_g, w_st, w_tot
):
    """
    Calcula dinámicamente Alpha y Beta aplicando decaimiento temporal (xi) 
    y ponderación de métricas.
    """
    target_date = pd.to_datetime(target_date)
    past_matches = df_history[pd.to_datetime(df_history['Date']) < target_date].copy()

    if len(past_matches) == 0:
        return None, 0, 0

    q1_h, q3_h = past_matches['FTHG'].quantile(0.25), past_matches['FTHG'].quantile(0.75)
    upper_fence_h = q3_h + 1.5 * (q3_h - q1_h)
    
    q1_a, q3_a = past_matches['FTAG'].quantile(0.25), past_matches['FTAG'].quantile(0.75)
    upper_fence_a = q3_a + 1.5 * (q3_a - q1_a)

    past_matches['FTHG_lim'] = past_matches['FTHG'].clip(upper=upper_fence_h)
    past_matches['FTAG_lim'] = past_matches['FTAG'].clip(upper=upper_fence_a)

    max_home_idx = past_matches.groupby('HomeTeam', sort=False)['Home_Match_No'].max()
    max_away_idx = past_matches.groupby('AwayTeam', sort=False)['Away_Match_No'].max()
    union_teams = max_home_idx.index.union(max_away_idx.index)
    
    t_ref = pd.concat([
        max_home_idx.reindex(union_teams).fillna(0),
        max_away_idx.reindex(union_teams).fillna(0)
    ], axis=1).max(axis=1).astype(int)

    ht = past_matches['HomeTeam'].to_numpy()
    at = past_matches['AwayTeam'].to_numpy()

    nh = past_matches['HomeTeam'].map(t_ref).fillna(0).astype(int) + 1
    th_next = np.where(ht == home_team, target_home_match_no,
                       np.where(ht == away_team, target_away_match_no, nh.to_numpy()))

    na = past_matches['AwayTeam'].map(t_ref).fillna(0).astype(int) + 1
    ta_next = np.where(at == away_team, target_away_match_no,
                       np.where(at == home_team, target_home_match_no, na.to_numpy()))

    diff_home = np.maximum(0.0, th_next.astype(float) - past_matches['Home_Match_No'].to_numpy(dtype=float) - 1.0)
    diff_away = np.maximum(0.0, ta_next.astype(float) - past_matches['Away_Match_No'].to_numpy(dtype=float) - 1.0)

    past_matches['Tw_home'] = np.exp(-xi * diff_home)
    past_matches['Tw_away'] = np.exp(-xi * diff_away)

    cols_stats = ['FTHG_lim', 'HST', 'HS', 'FTAG_lim', 'AST', 'AS']
    for col in cols_stats:
        past_matches[col + '_w_h'] = past_matches[col] * past_matches['Tw_home']
        past_matches[col + '_w_a'] = past_matches[col] * past_matches['Tw_away']

    cols_wh = [c + '_w_h' for c in cols_stats]
    cols_wa = [c + '_w_a' for c in cols_stats]

    home_sums = past_matches.groupby('HomeTeam', sort=False)[cols_wh + ['Tw_home']].sum()
    away_sums = past_matches.groupby('AwayTeam', sort=False)[cols_wa + ['Tw_away']].sum()

    total_tw_h = past_matches['Tw_home'].sum()
    total_tw_a = past_matches['Tw_away'].sum()

    avg_h_g = past_matches['FTHG_lim_w_h'].sum() / total_tw_h
    avg_a_g = past_matches['FTAG_lim_w_a'].sum() / total_tw_a
    avg_h_st = past_matches['HST_w_h'].sum() / total_tw_h
    avg_a_st = past_matches['AST_w_a'].sum() / total_tw_a
    avg_h_tot = past_matches['HS_w_h'].sum() / total_tw_h
    avg_a_tot = past_matches['AS_w_a'].sum() / total_tw_a

    all_teams = home_sums.index.union(away_sums.index)

    fill_h = {'Tw_home': 0}; fill_h.update({c: 0 for c in cols_wh})
    fill_a = {'Tw_away': 0}; fill_a.update({c: 0 for c in cols_wa})

    home_sums = home_sums.reindex(all_teams).fillna(fill_h)
    away_sums = away_sums.reindex(all_teams).fillna(fill_a)

    stats_h = pd.DataFrame(index=all_teams)
    stats_h['FTHG'] = (home_sums['FTHG_lim_w_h'] / home_sums['Tw_home']).replace([np.inf, -np.inf, np.nan], avg_h_g)
    stats_h['HST'] = (home_sums['HST_w_h'] / home_sums['Tw_home']).replace([np.inf, -np.inf, np.nan], avg_h_st)
    stats_h['HS'] = (home_sums['HS_w_h'] / home_sums['Tw_home']).replace([np.inf, -np.inf, np.nan], avg_h_tot)
    stats_h['FTAG'] = (home_sums['FTAG_lim_w_h'] / home_sums['Tw_home']).replace([np.inf, -np.inf, np.nan], avg_a_g)
    stats_h['AST'] = (home_sums['AST_w_h'] / home_sums['Tw_home']).replace([np.inf, -np.inf, np.nan], avg_a_st)
    stats_h['AS'] = (home_sums['AS_w_h'] / home_sums['Tw_home']).replace([np.inf, -np.inf, np.nan], avg_a_tot)

    stats_a = pd.DataFrame(index=all_teams)
    stats_a['FTAG'] = (away_sums['FTAG_lim_w_a'] / away_sums['Tw_away']).replace([np.inf, -np.inf, np.nan], avg_a_g)
    stats_a['AST'] = (away_sums['AST_w_a'] / away_sums['Tw_away']).replace([np.inf, -np.inf, np.nan], avg_a_st)
    stats_a['AS'] = (away_sums['AS_w_a'] / away_sums['Tw_away']).replace([np.inf, -np.inf, np.nan], avg_a_tot)
    stats_a['FTHG'] = (away_sums['FTHG_lim_w_a'] / away_sums['Tw_away']).replace([np.inf, -np.inf, np.nan], avg_h_g)
    stats_a['HST'] = (away_sums['HST_w_a'] / away_sums['Tw_away']).replace([np.inf, -np.inf, np.nan], avg_h_st)
    stats_a['HS'] = (away_sums['HS_w_a'] / away_sums['Tw_away']).replace([np.inf, -np.inf, np.nan], avg_h_tot)

    params = pd.DataFrame(index=all_teams)
    params['Alpha_Home'] = (stats_h['FTHG']/avg_h_g)*w_g + (stats_h['HST']/avg_h_st)*w_st + (stats_h['HS']/avg_h_tot)*w_tot
    params['Beta_Home'] = (stats_h['FTAG']/avg_a_g)*w_g + (stats_h['AST']/avg_a_st)*w_st + (stats_h['AS']/avg_a_tot)*w_tot
    params['Alpha_Away'] = (stats_a['FTAG']/avg_a_g)*w_g + (stats_a['AST']/avg_a_st)*w_st + (stats_a['AS']/avg_a_tot)*w_tot
    params['Beta_Away'] = (stats_a['FTHG']/avg_h_g)*w_g + (stats_a['HST']/avg_h_st)*w_st + (stats_a['HS']/avg_h_tot)*w_tot

    return params, avg_h_g, avg_a_g

def predict_match_dixon_coles(row, params, avg_home_goals, avg_away_goals, rho):
    '''
    Predice el resultado usando Dixon-Coles con corrección de dependencia (rho).
    '''
    home = row['HomeTeam']
    away = row['AwayTeam']

    lambda_home = params.loc[home, 'Alpha_Home'] * params.loc[away, 'Beta_Away'] * avg_home_goals
    lambda_away = params.loc[away, 'Alpha_Away'] * params.loc[home, 'Beta_Home'] * avg_away_goals

    epsilon = 0.9999
    max_k_home = poisson.ppf(epsilon, lambda_home)
    max_k_away = poisson.ppf(epsilon, lambda_away)
    max_goals = int(max(max_k_home, max_k_away, 1)) + 1

    k_values = np.arange(0, max_goals)
    prob_h = poisson.pmf(k_values, lambda_home)
    prob_a = poisson.pmf(k_values, lambda_away)

    prob_matrix = np.outer(prob_h, prob_a)

    prob_matrix[0, 0] *= (1 - lambda_home * lambda_away * rho)
    prob_matrix[0, 1] *= (1 + lambda_home * rho)
    prob_matrix[1, 0] *= (1 + lambda_away * rho)
    prob_matrix[1, 1] *= (1 - rho)

    prob_matrix = np.maximum(prob_matrix, 0)
    prob_matrix /= prob_matrix.sum()

    p_home_win = np.sum(np.tril(prob_matrix, -1))
    p_draw = np.sum(np.diag(prob_matrix))
    p_away_win = np.sum(np.triu(prob_matrix, 1))

    return pd.Series([p_home_win, p_draw, p_away_win],
                     index=['Prob_Home', 'Prob_Draw', 'Prob_Away'])