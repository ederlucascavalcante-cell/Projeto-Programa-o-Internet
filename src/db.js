// src/db.js
// Ponto único de acesso ao MySQL. Toda rota importa esse pool em vez de abrir
// conexão própria — se cada arquivo de rota criasse sua própria conexão,
// seria duplicar a mesma configuração em vários lugares (viola DRY) e não
// teria controle de quantas conexões simultâneas o app abre.

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'if_fitness',
    // Sem isso, o driver conecta com charset padrão diferente do utf8mb4 que
    // as tabelas usam, e todo acento vira mojibake (ex: "máquina" virando
    // "mÃ¡quina" na resposta JSON) — não é cosmético, é leitura errada do byte.
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    // Manda pacotes keep-alive na conexão TCP; sem isso, uma conexão ociosa pode ser
    // derrubada por baixo (suspensão do PC, reinício do MySQL, rede) e o pool só
    // descobre isso quando entrega a conexão morta pra uma rota (ECONNRESET).
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    maxIdle: 5,
    idleTimeout: 30000
});

module.exports = pool;
