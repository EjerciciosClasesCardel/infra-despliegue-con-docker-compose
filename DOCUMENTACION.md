# Documentación de apoyo: despliegue con Docker y Docker Compose

Aquí está lo que hace falta para escribir los dos `Dockerfile` y el `docker-compose.yml` que pide el README: las instrucciones de Dockerfile, los campos de la especificación de Compose, las imágenes `node:20`, `python:3.11-slim` y `postgres:16`, y los comandos con los que se prueba el despliegue. Hay una sección por entregable, en el mismo orden del README, y una cuarta para las pruebas en la máquina propia. Cada ejemplo se construyó y se corrió tal cual antes de pegar su salida; resuelve un problema parecido al del ejercicio, no el mismo, de modo que sirve para entender la pieza y escribir la propia. Los enlaces a la documentación van al final de cada sección.

## Parte 1: Dockerfile del frontend

El frontend es Express sobre Node 20: `server.js` sirve la carpeta `public/` y reenvía todo lo que llega a `/api` hacia el backend. Empaquetarlo es instalar las dependencias de `package.json` sobre una imagen de Node y arrancar `node server.js`.

### Lo que se usa

- `FROM node:20-slim`: la imagen base. `node:20` trae Debian completo con `curl`, `wget` y `git` (1,59 GB en esta máquina); `node:20-slim` trae solo Node y npm (293 MB); `node:20-alpine` usa musl y BusyBox (194 MB), con `wget` pero sin `curl`. Las tres traen el usuario `node` ya creado.
- `WORKDIR /app`: crea la carpeta si no existe y la deja como directorio de trabajo para los `COPY`, `RUN` y `CMD` que vengan después.
- `COPY <origen> <destino>`: copia desde el contexto de construcción, que es la carpeta que se pasa a `docker build` o el `context` del compose. `COPY package*.json ./` copia el manifiesto y el lock si existe; `COPY . .` copia todo menos lo que excluya `.dockerignore`.
- `RUN npm ci --omit=dev`: instalación limpia. Borra `node_modules`, instala exactamente lo que dice `package-lock.json` y falla si el lock no existe o no cuadra con `package.json`. `--omit=dev` deja fuera las `devDependencies`. Cuando el proyecto no trae lock, lo que queda es `npm install --omit=dev`, que resuelve versiones en cada construcción.
- `ENV NOMBRE=valor`: fija una variable de entorno dentro de la imagen, para todas las instrucciones que sigan y para el proceso final. El `environment:` del compose la pisa si la define de nuevo.
- `EXPOSE <puerto>`: documenta el puerto que escucha el proceso. No publica nada en el host; para eso está `ports:` en el compose.
- `USER node`: las instrucciones siguientes y el proceso final corren con ese usuario en lugar de root. Va después de los `COPY` y `RUN` que necesiten escribir en `/app`.
- `CMD ["node", "archivo.js"]`: el proceso del contenedor, en forma exec (lista JSON), de modo que el binario arranca como PID 1 sin un `sh` intermedio. La forma shell, `CMD node archivo.js`, mete un `/bin/sh -c` adelante que no reenvía señales.
- Healthcheck sin `curl`: Node 20 trae `fetch` global, y `node -e "fetch('http://localhost:<puerto>/<ruta>').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"` sale con 0 solo si la respuesta es 2xx, y con 1 si el servidor responde 4xx o 5xx o no responde. La ruta tiene que existir en el servidor que se chequea, y conviene que no pase por el proxy `/api`, porque entonces el estado del frontend dependería del backend; `server.js` trae una ruta pensada para esto.
- `.dockerignore`: lista de rutas que no entran al contexto. El del frontend ya excluye `node_modules`, así que las dependencias se instalan siempre dentro de la imagen y nunca se copian desde el host.

### Ejemplo

Un script que imprime la hora de Cali con la biblioteca `dayjs`. Cuatro archivos en una carpeta `hora/`:

```json
{
  "name": "hora-valle",
  "version": "1.0.0",
  "main": "hora.js",
  "scripts": {
    "start": "node hora.js"
  },
  "dependencies": {
    "dayjs": "^1.11.13"
  }
}
```

```javascript
// hora.js: imprime la hora de Cali con un formato fijo.
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const ahora = dayjs().tz('America/Bogota');
console.log(`Hora en Cali: ${ahora.format('YYYY-MM-DD HH:mm:ss')}`);
console.log(`Node ${process.version} en ${process.platform}/${process.arch}`);
```

```
# .dockerignore
node_modules
npm-debug.log
```

```dockerfile
FROM node:20-slim

WORKDIR /app

# Primero solo los manifiestos: esta capa queda en caché mientras no cambien
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Después el resto del código
COPY . .

USER node
CMD ["node", "hora.js"]
```

`npm ci` necesita el lock. Si la carpeta no lo tiene, se genera con el npm de la misma imagen, sin instalar Node en la máquina:

```bash
docker run --rm -v "$PWD":/app -w /app -u "$(id -u):$(id -g)" node:20-slim npm install --package-lock-only
```

