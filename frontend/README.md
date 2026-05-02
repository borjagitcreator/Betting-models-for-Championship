# Championship Hub Frontend

Dashboard de predicciones deportivas para la EFL Championship con 3 modelos predictivos.

## Arquitectura

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Estilos**: Tailwind CSS 4 con tema oscuro personalizado
- **Estado**: React Hooks (`useState`, `useEffect`)
- **Fetching**: API nativa `fetch` con async/await

## Estructura de Datos

El frontend consume datos del backend FastAPI con la siguiente estructura:

```typescript
// Respuesta de /api/latest-matchday
interface MatchRow {
  date: string
  time: string
  home_team: string
  away_team: string
  b365_odds: OddsTriple  // Bet365 - única casa de apuestas mostrada
  probabilities: {
    Maher: Probs
    Dixon: Probs  
    XGBoost: Probs // ML Gradient Boosting
  }
  b365_kelly: { Maher: Stakes; Dixon: Stakes; XGBoost: Stakes }
  b365_values: { Maher: ValueBets; Dixon: ValueBets; XGBoost: ValueBets }
}
```

## Patrones Defensivos Aplicados

1. **Renderizado Defensivo - Cuotas N/A:**
   Los partidos se muestran independientemente de la disponibilidad de cuotas.
   - Si una cuota individual es 0, muestra "-" en lugar de "0.00"
   - Las probabilidades del modelo siempre se muestran (vienen del análisis, no del mercado)

2. **Optional Chaining + Nullish Coalescing** en todos los accesos a datos del backend:
   ```typescript
   const rowProbs = m.probabilities?.[rowModel] ?? { Home: 0, Draw: 0, Away: 0 }
   ```

3. **Booleanos Explícitos** para evitar hydration mismatch:
   ```typescript
   disabled={!!(isSimulating || isLoadingInitial)}
   ```

4. **Patrón isMounted** para evitar hydration mismatch en toda la página:
   ```typescript
   const [isMounted, setIsMounted] = useState(false)
   useEffect(() => { setIsMounted(true) }, [])
   if (!isMounted) return <LoadingSkeleton />
   ```

5. **No Early Returns** en el mapeo de filas - siempre renderiza con valores por defecto

## Modelos Soportados

| Modelo | Tipo | Kelly Fracción |
|--------|------|----------------|
| Maher | Poisson Estático | 25% |
| Dixon-Coles | Poisson Dinámico (con ξ y ρ) | 25% |
| XGBoost | Gradient Boosting | 5% (conservador) |

## Simplificación de UI

La interfaz se ha simplificado para centrarse exclusivamente en:
- **Bet365**: Única casa de apuestas mostrada en la tabla
- **3 Modelos predictivos**: Maher, Dixon-Coles, XGBoost
- **Kelly Stakes y Value Bets**: Calculados en backend y mostrados para cada modelo

Esta simplificación mejora la claridad visual y facilita el mantenimiento del código.

## Desarrollo

```bash
npm install
npm run dev
```

Accede en `http://localhost:3000`
