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
  probabilities: {
    Maher: Probs
    Dixon: Probs  
    XGBoost: Probs // ML Gradient Boosting
  }
  b365_kelly: { Maher: Stakes; Dixon: Stakes; XGBoost: Stakes }
  b365_values: { Maher: ValueBets; Dixon: ValueBets; XGBoost: ValueBets }
  pinnacle_kelly: { ... }
  pinnacle_values: { ... }
}
```

## Patrones Defensivos Aplicados

1. **Renderizado Defensivo - Cuotas N/A:**
   Los partidos se muestran independientemente de la disponibilidad de cuotas de casas individuales.
   - Si una casa (ej: Pinnacle) tiene todas las cuotas en 0, muestra "N/A" en lugar de ocultar la fila
   - Si una cuota individual es 0, muestra "-" en lugar de "0.00"
   - Las probabilidades del modelo siempre se muestran (vienen del análisis, no del mercado)

2. **Optional Chaining + Nullish Coalescing** en todos los accesos a datos del backend:
   ```typescript
   const rowProbs = m.probabilities?.[rowModel] ?? { Home: 0, Draw: 0, Away: 0 }
   ```

3. **Booleanos Explícitos** para evitar hydration mismatch:
   ```typescript
   disabled={Boolean(isSimulating || isLoadingInitial)}
   ```

4. **No Early Returns** en el mapeo de filas - siempre renderiza con valores por defecto

## Modelos Soportados

| Modelo | Tipo | Kelly Fracción |
|--------|------|----------------|
| Maher | Poisson Estático | 25% |
| Dixon-Coles | Poisson Dinámico (con ξ y ρ) | 25% |
| XGBoost | Gradient Boosting | 5% (conservador) |

## Desarrollo

```bash
npm install
npm run dev
```

Accede en `http://localhost:3000`