Construir y correr:

```bash
docker build -t hora-valle .
docker run --rm hora-valle
```

Salida, recortada a lo que importa:

```
#8 [4/5] RUN npm ci --omit=dev
#8 4.035 added 1 package, and audited 2 packages in 746ms
#8 4.035 found 0 vulnerabilities
#8 DONE 4.1s
#9 [5/5] COPY . .
#10 naming to docker.io/library/hora-valle:latest done

Hora en Cali: 2026-09-16 14:31:35
Node v20.20.2 en linux/x64
```

Si se cambia `hora.js` y se vuelve a construir, los pasos hasta `npm ci` salen como `CACHED` y la construcción tarda 2,2 s en lugar de bajar las dependencias otra vez.

### Lo que suele fallar

1. **`npm ci` sin `package-lock.json`.** La construcción se corta en el `RUN` con `npm error code EUSAGE` y `The npm ci command can only install with an existing package-lock.json or npm-shrinkwrap.json with lockfileVersion >= 1`. `npm ci` no resuelve versiones, las lee del lock. Revisen si la carpeta del frontend trae uno; si no lo trae, en el Dockerfile va `npm install --omit=dev`.
2. **`COPY . .` antes de instalar.** Construye, pero cualquier cambio en un `.js` invalida la capa del `COPY` y la de `npm install` que viene detrás, y cada construcción vuelve a bajar las dependencias. Copiar primero `package*.json`, instalar y después copiar el resto deja la instalación en caché mientras el manifiesto no cambie.
3. **`docker compose down` tarda diez segundos por contenedor.** `node` como PID 1 no instala manejador para `SIGTERM`, y el kernel no le aplica a ese proceso la acción por omisión de la señal, así que Docker agota el tiempo de gracia y lo mata con `SIGKILL`. Medido aquí con un servidor que no hace nada: 10,9 s con `CMD ["node", "servidor.js"]`, 1,1 s con `init: true` en el servicio del compose (Docker antepone un `init` diminuto que sí reenvía señales) y 0,9 s con `CMD ["npm", "start"]`, porque npm reenvía la señal al hijo.
4. **Healthcheck con `curl` en `node:20-slim`.** El estado queda en `(unhealthy)` y el registro del chequeo dice `/bin/sh: 1: curl: not found`. La imagen slim no lo trae; el chequeo va con `node -e` y `fetch`, o con `wget -q --spider` en la variante alpine.
5. **`BACKEND_URL` apuntando a `localhost`.** El frontend responde `504` a `/api/health` y su log muestra `[HPM] Error occurred while proxying request localhost:8081/api/health to http://localhost:5000/ [ECONNREFUSED]`. Dentro del contenedor, `localhost` es el contenedor mismo; el backend se alcanza por el nombre de su servicio en la red de Compose.

### Enlaces

