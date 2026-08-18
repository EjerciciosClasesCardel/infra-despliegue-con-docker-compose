# Informe — Ejercicio 5: Docker y Docker Compose

## Identificación

- **Nombre:**
- **Código:**
- **Curso:** Infraestructuras Paralelas y Distribuidas
- **Fecha:**

## Descripción de la solución

> Expliquen qué imágenes base usaron en cada Dockerfile, qué optimizaciones
> aplicaron (multi-stage, capas, `.dockerignore`, usuario no-root, etc.) y por
> qué.

### Dockerfile del frontend

### Dockerfile del backend

### docker-compose.yml

> ¿Cómo orquestaron las dependencias? ¿Qué healthchecks definieron? ¿Qué red
> usaron? ¿Qué volúmenes (si alguno) y por qué?

## Resultados de las pruebas

> Pegen aquí las **salidas en texto** (no capturas de pantalla).

### `docker compose ps`

```
```

### `curl http://localhost:8080/api/health`

```
```

### `curl http://localhost:8080/api/battle`

```
```

### `curl -X POST http://localhost:8080/api/vote -H 'Content-Type: application/json' -d '{"winner_id":1,"loser_id":2}'`

```
```

### `curl http://localhost:8080/api/leaderboard | head -20`

```
```

## Reflexión

> Una o dos preguntas que respondan en máximo media página cada una.

1. ¿Qué pasaría si quitamos el `depends_on` del frontend? ¿Por qué el orden
   importa?
2. ¿Qué diferencia hay entre exponer un puerto con `ports:` y exponerlo con
   `expose:`? ¿Cuál usaron y por qué?

## Declaración de uso de IA

> Indiquen si usaron alguna herramienta de IA (ChatGPT, Copilot, Claude, etc.),
> para qué la usaron, y qué partes del entregable son íntegramente suyas.
