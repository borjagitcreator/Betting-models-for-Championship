# Championship Hub Frontend

Dashboard de predicciones deportivas para la EFL Championship con 3 modelos predictivos (Maher, Dixon-Coles, XGBoost).

---

## Arquitectura

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Next.js | 16.2+ | Framework React con App Router |
| React | 19.2+ | Biblioteca UI |
| TypeScript | 5+ | Tipado estático |
| Tailwind CSS | 4+ | Estilos utilitarios |
| next/font | - | Optimización de fuentes (Inter) |

---

## Estructura de Archivos

```
frontend/
├── app/
│   ├── layout.tsx              ← Layout raíz con fuente Inter y metadata
│   ├── page.tsx                ← Dashboard principal (~600 líneas)
│   ├── globals.css             ← Variables CSS y Tailwind config
│   └── favicon.ico             ← Icono del sitio
├── public/
│   └── logos/                  ← 24 escudos de equipos EFL Championship
│       ├── Blackburn.png
│       ├── Leeds.png
│       ├── Burnley.png
│       └── ... (21 más)
├── package.json                ← Dependencias y scripts
├── next.config.ts              ← Configuración Next.js
├── tsconfig.json               ← Configuración TypeScript
├── eslint.config.mjs           ← Reglas ESLint
├── README.md                   ← Este archivo
├── AGENTS.md                   ← Reglas para agentes Cursor
└── CLAUDE.md                   ← Referencia a AGENTS.md
```

---

## Estructura de Datos

El frontend consume datos del backend FastAPI. Las interfaces TypeScript principales:

```typescript
// Interfaces principales
interface OddsTriple {
  home: number
  draw: number
  away: number
}

interface Probs {
  Home: number
  Draw: number
  Away: number
}

interface Stakes {
  Home: number
  Draw: number
  Away: number
}

interface ValueBets {
  Home: boolean
  Draw: boolean
  Away: boolean
}

// Partido de la última jornada
interface MatchRow {
  date: string
  time: string
  home_team: string
  away_team: string
  home_match_no: number
  away_match_no: number
  b365_odds: OddsTriple              // Cuotas Bet365
  probabilities: {
    Maher: Probs
    Dixon: Probs
    XGBoost: Probs
  }
  b365_kelly: {
    Maher: Stakes
    Dixon: Stakes
    XGBoost: Stakes
  }
  b365_values: {                     // Value bets identificados
    Maher: ValueBets
    Dixon: ValueBets
    XGBoost: ValueBets
  }
}

type ModelKey = 'Maher' | 'Dixon' | 'XGBoost'

// Respuesta de simulación
interface PredictionResponse {
  match: string
  date: string
  probabilities: { Maher: Probs; Dixon: Probs; XGBoost: Probs }
  kelly_stakes: {
    Maher: Stakes
    Dixon: Stakes
    XGBoost: Stakes
    Kelly_Fraction_Used: {
      Maher: number      // 0.25
      Dixon: number      // 0.25
      XGBoost: number     // 0.05
    }
  }
  value_bets: { Maher: ValueBets; Dixon: ValueBets; XGBoost: ValueBets }
}
```

---

## Endpoints Consumidos

| Endpoint | Método | Uso en Frontend |
|----------|--------|-----------------|
| `/api/config` | GET | Configuración de Kelly, margen, max_odd (no usado directamente, viene en responses) |
| `/api/latest-matchday` | GET | Carga inicial de la tabla de partidos |
| `/api/teams` | GET | Lista de equipos para selectores |
| `/api/predict` | POST | Simulación de partido personalizado |

---

## Características UI

### Tabla de Última Jornada
- Scroll vertical interno (`max-h-[500px]`)
- Cabecera sticky para navegación fácil
- Selector de modelo por fila (Maher/Dixon-Coles/XGBoost)
- Cuotas Bet365 con indicadores de Value Bet (dorado)
- Tooltips con Kelly Stakes al hover
- Skeleton loaders durante carga inicial

### Simulador Independiente
- Selectores de equipos local y visitante
- Selector de modelo predictivo
- Inputs para cuotas personalizadas (1|X|2)
- Botón de ejecución con estado de carga
- Visualización de resultados:
  - Barra de probabilidades animada (azul/gris/rojo)
  - Grid de Kelly Stakes
  - Resaltado dorado para Value Bets

### Diseño Visual
- **Tema oscuro premium**: `bg-[#09090b]` (zinc-950)
- **Glassmorphism**: `bg-white/[0.02]` con `backdrop-blur-md`
- **Bordes sutiles**: `border-white/[0.05]` y `border-zinc-800/60`
- **Tipografía Inter**: Jerarquía con pesos ligeros
- **Acentos de color**:
  - Local: azul (`text-blue-500`, `bg-blue-500`)
  - Empate: gris (`text-zinc-500`, `bg-zinc-500`)
  - Visitante: rojo (`text-rose-500`, `bg-rose-500`)
  - Value Bet: ámbar (`text-amber-400`, resplandor dorado)