- [Referencia del Dockerfile](https://docs.docker.com/reference/dockerfile/): todas las instrucciones (`FROM`, `COPY`, `RUN`, `USER`, `CMD`, `HEALTHCHECK`) con su sintaxis y la diferencia entre la forma exec y la forma shell.
- [Imagen oficial `node`](https://hub.docker.com/_/node): qué trae cada variante (`20`, `20-slim`, `20-alpine`), el usuario `node` y cómo se arranca una aplicación dentro de la imagen.
- [`npm ci`](https://docs.npmjs.com/cli/v10/commands/npm-ci): por qué exige el lock, qué borra antes de instalar y la opción `--omit=dev`.
- [`npm install`](https://docs.npmjs.com/cli/v10/commands/npm-install): la instalación que sí resuelve versiones, y `--package-lock-only` para generar el lock sin instalar nada.
- [Buenas prácticas de construcción](https://docs.docker.com/build/building/best-practices/): orden de las capas para aprovechar la caché, `.dockerignore`, un proceso por contenedor.
- [Objetos globales de Node 20](https://nodejs.org/docs/latest-v20.x/api/globals.html): el `fetch` con el que se escribe el healthcheck sin instalar nada.

## Parte 2: Dockerfile del backend

El backend es Flask con `psycopg2` sobre Python 3.11, servido con Gunicorn. Lee las cinco variables de la base de datos en cada petición y no trae valores por defecto para ellas, salvo el puerto.

### Lo que se usa

- `FROM python:3.11-slim`: Debian con Python y pip, sin compiladores y sin `curl` ni `wget` (188 MB aquí; `python:3.11` completo pesa 1,61 GB). Alcanza para este ejercicio porque las tres dependencias llegan como ruedas binarias.
- `COPY requirements.txt .` y `RUN pip install --no-cache-dir -r requirements.txt`: instala las versiones fijadas en el archivo. `--no-cache-dir` evita que las descargas de pip queden guardadas en la capa.
- `psycopg2-binary`: la rueda trae `libpq` compilada, así que en slim no hacen falta `gcc` ni `libpq-dev`. Con `psycopg2` a secas la instalación compila y pide ambos.
- `gunicorn --bind 0.0.0.0:<puerto> --workers 2 módulo:variable`: el servidor WSGI. `módulo` es el nombre del archivo sin `.py`, buscado desde el `WORKDIR`, y `variable` el objeto `Flask(__name__)` que ese archivo define; en el ejemplo de abajo es `horario:aplicacion`, y para otro archivo se lee el código y se arma igual. `--bind 0.0.0.0` hace que escuche en todas las interfaces del contenedor, que es lo que permite que otro contenedor lo alcance; `--workers` es el número de procesos que atienden peticiones.
- `EXPOSE <puerto>`: documenta el puerto; el backend no necesita `ports:` en el compose porque solo lo consume el frontend por la red interna.
- `ENV PYTHONUNBUFFERED=1`: los `print` del código salen enseguida a `docker compose logs` en vez de quedarse en el búfer. Gunicorn escribe su propio log a stderr sin búfer.
- `HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:<puerto>/<ruta>')"`: `urlopen` lanza `HTTPError` si el servidor responde 4xx o 5xx y `URLError` si no conecta; en ambos casos `python -c` sale con 1, y con 0 si la respuesta es 2xx. El mismo chequeo puede ir en el `healthcheck:` del compose en lugar del Dockerfile; si está en los dos, manda el del compose.
- `wget -q --spider http://localhost:<puerto>/<ruta>`: la alternativa cuando la imagen sí trae `wget` (alpine). `--spider` no descarga el cuerpo y sale con 1 ante un 404.

### Ejemplo

Una API que devuelve la hora de Cali, sin base de datos. Tres archivos en una carpeta `horario-api/`. El archivo se llama `horario.py` y el objeto Flask, `aplicacion`; de ahí sale el `horario:aplicacion` que recibe Gunicorn:

```python
# horario.py: dos rutas, la hora y un chequeo de salud
from datetime import datetime, timezone, timedelta
from flask import Flask, jsonify

aplicacion = Flask(__name__)
CALI = timezone(timedelta(hours=-5))


@aplicacion.route("/hora")
def hora():
    # Devuelve la hora local de Cali en JSON
    return jsonify(hora=datetime.now(CALI).strftime("%Y-%m-%d %H:%M:%S"))


@aplicacion.route("/salud")
def salud():
    return jsonify(status="ok")
```

```
# requirements.txt
Flask==3.0.3
gunicorn==22.0.0
```

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Sin caché de pip la capa queda más liviana
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 9000

# La imagen slim no trae curl: el chequeo se hace con la urllib de Python
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:9000/salud')"

CMD ["gunicorn", "--bind", "0.0.0.0:9000", "--workers", "2", "horario:aplicacion"]
```

Construir, correr publicando el puerto y consultar:

```bash
docker build -t horario-api .
docker run -d --name horario-api -p 9001:9000 horario-api
curl http://localhost:9001/hora
docker ps --filter name=horario-api --format '{{.Names}}  {{.Status}}'
docker logs horario-api
docker rm -f horario-api
```

Salida recortada:

```
#8 [4/5] RUN pip install --no-cache-dir -r requirements.txt
#8 DONE 3.4s
#9 [5/5] COPY . .

{"hora":"2026-09-16 15:11:41"}

horario-api  Up 13 seconds (healthy)

[2026-09-16 20:11:38 +0000] [1] [INFO] Starting gunicorn 22.0.0
[2026-09-16 20:11:38 +0000] [1] [INFO] Listening at: http://0.0.0.0:9000 (1)
[2026-09-16 20:11:38 +0000] [1] [INFO] Using worker: sync
[2026-09-16 20:11:38 +0000] [7] [INFO] Booting worker with pid: 7
[2026-09-16 20:11:38 +0000] [8] [INFO] Booting worker with pid: 8
```

La imagen pesa 213 MB. `-p 9001:9000` publica en el 9001 del host el 9000 del contenedor, y por eso el `curl` va al 9001. El `(healthy)` aparece después del primer chequeo exitoso, unos diez segundos después de arrancar, porque el primero corre cuando se cumple el `interval`.

### Lo que suele fallar

1. **Gunicorn escuchando en `127.0.0.1`.** Desde el host, `curl` responde `curl: (56) Recv failure: Connection reset by peer`; desde el frontend, `ECONNREFUSED`. El proceso solo acepta conexiones que nacen dentro del mismo contenedor. Se corrige con `--bind 0.0.0.0:<puerto>`.
2. **`curl` en el healthcheck de una imagen slim.** Cada chequeo termina con `/bin/sh: 1: curl: not found`, tras `retries` fallos el contenedor pasa a `(unhealthy)` y `docker compose up --wait` se rinde con `dependency failed to start: container ... is unhealthy`. El chequeo va con `python -c` y `urllib`.
3. **`módulo:variable` que no existe.** Con el ejemplo de arriba, `gunicorn principal:aplicacion` muere con `ModuleNotFoundError: No module named 'principal'`, porque el archivo se llama `horario.py`, y `gunicorn horario:app` con `Failed to find attribute 'app' in 'horario'`, porque el objeto se llama `aplicacion`. El módulo se busca desde el `WORKDIR`: si el `COPY` dejó el archivo en otra carpeta, tampoco lo encuentra.
4. **Variables de entorno sin definir.** El contenedor arranca, pero `/api/health` responde `503` y el campo `error` del cuerpo dice `'DB_HOST'`: el código hace `os.environ["DB_HOST"]` en cada petición y el `KeyError` sale como texto. Las cinco variables se definen en el `environment:` del compose, y `DB_HOST` es el nombre del servicio de Postgres.
5. **Arrancar con `python app.py`.** Responde, pero el log dice `WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.`. El README pide Gunicorn; el bloque `if __name__ == "__main__"` de `app.py` es el que corre en ese caso y no se ejecuta bajo Gunicorn.

### Enlaces

- [Imagen oficial `python`](https://hub.docker.com/_/python): variantes `3.11`, `3.11-slim` y `3.11-alpine`, y cómo se instala `requirements.txt` dentro de la imagen.
- [Cómo correr Gunicorn](https://docs.gunicorn.org/run/): la forma `MODULE_NAME:VARIABLE_NAME` y las opciones `--bind` y `--workers`.
- [Flask con Gunicorn](https://flask.palletsprojects.com/en/stable/deploying/gunicorn/): por qué el servidor de desarrollo no se usa para servir y cómo se apunta Gunicorn al objeto `app`.
- [`urllib.request`](https://docs.python.org/3/library/urllib.request.html): `urlopen`, las excepciones `HTTPError` y `URLError` con las que se arma el healthcheck.
- [Instalación de psycopg2](https://www.psycopg.org/docs/install.html): diferencia entre `psycopg2` y `psycopg2-binary` y qué necesita cada uno para instalarse.
- [`HEALTHCHECK` en el Dockerfile](https://docs.docker.com/reference/dockerfile/#healthcheck): opciones `--interval`, `--timeout`, `--start-period`, `--retries` y qué significa cada código de salida.

## Parte 3: docker-compose.yml

El compose declara los tres servicios, cómo se construyen o de qué imagen salen, con qué variables arrancan, en qué orden y con qué chequeo de salud, y qué puerto ve el host. La red y la resolución de nombres las pone Compose sin que haya que declararlas.

### Lo que se usa

- `services`: un servicio por contenedor. El nombre del servicio es el nombre de host con el que los demás lo alcanzan: si el servicio de Postgres se llama `db`, el backend se conecta a `db:5432`.
- `image: postgres:16`: usa una imagen ya construida. `build:` con `context: ./api` y `dockerfile: Dockerfile` (ruta relativa al contexto) construye la del servicio; Compose la etiqueta `<proyecto>-<servicio>`, y el proyecto es el nombre de la carpeta donde está el compose.
- `environment`: variables para el contenedor, como mapa `NOMBRE: valor` o como lista `- NOMBRE=valor`. Entre comillas lo que YAML pueda leer como booleano (`yes`, `no`, `on`, `off`) y, por costumbre, los números. `${VAR}` se sustituye con el valor que tenga la shell o el archivo `.env` cuando Compose lee el archivo; `$$` deja un `$` literal para que lo vea la shell del contenedor.
- `ports`: `"8080:8080"` es `host:contenedor` y publica el puerto en la máquina. `expose:` solo lo documenta. Entre contenedores de la misma red todos los puertos son alcanzables, estén publicados o no, así que `expose` no cambia nada del tráfico interno.
- `depends_on`: en forma corta (lista de nombres) solo ordena el arranque. En forma larga, `db: {condition: service_healthy}` espera a que el healthcheck de `db` pase; `service_started` espera solo a que arranque y `service_completed_successfully` a que termine con código 0.
- `healthcheck`: `test` como `["CMD", "programa", "arg"]` (sin shell, sin expansión de variables), `["CMD-SHELL", "una línea"]` (pasa por `sh -c`) o una cadena, que equivale a `CMD-SHELL`. `interval` es el tiempo entre chequeos, `timeout` lo que espera cada uno, `retries` los fallos seguidos que hacen falta para marcar `unhealthy` y `start_period` el tiempo inicial durante el cual los fallos no cuentan; un acierto en ese periodo sí cuenta. El primer chequeo corre cuando se cumple el primer `interval`.
- `volumes` dentro de un servicio: `./database/init.sql:/docker-entrypoint-initdb.d/init.sql:ro` monta un archivo del host (ruta relativa al compose) en el contenedor, solo lectura; `datos:/var/lib/postgresql/data` monta un volumen con nombre, que se declara en el `volumes:` de nivel superior y sobrevive a `down` hasta que se corre `down -v`.
- La red por omisión: Compose crea `<proyecto>_default`, conecta ahí todos los servicios y el DNS interno de Docker resuelve cada nombre de servicio a la IP de su contenedor. Dentro de un contenedor, `getent hosts db` lo muestra.
- `postgres:16`: `POSTGRES_PASSWORD` es exigida; `POSTGRES_USER` (por omisión `postgres`) es el superusuario y `POSTGRES_DB` (por omisión igual al usuario) la base que crea. La primera vez que arranca con el directorio de datos vacío corre `initdb`, levanta un servidor temporal que solo escucha en el socket Unix, ejecuta en orden alfabético los `*.sql` y `*.sh` de `/docker-entrypoint-initdb.d/`, apaga ese servidor y arranca el definitivo. Si el directorio ya tiene datos, se salta todo eso.
- `pg_isready -h localhost -U usuario -d base`: sale con 0 si el servidor acepta conexiones, 1 si las rechaza (está arrancando), 2 si no responde y 3 si los argumentos están mal. No autentica: con un usuario inexistente sigue devolviendo 0, pero el log de Postgres se llena de `FATAL: role "root" does not exist` en cada chequeo. `-h localhost` fuerza TCP, que el servidor temporal de la inicialización no abre (`listen_addresses=''` en el entrypoint de la imagen); sin `-h` el chequeo usa el socket, donde ese servidor temporal sí contesta.
- `init: true`: Docker antepone un `init` que reenvía señales al proceso del contenedor. Sirve cuando el proceso principal es `node`.

### Ejemplo

Una base con una tabla de frutas y una API mínima, en `http.server` de la biblioteca estándar, que la consulta. La API lee cinco variables con nombres propios (`BASE_HOST`, `BASE_PUERTO`, `BASE_NOMBRE`, `BASE_USUARIO`, `BASE_CLAVE`); los nombres que espera un programa se leen en su código. La carpeta `frutas/` tiene esta forma:

```
frutas/
├── docker-compose.yml
├── db/
│   └── init.sql
└── api/
    ├── Dockerfile
    ├── requirements.txt
    └── servidor.py
```

```sql
-- db/init.sql: esquema y datos semilla
CREATE TABLE frutas (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(40) NOT NULL,
    precio INTEGER     NOT NULL
);

INSERT INTO frutas (nombre, precio) VALUES
    ('guayaba', 1200),
    ('lulo', 3500),
    ('chontaduro', 2000),
    ('borojó', 4000),
    ('zapote', 2500);
```

```python
# api/servidor.py: responde con las frutas de la base y un chequeo de salud
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

import psycopg2


def conectar():
    # Las cinco variables llegan desde docker-compose.yml
    return psycopg2.connect(
        host=os.environ["BASE_HOST"],
        port=int(os.environ["BASE_PUERTO"]),
        dbname=os.environ["BASE_NOMBRE"],
        user=os.environ["BASE_USUARIO"],
        password=os.environ["BASE_CLAVE"],
    )


class Manejador(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            with conectar() as conn, conn.cursor() as cur:
                if self.path == "/salud":
                    cur.execute("SELECT 1")
                    cuerpo, codigo = {"status": "ok"}, 200
                else:
                    cur.execute("SELECT nombre, precio FROM frutas ORDER BY precio")
                    filas = [{"nombre": n, "precio": p} for n, p in cur.fetchall()]
                    cuerpo, codigo = {"total": len(filas), "frutas": filas}, 200
        except Exception as e:
            cuerpo, codigo = {"status": "error", "error": str(e)}, 503
        datos = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(datos)


if __name__ == "__main__":
    print("api escuchando en :8000", flush=True)
    HTTPServer(("0.0.0.0", 8000), Manejador).serve_forever()
```

```
# api/requirements.txt
psycopg2-binary==2.9.9
```

```dockerfile
# api/Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY servidor.py .
CMD ["python", "servidor.py"]
```

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: frutero
      POSTGRES_PASSWORD: guayaba
      POSTGRES_DB: mercado
    volumes:
      # Postgres corre todo *.sql de esta carpeta la primera vez que inicia
      - ./db/init.sql:/docker-entrypoint-initdb.d/01-frutas.sql:ro
      - datos:/var/lib/postgresql/data
    expose:
      - "5432"
    healthcheck:
      # -h localhost fuerza TCP: el servidor temporal de la inicialización no lo abre
      test: ["CMD-SHELL", "pg_isready -h localhost -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 30s

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    environment:
      BASE_HOST: db
      BASE_PUERTO: "5432"
      BASE_NOMBRE: mercado
      BASE_USUARIO: frutero
      BASE_CLAVE: guayaba
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/salud')"]
      interval: 5s
      timeout: 3s
      retries: 3
      start_period: 5s

volumes:
  datos:
```

Levantar, consultar por fuera y por dentro, y apagar:

```bash
docker compose up -d --wait --wait-timeout 90
docker compose ps
curl http://localhost:8000/
docker compose exec api getent hosts db
docker compose exec db psql -U frutero -d mercado -c 'SELECT nombre, precio FROM frutas ORDER BY precio LIMIT 2;'
docker compose logs --tail 1 db
docker compose down -v
```

Salida recortada:

```
 Volume frutas_datos Created
 Network frutas_default Created
 Container frutas-db-1 Started
 Container frutas-db-1 Healthy
 Container frutas-api-1 Started
 Container frutas-api-1 Healthy

NAME           IMAGE         COMMAND                  SERVICE   CREATED          STATUS                    PORTS
frutas-api-1   frutas-api    "python servidor.py"     api       24 seconds ago   Up 10 seconds (healthy)   0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
frutas-db-1    postgres:16   "docker-entrypoint.s…"   db        24 seconds ago   Up 23 seconds (healthy)   5432/tcp

{"total": 5, "frutas": [{"nombre": "guayaba", "precio": 1200}, {"nombre": "chontaduro", "precio": 2000}, {"nombre": "zapote", "precio": 2500}, {"nombre": "lulo", "precio": 3500}, {"nombre": "borojó", "precio": 4000}]}

172.20.0.2      db

   nombre   | precio
------------+--------
 guayaba    |   1200
 chontaduro |   2000
(2 rows)

db-1  | 2026-09-16 20:12:55.457 UTC [1] LOG:  database system is ready to accept connections

 Container frutas-api-1 Removed
 Container frutas-db-1 Removed
 Volume frutas_datos Removed
 Network frutas_default Removed
```

El `up --wait` tardó 19,3 s en esta máquina, casi todo en la primera inicialización de Postgres, que crea el directorio de datos y corre `init.sql` antes de abrir el puerto. Los cinco segundos del README son lo que tarda en aceptar conexiones una vez está `running`, sin contar esa inicialización. `api` solo arrancó cuando `db` ya estaba `Healthy`, la columna PORTS muestra que solo `api` está publicado, y `getent hosts db` dentro de `api` resuelve el nombre del servicio a la IP del contenedor de Postgres.

### Lo que suele fallar

1. **`condition: service_healthy` sobre un servicio sin `healthcheck`.** `up --wait` se detiene enseguida con `dependency failed to start: container frutas-db-1 has no healthcheck configured`. La condición necesita un chequeo que consultar; sin él no hay nada que esperar.
2. **Un healthcheck más corto que el arranque de Postgres.** Con `start_period: 10s` y `retries: 5` el mismo compose falló aquí con `dependency failed to start: container frutas-db-1 is unhealthy`, porque la primera inicialización tardó 35 s y los cinco fallos seguidos después del periodo de gracia marcaron el contenedor antes de que el servidor definitivo abriera el puerto. Postgres terminó arrancando bien, pero Compose ya se había rendido. Un `start_period` holgado y `retries` generosos no cuestan nada cuando todo va rápido; el techo lo pone `--wait-timeout`.
3. **`$POSTGRES_USER` con un solo `$` en el `test`.** Compose lo sustituye al leer el archivo con lo que tenga la shell del host, avisa `The "POSTGRES_USER" variable is not set. Defaulting to a blank string.` y el chequeo queda como `pg_isready -h localhost -U  -d`. Con `$$` la variable llega intacta a la shell del contenedor, que sí la tiene.
4. **Cambiar `init.sql` y no ver el cambio.** El log de `db` dice `PostgreSQL Database directory appears to contain a database; Skipping initialization`: los scripts corren una sola vez, cuando el directorio de datos está vacío, y el volumen del intento anterior sigue ahí. `docker compose down -v` lo borra y el siguiente `up` vuelve a inicializar.
5. **`depends_on` en forma corta y sin healthchecks.** `up --wait` termina con código 0 en 1,9 s y todo aparece `Healthy`, porque un contenedor sin chequeo cuenta como sano apenas está `running`. Pero la API responde `{"status": "error", "error": "connection to server at \"db\" (172.20.0.2), port 5432 failed: Connection refused"}` hasta que Postgres termina de arrancar, y en el flujo de Actions los pasos que no reintentan fallan.

### Enlaces

- [Referencia de `services`](https://docs.docker.com/reference/compose-file/services/): `build`, `image`, `environment`, `ports`, `expose`, `depends_on`, `healthcheck`, `init` y `volumes` de un servicio, con la forma corta y la larga de cada uno.
- [Redes en Compose](https://docs.docker.com/compose/how-tos/networking/): la red por omisión, cómo un servicio alcanza a otro por su nombre y por qué `ports` no hace falta para el tráfico interno.
- [Referencia de `volumes`](https://docs.docker.com/reference/compose-file/volumes/): volúmenes con nombre de nivel superior frente a montajes de archivos del host.
- [Interpolación de variables](https://docs.docker.com/reference/compose-file/interpolation/): `${VAR}`, el archivo `.env` y `$$` para dejar un `$` literal.
- [Imagen oficial `postgres`](https://hub.docker.com/_/postgres): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, la carpeta `/docker-entrypoint-initdb.d/` y dónde guarda los datos.
- [`pg_isready`](https://www.postgresql.org/docs/16/app-pg-isready.html): opciones `-h`, `-U`, `-d` y el significado de cada código de salida.

## Parte 4: probar en la máquina propia antes de subir

El flujo de Actions corre `docker compose build`, `docker compose up -d --wait --wait-timeout 90`, cuatro `curl` contra `localhost:8080` y `docker compose down -v`. Todo eso se repite en la máquina propia con los mismos comandos, y ahí se ve el error completo en lugar de un paso en rojo. De esa misma corrida se copian, en texto, el `docker compose ps` y los `curl` que pide el `Informe.md`.

### Lo que se usa

- `docker compose config --quiet`: valida el YAML y la interpolación; sin `--quiet` imprime el archivo ya resuelto, con las variables sustituidas y los valores por omisión rellenados.
- `docker compose build [servicio]`: construye las imágenes de los servicios que tienen `build:`. `--no-cache` ignora la caché de capas.
- `docker compose up -d --wait --wait-timeout 90`: crea red, volúmenes y contenedores, los arranca respetando `depends_on` y, con `--wait`, espera a que todos estén `running` o `healthy` antes de devolver el control. Falla si un contenedor queda `unhealthy`, si uno sale con error o si se pasa de los segundos de `--wait-timeout`. `--build` reconstruye las imágenes antes de levantar.
- `docker compose ps [-a]`: estado de los contenedores del proyecto; la columna STATUS muestra `(health: starting)`, `(healthy)` o `(unhealthy)`. `-a` incluye los que ya salieron.
- `docker compose logs -f --tail 60 [servicio]`: salida de los contenedores, con el nombre del servicio adelante de cada línea. `-f` sigue en vivo hasta Ctrl+C; `--tail` limita cuántas líneas viejas muestra.
- `docker compose exec servicio comando`: corre un comando dentro de un contenedor que ya está arriba, por ejemplo `psql`, `getent hosts`, `sh` o `env`.
- `docker compose down [-v]`: para y borra los contenedores y la red. `-v` borra también los volúmenes con nombre y los anónimos, que es lo que hace falta para que Postgres vuelva a correr `init.sql`.
- `docker inspect --format '{{json .State.Health}}' <contenedor>`: el registro de los últimos chequeos de salud con la salida de cada uno; ahí aparece el `curl: not found` o el `no response` de `pg_isready`.
- `curl -fsS <url>`: `-f` sale con código 22 si el servidor responde 4xx o 5xx, `-s` calla la barra de progreso y `-S` deja pasar los errores. Es lo que usa el flujo dentro de un `for` que reintenta hasta veinte veces.
- El runner `ubuntu-latest` trae Docker Engine y el plugin de Compose instalados; el último paso lleva `if: always()` para que `down -v` corra aunque un paso anterior haya fallado.

### Ejemplo

Un script que repite sobre la carpeta `frutas/` de la parte anterior lo que hace el flujo: levantar, esperar con reintentos, comprobar un valor de la respuesta y apagar.

```bash
#!/usr/bin/env bash
# probar.sh: repite a mano lo que hace el flujo de Actions
set -euo pipefail

docker compose build --quiet
docker compose up -d --wait --wait-timeout 90

# Reintenta hasta 20 veces, como el flujo, por si el servidor tarda un segundo más
for i in $(seq 1 20); do
  if cuerpo=$(curl -fsS http://localhost:8000/salud 2>/dev/null) \
     && grep -q '"status": "ok"' <<<"$cuerpo"; then
    echo "salud ok en el intento $i"
    break
  fi
  sleep 2
done

total=$(curl -fsS http://localhost:8000/ | python3 -c 'import sys, json; print(json.load(sys.stdin)["total"])')
test "$total" -eq 5 && echo "total correcto: $total"

docker compose down -v >/dev/null
echo "apagado"
```

```bash
chmod +x probar.sh
time ./probar.sh
```

Lo que queda tras quitar las líneas de progreso de Compose (`Created`, `Started`, `Healthy`, `Removed`), que van por stderr y ya se vieron:

```
salud ok en el intento 1
total correcto: 5
apagado
./probar.sh  0,28s user 0,14s system 1% cpu 31,862 total
```

Con `set -e`, cualquier `curl -f` que reciba un 5xx o cualquier `test` que no cuadre corta el script con código distinto de 0, que es lo mismo que pone en rojo un paso del flujo.

### Lo que suele fallar

1. **`Bind for 0.0.0.0:8000 failed: port is already allocated`.** Otro contenedor, o un proceso del host, ya escucha en ese puerto. `docker ps` muestra si es un contenedor de un intento anterior; `ss -ltnp` muestra el proceso en Linux.
2. **Se cambió un `Dockerfile` y `up -d` sigue usando la imagen vieja.** `up` construye la imagen solo cuando no existe; si ya está, la usa tal cual aunque el Dockerfile haya cambiado. `docker compose up -d --build`, o `build` antes de `up`.
3. **`down` sin `-v` y los datos viejos siguen ahí.** Los contenedores desaparecen pero el volumen con nombre no, y en el siguiente `up` Postgres salta la inicialización. Con `down -v` se borra el volumen; en el flujo el último paso ya lo lleva.
4. **Ruta mal escrita en el montaje de `init.sql`.** Docker crea en el host un directorio vacío con ese nombre, propiedad de root, y lo monta; Postgres falla con `psql:/docker-entrypoint-initdb.d/01-frutas.sql: error: could not read from input file: Is a directory` y `up --wait` termina con `dependency failed to start: container frutas-db-1 exited (1)`. Hay que borrar el directorio que quedó y corregir la ruta, que es relativa a la carpeta del compose.
5. **`docker-compose` con guion.** Es el nombre de la versión 1, escrita en Python y retirada, que no conoce `--wait`. En algunas distribuciones el mismo nombre apunta a la versión nueva; `docker compose version` tiene que responder con 2.x o superior, y el flujo usa `docker compose` con espacio.

### Enlaces

- [Comandos de `docker compose`](https://docs.docker.com/reference/cli/docker/compose/): índice con `build`, `config`, `exec`, `ps` y los demás subcomandos.
- [`docker compose up`](https://docs.docker.com/reference/cli/docker/compose/up/): `-d`, `--wait`, `--wait-timeout`, `--build` y cómo se comporta cuando un servicio ya existe.
- [`docker compose logs`](https://docs.docker.com/reference/cli/docker/compose/logs/): `-f`, `--tail`, `--since` y el filtro por servicio.
- [`docker compose down`](https://docs.docker.com/reference/cli/docker/compose/down/): qué borra por omisión y qué agrega `-v` y `--rmi`.
- [Sintaxis de los flujos de GitHub Actions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions): `on`, `jobs`, `steps`, `run` e `if: always()`, que es lo que lee el `pruebas.yml` del repositorio.
- [Runners de GitHub](https://docs.github.com/en/actions/using-github-hosted-runners/using-github-hosted-runners/about-github-hosted-runners): qué trae `ubuntu-latest`, incluidos Docker y Compose.

## Cómo compilar y ejecutar en la máquina propia

Hace falta Docker Engine con el plugin de Compose, versión 2 o superior. Las tres imágenes base (`node:20`, `python:3.11-slim`, `postgres:16`) están publicadas para `amd64` y `arm64`, así que el mismo compose corre en un portátil Intel y en uno con chip Apple sin banderas de plataforma.

**Debian y Ubuntu.** El paquete `docker.io` de los repositorios de Debian y de Ubuntu anteriores a 23.04 viene sin Compose 2; lo más simple es el repositorio de Docker:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"   # cerrar sesión y volver a entrar para que aplique
docker compose version
```

En Debian se cambia `ubuntu` por `debian` en las dos direcciones. Después de entrar de nuevo, `docker run --rm hello-world` sin `sudo` confirma que el grupo quedó aplicado. En esta máquina corrió Docker 29.8.0 con Compose 5.5.1.

**Windows con WSL2.** Docker Desktop con el motor en WSL2 es el camino corto: se instala en Windows, se activa la integración con la distribución de Ubuntu en sus ajustes, y `docker compose` queda disponible en la terminal de WSL. El repositorio se clona dentro del sistema de archivos de Linux (`~/`), no en `/mnt/c/...`: los montajes de archivos desde `/mnt/c` son lentos y los permisos salen raros. `localhost:8080` en el navegador de Windows llega al contenedor porque WSL2 reenvía los puertos. Antes de clonar conviene `git config --global core.autocrlf input`, porque un `init.sql` o un script con finales de línea CRLF no se lee igual dentro del contenedor. También se puede instalar Docker Engine directamente dentro de la distribución con las mismas órdenes de Debian y Ubuntu, sin Docker Desktop.

**macOS.** Docker Desktop, OrbStack o Colima; cualquiera de los tres da `docker compose`. En un Mac con chip Apple las imágenes se descargan en su variante `arm64` y no hace falta `platform:` en el compose. `xdg-open` no existe: para abrir la interfaz es `open http://localhost:8080`.

- [Instalar Docker Engine en Ubuntu](https://docs.docker.com/engine/install/ubuntu/): el repositorio, los paquetes y cómo verificar la instalación.
- [Instalar Docker Engine en Debian](https://docs.docker.com/engine/install/debian/): lo mismo para Debian.
- [Pasos después de instalar en Linux](https://docs.docker.com/engine/install/linux-postinstall/): el grupo `docker` para no usar `sudo` y el arranque del servicio.
- [Docker Desktop sobre WSL2](https://docs.docker.com/desktop/features/wsl/): el motor en WSL2 y la integración con cada distribución.
- [Instalar WSL](https://learn.microsoft.com/en-us/windows/wsl/install): cómo se habilita WSL2 y se instala Ubuntu desde Windows.
- [Instalar Docker Desktop en Mac](https://docs.docker.com/desktop/setup/install/mac-install/): requisitos para Intel y para chip Apple.
