import numpy as np
import pandas as pd
from scipy.stats import poisson

def predict_match_maher(row, params, avg_home_goals, avg_away_goals):
    '''
    Predice el resultado del partido a partir de la distribución de Poisson 
    en función de la fuerza de ataque y de defensa de los equipos.
    '''
    home = row['HomeTeam']
    away = row['AwayTeam']

    lambda_home = params.loc[home, 'Alpha_Home'] * params.loc[away, 'Beta_Away'] * avg_home_goals
    lambda_away = params.loc[away, 'Alpha_Away'] * params.loc[home, 'Beta_Home'] * avg_away_goals

    epsilon = 0.9999
    max_k_home = poisson.ppf(epsilon, lambda_home)
    max_k_away = poisson.ppf(epsilon, lambda_away)
    max_goals = int(max(max_k_home, max_k_away)) + 1

    k_values = np.arange(0, max_goals)
    prob_h = poisson.pmf(k_values, lambda_home)
    prob_a = poisson.pmf(k_values, lambda_away)

    prob_matrix = np.outer(prob_h, prob_a)
    prob_matrix /= prob_matrix.sum()

    p_home_win = np.sum(np.tril(prob_matrix, -1))
    p_draw = np.sum(np.diag(prob_matrix))
    p_away_win = np.sum(np.triu(prob_matrix, 1))

    return pd.Series([p_home_win, p_draw, p_away_win],
                     index=['Prob_Home', 'Prob_Draw', 'Prob_Away'])

def get_kelly_stake(prob, odd, fraction=0.05):
    """
    Calcula el Stake de Kelly Fraccional.
    """
    if odd <= 1:
        return 0
    b = odd - 1
    p = prob
    q = 1 - p
    f_star = (b * p - q) / b
    return max(0, f_star * fraction)