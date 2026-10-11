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
    dateStrings: true // evita fuso-horário implícito do driver mexendo em DATETIME/DATE
});

module.exports = pool;
