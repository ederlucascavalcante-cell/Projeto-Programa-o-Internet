// src/routes/estatisticas.routes.js
// Leituras agregadas sobre o histórico de treinos do usuário logado. Tudo
// aqui é derivado de treinos_realizados / treino_series — nenhuma tabela nova
// (DRY: guardar contadores prontos duplicaria dado que já existe e poderia
// divergir dele). Só conta treino FINALIZADO e série CONCLUÍDA, as mesmas
// regras que o histórico e o volume_total_kg já usam.
const express = require('express');
const pool = require('../db');
const { exigirLogin } = require('../middleware/auth');

const router = express.Router();
router.use(exigirLogin);

// ---- Regra de negócio do volume músculo-série ----
const PESO_GRUPO_PRIMARIO = 1.0;
const PESO_GRUPO_SECUNDARIO = 0.5;

const SEMANAS_NO_GRAFICO = 8;

// Início de cada período, calculado pelo banco (mesmo relógio do NOW() que
// grava iniciado_em). Semana começa na segunda (WEEKDAY: segunda = 0).
// ATENÇÃO: estes valores são interpolados no SQL — por isso são constantes
// do servidor, escolhidas por whitelist abaixo, nunca texto vindo do cliente.
const INICIO_DO_PERIODO = {
    semana: 'DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)',
    mes: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
    ano: "DATE_FORMAT(CURDATE(), '%Y-01-01')"
};

function somarDias(dataIso, dias) {
    const d = new Date(dataIso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

// GET /api/estatisticas/semanal — últimas 8 semanas (incluindo a atual), com
// semanas sem treino preenchidas com zero: o gráfico de barras precisa do
// eixo contínuo, senão semana parada simplesmente "some" e distorce a leitura.
router.get('/semanal', async (req, res) => {
    try {
        const [[{ segunda }]] = await pool.query(
            "SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), '%Y-%m-%d') AS segunda"
        );

        const [linhas] = await pool.query(
            `SELECT DATE_FORMAT(DATE_SUB(DATE(iniciado_em), INTERVAL WEEKDAY(iniciado_em) DAY), '%Y-%m-%d') AS inicio,
                    COUNT(*) AS treinos,
                    COALESCE(SUM(volume_total_kg), 0) AS volume_kg,
                    COALESCE(SUM(TIMESTAMPDIFF(MINUTE, iniciado_em, finalizado_em)), 0) AS duracao_min
             FROM treinos_realizados
             WHERE usuario_id = ? AND finalizado_em IS NOT NULL
               AND iniciado_em >= DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL ? WEEK)
             GROUP BY inicio`,
            [req.session.usuarioId, SEMANAS_NO_GRAFICO - 1]
        );

        const porInicio = {};
        linhas.forEach(l => { porInicio[l.inicio] = l; });

        const semanas = [];
        for (let i = SEMANAS_NO_GRAFICO - 1; i >= 0; i--) {
            const inicio = somarDias(segunda, -7 * i);
            const l = porInicio[inicio];
            semanas.push({
                inicio,
                treinos: l ? Number(l.treinos) : 0,
                volume_kg: l ? Number(l.volume_kg) : 0,
                duracao_min: l ? Number(l.duracao_min) : 0
            });
        }
        res.json(semanas);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao calcular estatísticas semanais.' });
    }
});

// GET /api/estatisticas/calendario?mes=YYYY-MM — treinos finalizados do mês,
// um por linha; o front agrupa por dia (um dia pode ter mais de um treino).
router.get('/calendario', async (req, res) => {
    const mes = req.query.mes;
    if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
        return res.status(400).json({ erro: 'Informe o mês no formato AAAA-MM.' });
    }
    const primeiroDia = mes + '-01';

    try {
        const [linhas] = await pool.query(
            `SELECT id, nome_treino, volume_total_kg,
                    DATE_FORMAT(iniciado_em, '%Y-%m-%d') AS dia
             FROM treinos_realizados
             WHERE usuario_id = ? AND finalizado_em IS NOT NULL
               AND iniciado_em >= ? AND iniciado_em < DATE_ADD(?, INTERVAL 1 MONTH)
             ORDER BY iniciado_em`,
            [req.session.usuarioId, primeiroDia, primeiroDia]
        );
        res.json(linhas.map(l => ({
            id: l.id,
            nome_treino: l.nome_treino,
            volume_total_kg: Number(l.volume_total_kg || 0),
            dia: l.dia
        })));
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar calendário de treinos.' });
    }
});

// GET /api/estatisticas/volume-muscular?periodo=semana|mes|ano
// Séries por agrupamento muscular. Regra: cada série concluída vale 1,0 pro
// grupo primário do exercício e 0,5 pra cada grupo secundário.
//
// A query conta as séries por exercício UMA vez (subquery "sx") e só depois
// distribui o peso pelos grupos (subquery "pg" = primário ∪ secundários).
// Assim o filtro de usuário/período/finalizado aparece em um lugar só, e os
// pesos 1,0/0,5 entram como parâmetros nomeados em vez de números soltos no SQL.
router.get('/volume-muscular', async (req, res) => {
    const periodo = req.query.periodo;
    if (typeof periodo !== 'string' || !Object.hasOwn(INICIO_DO_PERIODO, periodo)) {
        return res.status(400).json({ erro: 'Período inválido. Use semana, mes ou ano.' });
    }

    try {
        const [linhas] = await pool.query(
            `SELECT g.chave, g.rotulo, SUM(sx.total_series * pg.peso) AS series
             FROM (
                 SELECT te.exercicio_id, COUNT(s.id) AS total_series
                 FROM treinos_realizados t
                 JOIN treino_exercicios te ON te.treino_id = t.id
                 JOIN treino_series s ON s.treino_exercicio_id = te.id AND s.concluida = 1
                 WHERE t.usuario_id = ? AND t.finalizado_em IS NOT NULL
                   AND t.iniciado_em >= ${INICIO_DO_PERIODO[periodo]}
                 GROUP BY te.exercicio_id
             ) sx
             JOIN (
                 SELECT id AS exercicio_id, grupo_primario_id AS grupo_id, ? AS peso FROM exercicios
                 UNION ALL
                 SELECT exercicio_id, grupo_id, ? AS peso FROM exercicio_grupos_secundarios
             ) pg ON pg.exercicio_id = sx.exercicio_id
             JOIN grupos_musculares g ON g.id = pg.grupo_id
             GROUP BY g.id, g.chave, g.rotulo
             ORDER BY series DESC, g.rotulo`,
            [req.session.usuarioId, PESO_GRUPO_PRIMARIO, PESO_GRUPO_SECUNDARIO]
        );
        res.json(linhas.map(l => ({ chave: l.chave, rotulo: l.rotulo, series: Number(l.series) })));
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao calcular volume por agrupamento.' });
    }
});

module.exports = router;
