CREATE TABLE IF NOT EXISTS candidates (
    id     SERIAL PRIMARY KEY,
    name   VARCHAR(120) NOT NULL,
    emoji  VARCHAR(20)  NOT NULL,
    slogan TEXT         NOT NULL,
    wins   INTEGER      NOT NULL DEFAULT 0,
    losses INTEGER      NOT NULL DEFAULT 0
);

INSERT INTO candidates (name, emoji, slogan) VALUES
    ('Don Pancracio Patacón',          '🍌', 'Voy a freír la corrupción de un solo lado'),
    ('Doña Aguardiente Aluciña',       '🥃', 'Un brindis para todos, especialmente para mi círculo cercano'),
    ('Coronel Sancocho Tres Carnes',   '🍲', 'Hervir la economía a fuego lento, pero con sabor a leña'),
    ('El Tigre del Pacífico',          '🐯', 'Champeta presidencial: que vibre el país entero'),
    ('La Reina del Chontaduro',        '🌴', 'Postre, poder y mucho aceite del bueno'),
    ('Profesor Lulada Cósmica',        '🧊', 'Educación con sabor, hielo y dignidad'),
    ('Don Pandebono del Valle',        '🥯', 'Pan, circo y queso costeño para el pueblo'),
    ('Capitán Champús Galáctico',      '🛸', 'Despegamos hacia las estrellas con maíz dulce'),
    ('Doctor Empanadita Frita',        '🥟', 'Salud, aceite hirviendo y diagnóstico picante'),
    ('Doña Marranita Pelaita',         '🐷', 'Limpieza total del Estado, sin perdón ni perejil'),
    ('Senadora Lechona Express',       '🐖', 'Servicio público al instante, envuelta en hoja de plátano'),
    ('Don Tamal Tolimense',            '🌽', 'Envuelto en hojas de la patria, atado con pita'),
    ('El Llanero Sin Hashtag',         '🐎', 'Cabalgo por el pueblo sin necesidad de redes sociales'),
    ('Doña Ají Pique',                 '🌶️', 'Tolerancia cero al insulso, picante para todos'),
    ('Mr. Buñuelo del Norte',          '🟤', 'Tradición, redondez y perfección dorada'),
    ('General Mecato Combinado',       '🍿', 'Estrategia: dulce, salado y un Bonyurt al final del día');
