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

### Modelado y experimentación
- **Python 3.11+ · Jupyter Notebooks**
- **SciPy**: optimización numérica (MLE – Maximum Likelihood Estimation, `differential_evolution`)
- **Pandas**: manipulación y análisis de datos
- **XGBoost**: Gradient Boosting para modelo ML
- **scikit-learn**: calibración probabilística y utilidades ML
- **MLflow**: tracking de experimentos, parámetros y métricas
- **SQLite (MLflow backend)**: persistencia local de runs
- **DVC**: versionado de datasets y reproducibilidad del pipeline

### Aplicación web (Championship Hub)
- **Backend**: FastAPI · Uvicorn · Python 3.11+ · SQLite (`historico.db`)
- **Frontend**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · `next/font`
- **Async**: `aiosqlite` para operaciones async con SQLite

---

## Arquitectura del sistema

```text
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                               │
│   Next.js 16 (App Router) · React 19 · Tailwind CSS 4         │
│   TypeScript · next/font (Inter) · Hydration Optimized        │
│   http://localhost:3000                                       │
└────────────────────┬────────────────────────────────────────┘
                     │  GET  /api/config
                     │  GET  /api/latest-matchday
                     │  GET  /api/teams
                     │  POST /api/predict
┌────────────────────▼────────────────────────────────────────┐
│                        BACKEND                              │
│   FastAPI · Uvicorn · Python 3.11+ · SQLite                 │
│   http://localhost:8000                                     │
│                                                             │
│   • main.py - API y lógica centralizada                     │
│   • ml_models/Maher.py - Poisson estático                   │
│   • ml_models/Dixon_Coles.py - Poisson dinámico (ξ, ρ)      │
│   • ml_models/XGBoost.py - Gradient Boosting + features     │
└────────────────────┬────────────────────────────────────────┘
                     │  SQL queries (aiosqlite / sqlite3)
┌────────────────────▼────────────────────────────────────────┐
│                        DATA LAYER                           │
│   SQLite  (historico.db) - Partidos y configuraciones       │
│   DVC-tracked CSV snapshots                                 │
│   MLflow DB - Tracking de experimentos                      │
└─────────────────────────────────────────────────────────────┘
```

---

## API endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/config` | GET | Configuración de Kelly, margen y max_odd para cada modelo |
| `/api/latest-matchday` | GET | Devuelve los partidos de la última jornada con análisis completo |
| `/api/teams` | GET | Lista los 24 equipos activos de la temporada actual |
| `/api/predict` | POST | Ejecuta el modelo seleccionado y devuelve probabilidades + Kelly stakes |

**Request** `POST /api/predict`:
```json
{
  "date": "YYYY-MM-DD",
  "home_team": "Sheffield Weds",
  "away_team": "Southampton",
  "target_home_match_no": 46,
  "target_away_match_no": 46,
  "home_odds": 3.10,
  "draw_odds": 3.40,
  "away_odds": 2.30
}
```

**Response**:
```json
{
  "match": "Sheffield Weds vs Southampton",
  "date": "2024-05-04",
  "probabilities": {
    "Maher": { "Home": 0.297, "Draw": 0.258, "Away": 0.445 },
    "Dixon": { "Home": 0.298, "Draw": 0.256, "Away": 0.446 },
    "XGBoost": { "Home": 0.312, "Draw": 0.251, "Away": 0.437 }
  },
  "kelly_stakes": {
    "Maher": { "Home": 0.0, "Draw": 0.0, "Away": 0.020 },
    "Dixon": { "Home": 0.0, "Draw": 0.0, "Away": 0.021 },
    "XGBoost": { "Home": 0.0, "Draw": 0.0, "Away": 0.025 },
    "Kelly_Fraction_Used": { "Maher": 0.25, "Dixon": 0.25, "XGBoost": 0.05 }
  },
  "value_bets": {
    "Maher": { "Home": false, "Draw": false, "Away": true },
    "Dixon": { "Home": false, "Draw": false, "Away": true },
    "XGBoost": { "Home": false, "Draw": false, "Away": true }
  }
}
```

---

## Modelos implementados

### 1. Modelo de Maher (`notebooks/Maher.ipynb`, `src/ml_models/Maher.py`)

