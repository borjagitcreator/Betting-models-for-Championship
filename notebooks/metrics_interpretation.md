### **Guía de Interpretación de Métricas**

Este reporte evalúa el rendimiento del modelo desde tres dimensiones: precisión de acierto, calidad de la probabilidad estimada y rentabilidad económica frente a las casas de apuestas.

---

### 1. Accuracy (Precisión)
Es el porcentaje de aciertos directos. Indica cuántas veces el resultado más probable según el modelo coincidió con la realidad.
* **Interpretación:** Si es del 45%, el modelo acertó el ganador (o empate) en 45 de cada 100 partidos.
* **Nota:** No distingue si el modelo estaba muy seguro o si acertó "por poco".

### 2. Log Loss (Pérdida Logarítmica)
Mide la **"sorpresa"** del modelo. Evalúa qué tan cerca estuvo la probabilidad asignada del resultado real.
* **La lógica:** Penaliza exponencialmente la confianza errónea. Si el modelo asegura que ganará el Local con un 90% y gana el Visitante, el Log Loss sube drásticamente.
* **Referencia:** Un valor de **1.098** equivale a predecir 33% a cada resultado (azar). Cualquier cifra **menor a 1.00** se considera un modelo con buena capacidad predictiva.

### 3. RPS (Ranked Probability Score)
Es la métrica de oro en predicción deportiva porque entiende el **orden** de los resultados (Local > Empate > Visitante).
* **Diferencia clave:** Si el resultado real es "Gana Local", el RPS castiga menos si el modelo predijo "Empate" que si predijo "Gana Visitante", reconociendo que el empate está "más cerca" del triunfo local.
* **Escala:** 0 (perfección) a 1 (error total). Valores típicos en fútbol rondan entre **0.18 y 0.22**.

---

### 4. Métricas de Valor y ROI
Estas métricas simulan un escenario real de inversión utilizando la **Estrategia de Valor**: Solo se apuesta cuando la probabilidad del modelo es mayor a la implícita en la cuota de la casa ($Probabilidad > (1/Cuota) \cdot Margen$).

* **Apuestas:** Cantidad de oportunidades de valor detectadas por el modelo.
* **Balance (U):** Beneficio neto en unidades. Un balance de +5.0 significa que has ganado 5 veces el valor de tu apuesta estándar.
* **ROI (Return on Investment):** La rentabilidad porcentual.
    * **ROI > 0%:** El modelo es rentable y logra encontrar ineficiencias en las cuotas de la casa de apuestas.
    * **ROI < 0%:** El modelo no compensa el margen de beneficio de la casa de apuestas (el "overround").

---