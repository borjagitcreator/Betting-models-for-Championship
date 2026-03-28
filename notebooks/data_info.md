### Diccionario de Datos: Dataset Homogeneizado

Datasets disponibles en: https://www.football-data.co.uk/englandm.php

#### 1. Información del Partido y Temporales
* `Div`: División.
* `Date`: Fecha.
* `Time`: Hora.
* `Jornada`: Jornadas transcurridas desde el inicio (variable global calculada).
* `HomeTeam`: Equipo Local.
* `AwayTeam`: Equipo Visitante.

#### 2. Marcadores y Estadísticas
* **Goles:** `FTHG` (Local FT), `FTAG` (Visitante FT), `FTR` (Resultado FT), `HTHG` (Local HT), `HTAG` (Visitante HT), `HTR` (Resultado HT).
* **Juego:**
    * `HS`, `AS` (Disparos totales).
    * `HST`, `AST` (Disparos a puerta).
    * `HF`, `AF` (Faltas).
    * `HC`, `AC` (Córners).
    * `HY`, `AY` (Amarillas).
    * `HR`, `AR` (Rojas).

#### 3. Cuotas Pre-Partido (Apertura)
* **1X2 (Ganador):**
    * Bet365: `B365H`, `B365D`, `B365A`
    * Pinnacle: `PSH`, `PSD`, `PSA`
    * Máximos: `MaxH`, `MaxD`, `MaxA`
    * Promedios: `AvgH`, `AvgD`, `AvgA`
* **Goles (O/U 2.5):**
    * Bet365: `B365>2.5`, `B365<2.5`
    * Máximos: `Max>2.5`, `Max<2.5`
    * Promedios: `Avg>2.5`, `Avg<2.5`
* **Hándicap Asiático:**
    * `AHh` (Línea de hándicap)
    * Bet365: `B365AHH`, `B365AHA`
    * Máximos: `MaxAHH`, `MaxAHA`
    * Promedios: `AvgAHH`, `AvgAHA`

#### 4. Cuotas de Cierre (Closing Odds)
* **1X2 Cierre:**
    * Bet365: `B365CH`, `B365CD`, `B365CA`
    * Pinnacle: `PSCH`, `PSCD`, `PSCA`
    * Máximos: `MaxCH`, `MaxCD`, `MaxCA`
    * Promedios: `AvgCH`, `AvgCD`, `AvgCA`
* **Goles Cierre (O/U 2.5):**
    * Bet365: `B365C>2.5`, `B365C<2.5`
    * Máximos: `MaxC>2.5`, `MaxC<2.5`
    * Promedios: `AvgC>2.5`, `AvgC<2.5`
* **Hándicap Asiático Cierre:**
    * `AHCh` (Línea al cierre)
    * Bet365: `B365CAHH`, `B365CAHA`
    * Pinnacle: `PCAHH`, `PCAHA`
    * Máximos: `MaxCAHH`, `MaxCAHA`
    * Promedios: `AvgCAHH`, `AvgCAHA`