Modelo base de referencia basado en un enfoque de Poisson independiente:
- Descomposición de fuerza ofensiva y defensiva por equipo.
- Estimación de parámetros mediante máxima verosimilitud, con pesos optimizados (`w_goals`, `w_shots_target`, `w_shots_total`) vía `differential_evolution`.
- Ajuste global de home advantage.

```
λ_home = avg_home_goals · α_home · β_away
λ_away = avg_away_goals · α_away · β_home
P(score) = Poisson(λ_home) × Poisson(λ_away)
```

Este modelo actúa como baseline estructural y sus parámetros son consumidos por Dixon-Coles vía MLflow.

---

### 2. Modelo Dixon-Coles (`notebooks/Dixon_Coles.ipynb`, `src/ml_models/Dixon_Coles.py`)

Extensión dinámica del modelo de Maher con:
- **Decaimiento temporal ξ**: los partidos recientes tienen mayor peso (`Tw = exp(-ξ · t)` donde `t` = distancia en el índice de la temporada).
- **Corrección de scores bajos ρ**: ajuste de la probabilidad conjunta para los marcadores 0-0, 1-0, 0-1 y 1-1 mediante el factor τ (tau), corrigiendo la independencia de Poisson.
- Inicialización de parámetros a partir del mejor run de Maher vía MLflow.
- Optimización conjunta de `ξ` y `ρ` mediante `differential_evolution`.
- **Anti-data-leakage**: Uso de `Home_Match_No`/`Away_Match_No` en lugar de jornada global, filtrado estricto por fecha.

---

### 3. Modelo XGBoost (`notebooks/XGBoost.ipynb`, `src/ml_models/XGBoost.py`)

Modelo de Machine Learning basado en Gradient Boosting:
- **Features dinámicas**: Calcula rachas de forma ponderada (últimos 7 partidos), diferenciales de goles, corners, tiros a puerta, y momentum de equipo.
- **Forma dinámica**: Simula el sistema de forma del FM usando γ=0.33 para capturar "estado de forma" actual.
- **Calibración probabilística**: Usa `CalibratedClassifierCV` con `cv=3` para outputs bien calibrados.
- **Features de mercado**: Incorpora probabilidades implícitas de Bet365 como features (no como target).
- **Requiere**: Features estrictamente float64; manejo defensivo de NaNs.

El modelo entrena sobre el historial completo y predice la probabilidad de victoria local, empate o victoria visitante.

**Archivos relacionados:**
- `src/ml_models/XGBoost_calibrated.joblib` - Modelo entrenado y calibrado
- `src/ml_models/XGBoost_calibrated.joblib.dvc` - Tracking DVC del modelo

---

### Kelly Criterion

Tras estimar las probabilidades, se calculan las apuestas fraccionales de Kelly por resultado:

```
f* = (p · b - (1 - p)) / b    donde b = cuota - 1
```

El stake se fija a 0 si el modelo no detecta valor esperado positivo frente a las cuotas del mercado.

**Configuración por modelo:**
| Modelo | Kelly Fracción | Descripción |
|--------|----------------|-------------|
| Maher | 25% | Modelo estático, confianza moderada |
| Dixon-Coles | 25% | Modelo dinámico, confianza moderada |
| XGBoost | 5% | ML conservador por naturaleza más volátil |

---

## Flujo de datos (end-to-end)

```
1. Carga inicial   → Frontend obtiene /api/config y /api/latest-matchday
2. Input usuario   → Selecciona partido + modelo (Maher/Dixon/XGBoost)
3. Tabla UI        → Muestra última jornada con selector de modelo por fila
4. Simulación      → Usuario puede ejecutar simulación independiente
5. Request         → Frontend envía POST a FastAPI con contexto y cuotas
6. Base de datos   → FastAPI carga el historial de partidos desde SQLite
7. Inferencia      → Corre el modelo seleccionado (Maher, Dixon-Coles o XGBoost)
8. Value betting   → Kelly stakes calculados dinámicamente contra cuotas del usuario
9. Respuesta       → JSON devuelto al frontend con probs, Kellys y value bets
10. UI update      → Barra de probabilidades animada + grid de Kelly Stakes con EV+ resaltado
```

---

## Arquitectura experimental (MLflow)

