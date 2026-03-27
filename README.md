# Modelos de Apuestas en la Championship (EFL Championship) ⚽📊

Repositorio para el desarrollo, evaluación y comparación de modelos probabilísticos aplicados a la predicción de resultados en la EFL Championship. El objetivo es contrastar la capacidad predictiva de modelos estadísticos clásicos frente a cuotas de mercado, con foco en identificación de value betting y calibración probabilística.

---

## Objetivo del proyecto

Construir un framework reproducible para:

- Modelizar goles en fútbol mediante procesos estocásticos.
- Estimar probabilidades de resultado (1X2, marcadores exactos).
- Comparar probabilidades implícitas del modelo vs mercado.
- Evaluar oportunidades de valor esperado positivo (EV+).
- Mantener trazabilidad completa de experimentos.

---

## Stack tecnológico

- **Python 3.x + Jupyter Notebooks**
- **SciPy**: optimización numérica (MLE – Maximum Likelihood Estimation)
- **MLflow**: tracking de experimentos, parámetros y métricas
- **SQLite (MLflow backend)**: persistencia local de runs
- **DVC**: versionado de datasets y reproducibilidad del pipeline

---

## Modelos implementados

### 1. Modelo de Maher (`Maher.ipynb`)
Modelo base de referencia basado en un enfoque de Poisson independiente:

- Descomposición de fuerza ofensiva y defensiva por equipo
- Estimación de parámetros mediante máxima verosimilitud
- Ajuste global de home advantage
- Output: intensidades esperadas de gol por equipo

Este modelo actúa como baseline estructural para el resto del pipeline.

---

### 2. Modelo Dixon-Coles (`Dixon_Coles.ipynb`)
Extensión del modelo de Maher con mejoras probabilísticas:

- Inicialización de parámetros a partir del modelo de Maher vía MLflow
- Corrección de dependencia en marcadores bajos (0-0, 1-0, 0-1, 1-1)
- Ajuste Dixon-Coles para correlación en scores bajos
- Factor de decaimiento temporal para ponderar partidos recientes
- Optimización mediante MLE

Resultado: distribución conjunta de goles más realista en escenarios de baja anotación.

---

## Arquitectura del flujo experimental

1. **Entrenamiento base**
   - Ejecución de `Maher.ipynb`
   - Registro de parámetros en MLflow

2. **Modelo extendido**
   - `Dixon_Coles.ipynb` consume el mejor run de Maher desde MLflow
   - Reoptimización con ajuste de correlación y decay temporal

3. **Tracking**
   - Experimentos registrados en MLflow
   - Comparación de métricas entre modelos (log-likelihood, calibración, etc.)

---

## Consideraciones de diseño

- Modelo probabilístico basado en Poisson independiente con corrección de dependencia
- Separación entre:
  - estimación de parámetros
  - evaluación de mercado
  - análisis de value betting
- Diseño orientado a reproducibilidad y extensión a otras ligas

---