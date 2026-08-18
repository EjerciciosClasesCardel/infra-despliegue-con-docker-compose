# Despliegue con Docker y Docker Compose

Infraestructuras Paralelas y Distribuidas
Escuela de Ingeniería de Sistemas y Computación, Universidad del Valle
Carlos Andrés Delgado Saavedra

## Contexto

Se acercan las **Elecciones Mecateñas** y la Junta Vallecaucana de
Aperitivos y Mecato (JuVAM) tiene un problema serio: dieciséis candidatos
ficticios se inscribieron en la contienda y los caleños no se ponen de acuerdo
sobre quién merece la banda presidencial del paladar.

Don Pancracio Patacón promete *freír la corrupción de un solo lado*, Doña
Aguardiente Aluciña ofrece *un brindis para todos —especialmente para su
círculo cercano—*, y el Coronel Sancocho Tres Carnes jura *hervir la economía
a fuego lento, pero con sabor a leña*. La situación se complica porque el
Capitán Champús Galáctico anda haciendo campaña con un pendón de OVNIs y la
Senadora Lechona Express promete servicios públicos *envueltos en hoja de
plátano*.

La JuVAM contrató a un equipo de desarrolladores que les entregó la aplicación
web funcional —UI llamativa, API REST, base de datos con los dieciséis
candidatos— pero los desarrolladores se fueron de paseo a Cartagena y dejaron
todo sin desplegar. **La elección es ya y nadie sabe cómo poner esto en
línea.**

Aquí entran ustedes. La JuVAM les pide:

1. **Containerizar** los tres servicios que entregaron los desarrolladores
   (frontend Node, backend Flask, base Postgres).
2. **Orquestarlos** con Docker Compose para que arranquen en orden y se hablen
   entre sí por la red interna.
3. **Validar el despliegue** automáticamente en GitHub Actions cada vez que
   alguien empuje código, para que el comité técnico de la JuVAM (su profe)
   no tenga que correrlo a mano.

El código fuente de la app **no se toca**: solo orquestación. Si los caleños
no pueden votar el día D, el ganador por *default* será el ex-acuerdo entre
Don Pandebono del Valle y Mr. Buñuelo del Norte —y eso sería un escándalo
panadero internacional.

> Su tarea es **escribir los Dockerfiles y el `docker-compose.yml`**.
> El código de la aplicación está completo y no se debe tocar.

## La aplicación

| Servicio | Tecnología | Puerto interno | Función |
|---|---|---|---|
| `frontend` | Node.js 20 + Express | 8080 | Sirve la UI estática y hace proxy `/api/*` al backend |
| `backend`  | Python 3.11 + Flask + Gunicorn | 5000 | API REST para batallas, votos y tarjetón |
| `db`       | PostgreSQL 16 | 5432 | Almacena candidatos y conteo de votos |

Flujo: el navegador habla SOLO con el frontend en `localhost:8080`. El frontend
hace proxy interno hacia `backend:5000`, y el backend consulta la base de datos
en `db:5432`.

## Lo que ustedes deben entregar

Tres archivos, ni uno más:

1. `frontend/Dockerfile` — empaqueta el frontend Node.
2. `backend/Dockerfile` — empaqueta el backend Flask.
3. `docker-compose.yml` — orquesta los tres servicios.

> No modifiquen el código fuente (`frontend/`, `backend/`, `database/`,
> `.github/workflows/`). La verificación usa esos archivos tal como están.

## Variables de entorno que el backend necesita

El backend lee estas variables al arrancar (sin valores por defecto):

| Variable | Ejemplo | Descripción |
|---|---|---|
| `DB_HOST` | `db` | nombre del servicio Postgres en la red de Compose |
| `DB_PORT` | `5432` | puerto Postgres |
| `DB_NAME` | `mecato` | nombre de la base de datos |
| `DB_USER` | `mecateador` | usuario |
| `DB_PASSWORD` | `bonyurt` | clave |

Y el frontend lee:

| Variable | Ejemplo | Descripción |
|---|---|---|
| `BACKEND_URL` | `http://backend:5000` | URL interna a la que se hace proxy |
| `PORT` | `8080` | puerto donde escucha Express |

## Lo que verifica el flujo de Actions (100 puntos)

Los pasos van en orden: si la construcción de las imágenes falla, los demás no alcanzan a correr.

| # | Step | Puntos | Verifica |
|---|---|---|---|
| 1 | `build`  | 20 | `docker compose build` termina sin errores |
| 2 | `up`     | 15 | `docker compose up -d --wait --wait-timeout 90` deja todo healthy |
| 3 | `web`    | 15 | `GET http://localhost:8080/` responde HTML |
| 4 | `health` | 15 | `GET http://localhost:8080/api/health` responde `{"status":"ok"}` (frontend → backend → db) |
| 5 | `battle` | 15 | `GET http://localhost:8080/api/battle` retorna **2** candidatos desde Postgres |
| 6 | `vote`   | 20 | `POST http://localhost:8080/api/vote` incrementa el tarjetón |

Para que el paso 2 (`up --wait`) sume puntos deben definir **healthchecks** en el
compose; los pasos 3-6 dependen de que la red interna esté bien configurada.

## Pistas (no la solución)

- El frontend asume que el host del backend se llama exactamente `backend` en la
  red de Compose. Nombren el servicio así.
- Postgres tarda ~5 s en aceptar conexiones después de "running". Sin healthcheck
  el `--wait` puede pasar pero el backend va a fallar al iniciar. Usen
  `pg_isready` para el healthcheck del `db`.
- El esquema y los datos semilla viven en `database/init.sql`. Postgres ejecuta
  automáticamente cualquier `*.sql` montado en `/docker-entrypoint-initdb.d/`.
- `frontend` debe esperar a que `backend` esté arriba (ojo con `depends_on` y
  `condition: service_healthy`).
- Solo el puerto `8080` del frontend tiene que estar expuesto al host. El
  backend y la base de datos no lo necesitan.

## Probar en la máquina propia antes de subir

```bash
docker compose build
docker compose up -d --wait
curl http://localhost:8080/api/health     # {"status":"ok"}
curl http://localhost:8080/api/battle     # [{...}, {...}]
xdg-open http://localhost:8080            # ver la UI
docker compose down -v
```

## Entregables

- `frontend/Dockerfile`
- `backend/Dockerfile`
- `docker-compose.yml`
- `Informe.md` con: nombre, código, descripción de su solución, salida de
  `docker compose ps`, salida de `curl http://localhost:8080/api/battle`.

## Política de integridad

Pueden discutir conceptos entre compañeros y consultar documentación oficial
(Docker, Docker Compose). **No** copien `Dockerfile` ni `docker-compose.yml` de
otro grupo. Las herramientas de IA pueden usarse para entender conceptos pero
deben declarar su uso en el `Informe.md`.