1. **Entrenamiento base**: ejecución de `Maher.ipynb` → registro de parámetros en MLflow.
2. **Modelo extendido**: `Dixon_Coles.ipynb` consume el mejor run de Maher desde MLflow → reoptimización con corrección de correlación y decay temporal.
3. **Modelo ML**: `XGBoost.ipynb` entrena modelo calibrado con features dinámicas.
4. **Tracking**: experimentos registrados en MLflow con comparación de métricas (log-likelihood, calibración, etc.).
5. **Base de datos**: `mlflow_experimentos.db` contiene todos los runs y artefactos.

---

## Estructura del repositorio

```
TFM/
├── Data/
│   ├── historico.db                   ← Base de datos SQLite con historial de partidos
│   ├── Segunda_inglesa_data.csv       ← Datos brutos EFL Championship (DVC-tracked)
│   └── Segunda_inglesa_data_extended.csv  ← Dataset extendido con features
├── Data.dvc                           ← Archivo DVC para versionado de datos
├── notebooks/
│   ├── Maher.ipynb                    ← Entrenamiento y optimización de pesos
│   ├── Dixon_Coles.ipynb              ← Modelo extendido con ξ y ρ
│   ├── XGBoost.ipynb                  ← Modelo ML con features dinámicas
│   ├── data_info.md                   ← Diccionario de datos
│   └── metrics_interpretation.md      ← Guía de interpretación de métricas
├── src/
│   ├── main.py                        ← API FastAPI (3 modelos, Kelly, value bets)
│   └── ml_models/
│       ├── __init__.py
│       ├── Maher.py                   ← Implementación Poisson estática
│       ├── Dixon_Coles.py             ← Implementación Poisson dinámica
│       ├── XGBoost.py                 ← Features dinámicas + inferencia ML
│       └── XGBoost_calibrated.joblib  ← Modelo entrenado (DVC-tracked)
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                 ← Layout raíz con Inter y tema oscuro
│   │   ├── globals.css                ← Tailwind 4 + variables de color
│   │   └── page.tsx                   ← Dashboard principal y simulador
│   ├── public/
│   │   └── logos/                     ← 24 escudos de equipos (.png)
│   ├── package.json                   ← Dependencias Next.js 16, React 19
│   ├── next.config.ts                 ← Configuración de Next.js
│   ├── tsconfig.json                  ← Configuración TypeScript
│   ├── eslint.config.mjs              ← Configuración ESLint
│   ├── README.md                      ← Documentación específica frontend
│   ├── AGENTS.md                      ← Reglas para agentes Cursor
│   └── CLAUDE.md                      ← Referencia a AGENTS.md
├── .gitignore                         ← Exclusiones Git
├── requirements.txt                   ← Dependencias Python
├── test_api.py                        ← Script de prueba para endpoints
├── mlflow_experimentos.db             ← Base de datos MLflow
├── architecture.md                    ← Arquitectura del sistema (legado)
└── README.md                          ← Este archivo
```

---

## Desarrollo local

### Prerrequisitos

- Python 3.11+
- Node.js 18+
- SQLite

### Backend

```bash
# Crear entorno virtual (recomendado)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# o: venv\Scripts\activate  # Windows

# Instalar dependencias
pip install -r requirements.txt

# Iniciar servidor FastAPI
cd src/
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend/
npm install
npm run dev          # → http://localhost:3000
```

### Acceso a la aplicación

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Documentación API: http://localhost:8000/docs (Swagger UI)

---

## Consideraciones de diseño

- **Tres modelos predictivos**: Poisson estático (Maher), Poisson dinámico con dependencia (Dixon-Coles), y Gradient Boosting (XGBoost).
- **Separación explícita**: Entre estimación de parámetros, evaluación de mercado y análisis de value betting.
- **Backend como única fuente de verdad**: Kelly stakes y value bets calculados exclusivamente en FastAPI.
- **Diseño orientado a reproducibilidad**: MLflow + DVC para trazabilidad completa.
- **UI simplificada**: Solo Bet365 mostrado en frontend (Pinnacle eliminado para claridad visual).
- **Errores de API**: Expuestos inline en la UI con banner rojo, sin recarga de página.
- **Hydration safety**: Patrón `isMounted` en Next.js para evitar discrepancias SSR/CSR.

---

## Licencia y uso académico

Este proyecto ha sido desarrollado como Trabajo de Fin de Máster (TFM). La información y modelos aquí presentados son con fines educativos y de investigación. El uso para apuestas reales conlleva riesgos financieros que son responsabilidad exclusiva del usuario.
