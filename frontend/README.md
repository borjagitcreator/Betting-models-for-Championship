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

1. **Optional Chaining + Nullish Coalescing** en todos los accesos a datos del backend:
   ```typescript
   const rowProbs = m.probabilities?.[rowModel] ?? { Home: 0, Draw: 0, Away: 0 }
   ```

2. **Booleanos Explícitos** para evitar hydration mismatch:
   ```typescript
   disabled={Boolean(isSimulating || isLoadingInitial)}
   ```

3. **No Early Returns** en el mapeo de filas - siempre renderiza con valores por defecto

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