---

## Patrones Defensivos Aplicados

### 1. Renderizado Defensivo - Cuotas N/A
Los partidos se muestran independientemente de la disponibilidad de cuotas:
- Si una cuota individual es 0, muestra "-" en lugar de "0.00"
- Las probabilidades del modelo siempre se muestran (vienen del análisis, no del mercado)

```typescript
const renderOdd = (odd: number, stake: number, isValue: boolean) => {
  if (odd === 0) {
    return <span className="text-zinc-600 font-light">-</span>
  }
  // ... resto del renderizado
}
```

### 2. Optional Chaining + Nullish Coalescing
En todos los accesos a datos del backend:

```typescript
const rowProbs = m.probabilities?.[rowModel] ?? { Home: 0, Draw: 0, Away: 0 }
const b365Stakes = m.b365_kelly?.[rowModel] ?? { Home: 0, Draw: 0, Away: 0 }
const b365Values = m.b365_values?.[rowModel] ?? { Home: false, Draw: false, Away: false }
```

### 3. Booleanos Explícitos para Hydration
Evitar hydration mismatch en atributos `disabled`:

```typescript
// ❌ Incorrecto (puede causar mismatch)
disabled={isSimulating || isLoadingInitial}

// ✅ Correcto (booleano explícito)
disabled={!!(isSimulating || isLoadingInitial)}
```

### 4. Patrón isMounted para Hydration Safety
Evita discrepancias entre SSR y CSR:

```typescript
const [isMounted, setIsMounted] = useState(false)

useEffect(() => {
  setIsMounted(true)
}, [])

if (!isMounted) {
  return <LoadingSkeleton />  // Render estático para SSR
}

// Render completo solo en cliente
return <FullDashboard />
```

### 5. No Early Returns en Mapeo de Filas
Siempre renderizar con valores por defecto, nunca retornar `null`:

```typescript
latestMatches.map((m, i) => {
  const rowProbs = m.probabilities?.[rowModel] ?? { Home: 0, Draw: 0, Away: 0 }
  // ... siempre retornar JSX, nunca null
  return <tr>...</tr>
})
```

---

## Modelos Soportados

| Modelo | Tipo | Kelly Fracción | Características |
|--------|------|----------------|-----------------|
| **Maher** | Poisson Estático | 25% | Fuerza ofensiva/defensiva, home advantage |
| **Dixon-Coles** | Poisson Dinámico | 25% | + Decaimiento temporal (ξ) + Corrección de correlación (ρ) |
| **XGBoost** | Gradient Boosting | 5% | Features dinámicas de forma, calibración probabilística |

---

## Simplificación de UI

La interfaz se ha simplificado para centrarse exclusivamente en:

- **Bet365**: Única casa de apuestas mostrada en la tabla
- **3 Modelos predictivos**: Maher, Dixon-Coles, XGBoost
- **Kelly Stakes y Value Bets**: Calculados en backend y mostrados para cada modelo

**Motivación**: Eliminar complejidad visual y dependencias de datos de Pinnacle que a menudo estaban incompletos. El código es ahora más ligero, más fácil de mantener, y ofrece una experiencia más consistente al usuario.

---

## Desarrollo

### Instalación de dependencias

```bash
npm install
```

### Servidor de desarrollo

```bash
npm run dev
```

Accede en `http://localhost:3000`

### Build de producción

```bash
npm run build
npm start
```

### Requisitos

- Backend FastAPI corriendo en `http://localhost:8000`
- Archivos de escudos en `public/logos/` (24 equipos EFL Championship)

---

## Notas de implementación

- **Estado por fila**: Cada fila de la tabla tiene su propio selector de modelo (`rowModels` state)
- **Quick Simulate**: Al hacer clic en "SIMULAR" en una fila, se copian los datos al simulador inferior y se ejecuta automáticamente
- **Scroll suave**: `document.getElementById('simulador-section')?.scrollIntoView({ behavior: 'smooth' })`
- **Sin estado null inicial**: Todos los estados booleanos inician en `false`, nunca `null`
- **API local**: Todas las llamadas son a `http://localhost:8000` (configurable para producción)

---

## Integración con Backend

El frontend espera que el backend proporcione:
1. Probabilidades calibradas para los 3 modelos
2. Kelly stakes pre-calculados (backend es fuente única de verdad)
3. Value bets identificados según margen configurado
4. Configuración por modelo (kelly fraction, margin, max_odd)

**No se recalcula nada en frontend**: Kelly y value bets vienen directamente del backend (`/api/latest-matchday` y `/api/predict`).
