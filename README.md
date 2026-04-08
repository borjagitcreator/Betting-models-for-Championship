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
- **MLflow**: tracking de experimentos, parámetros y métricas
- **SQLite (MLflow backend)**: persistencia local de runs
- **DVC**: versionado de datasets y reproducibilidad del pipeline

### Aplicación web (Championship Hub)
- **Backend**: FastAPI · Uvicorn · Python 3.11+ · SQLite (`historico.db` vía `aiosqlite`)
- **Frontend**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · `next/font`

---

## Arquitectura del sistema

```text
┌────────────────────────────────────────────────────────────┐
│                        FRONTEND                            │
│   Next.js 16 (App Router) · React 19 · Tailwind CSS 4      │
│   TypeScript · next/font (Inter) · Hydration Optimized     │
│   http://localhost:3000                                    │
└────────────────────┬───────────────────────────────────────┘
                     │  POST /api/predict  (JSON, fetch)
                     │  GET  /api/latest-matchday
                     │  GET  /api/teams
┌────────────────────▼───────────────────────────────────────┐
│                        BACKEND                             │
│   FastAPI · Uvicorn · Python 3.11+                         │
│   http://localhost:8000                                    │
└────────────────────┬───────────────────────────────────────┘
                     │  SQL queries (aiosqlite / sqlite3)
┌────────────────────▼───────────────────────────────────────┐
│                        DATA LAYER                          │
│   SQLite  (historico.db)                                   │
│   DVC-tracked CSV snapshots                                │
└────────────────────────────────────────────────────────────┘
```

### API endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/predict` | POST | Ejecuta el modelo seleccionado y devuelve probabilidades + Kelly stakes |
| `/api/latest-matchday` | GET | Devuelve los partidos de la última jornada |
| `/api/teams` | GET | Lista los 24 equipos activos |

**Request** `POST /api/predict`:
```json
{
  "date": "YYYY-MM-DD",
  "home_team": "...",
  "away_team": "...",
  "target_home_match_no": 12,
  "target_away_match_no": 11,
  "home_odds": 2.10,
  "draw_odds": 3.40,
  "away_odds": 3.60
}
```

**Response**:
```json
{
  "match": "...",
  "date": "...",
  "probabilities": { "Maher": {}, "Dixon": {} },
  "kelly_stakes": { "Maher": {}, "Dixon": {}, "Kelly_Fraction_Used": k }
}
```

---

## Modelos implementados

### 1. Modelo de Maher (`Maher.ipynb`)

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

### 2. Modelo Dixon-Coles (`Dixon_Coles.ipynb`)

Extensión dinámica del modelo de Maher con:
- **Decaimiento temporal ξ**: los partidos recientes tienen mayor peso (`Tw = exp(-ξ · t)` donde `t` = distancia en el índice de la temporada).
- **Corrección de scores bajos ρ**: ajuste de la probabilidad conjunta para los marcadores 0-0, 1-0, 0-1 y 1-1 mediante el factor τ (tau), corrigiendo la independencia de Poisson.
- Inicialización de parámetros a partir del mejor run de Maher vía MLflow.
- Optimización conjunta de `ξ` y `ρ` mediante `differential_evolution`.

---

### Kelly Criterion

Tras estimar las probabilidades, se calculan las apuestas fraccionales de Kelly por resultado:

```
f* = (p · b - (1 - p)) / b    donde b = cuota - 1
```

El stake se fija a 0 si el modelo no detecta valor esperado positivo frente a las cuotas del mercado.

---

## Flujo de datos (end-to-end)

```
1. Carga inicial   → Frontend obtiene la última jornada y filtra los 24 equipos activos.
2. Input usuario   → Selecciona partido + modelo + cuotas de su casa de apuestas (1|X|2).
3. Ejecución       → Hace clic en "EJECUTAR SIMULACIÓN".
4. Request         → Frontend envía POST a FastAPI con contexto del partido y cuotas.
5. Base de datos   → FastAPI carga el historial de partidos desde SQLite.
6. Inferencia      → Corre el modelo Maher o Dixon-Coles.
7. Value betting   → Kelly stakes calculados dinámicamente contra las cuotas del usuario.
8. Respuesta       → JSON devuelto al frontend.
9. UI update       → Barra de probabilidades animada + grid de Kelly Stakes con EV+ resaltado.
```

---

## Arquitectura experimental (MLflow)

1. **Entrenamiento base**: ejecución de `Maher.ipynb` → registro de parámetros en MLflow.
2. **Modelo extendido**: `Dixon_Coles.ipynb` consume el mejor run de Maher desde MLflow → reoptimización con corrección de correlación y decay temporal.
3. **Tracking**: experimentos registrados en MLflow con comparación de métricas (log-likelihood, calibración, etc.).

---

## Estructura del repositorio

```
TFM/
├── Data/
│   ├── historico.db                   ← Base de datos SQLite con historial de partidos
│   └── Segunda_inglesa_data.csv       ← Datos brutos EFL Championship (DVC-tracked)
├── notebooks/
│   ├── Maher.ipynb                    ← Entrenamiento y optimización de pesos
│   └── Dixon_Coles.ipynb              ← Modelo extendido con ξ y ρ
├── src/
│   └── (aplicación FastAPI)
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css                ← Tailwind 4 + variables de color del tema
│   │   └── page.tsx                   ← Dashboard principal y simulador
│   ├── public/
│   │   └── logos/                     ← Escudos de equipos (.png)
│   └── package.json
├── architecture.md
└── requirements.txt
```

---

## Desarrollo local

```bash
# Backend
cd src/
uvicorn main:app --reload --port 8000

# Frontend (en otra terminal)
cd frontend/
npm install
npm run dev          # → http://localhost:3000
```

---

## Consideraciones de diseño

- Modelo probabilístico basado en Poisson independiente con corrección de dependencia (Dixon-Coles).
- Separación explícita entre estimación de parámetros, evaluación de mercado y análisis de value betting.
- Diseño orientado a reproducibilidad y extensión a otras ligas.
- Errores de API expuestos inline en la UI con banner rojo descartable, sin recarga de página.
