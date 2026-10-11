// rotina-editor.js
// Criar e editar rotina (o modelo salvo e repetível de treino).
//   rotina-editor.html           -> cria  (POST /api/rotinas)
//   rotina-editor.html?rotina=ID -> edita (GET + PUT /api/rotinas/:id)
//
// Uma rotina guarda, por exercício: nº de séries e faixa de reps. Não guarda
// carga — a tabela rotina_exercicios não tem essa coluna.
//
// Depende de AbrirMenu.js e biblioteca-exercicios.js, carregados ANTES deste arquivo.

document.addEventListener('DOMContentLoaded', async function () {

    const rotinaId = new URLSearchParams(window.location.search).get('rotina'); // null = criando

    // Limite das colunas TINYINT UNSIGNED (series_alvo, reps_alvo_min/max) no schema.
    const MAXIMO_TINYINT = 255;

    // ==========================================================================
    // ELEMENTOS — declarados ANTES de qualquer função ser chamada
    // ==========================================================================
    const tituloEl = document.getElementById('titulo-rotina');
    const nomeInput = document.getElementById('rotina-nome');
    const descricaoInput = document.getElementById('rotina-descricao');
    const listaEl = document.getElementById('lista-exercicios-rotina');
    const vazioEl = document.getElementById('rotina-vazia');
    const erroEl = document.getElementById('rotina-erro');
    const btnSalvar = document.getElementById('btn-salvar-rotina');

    // ==========================================================================
    // CARDS DE EXERCÍCIO
    // ==========================================================================
    function atualizarEstadoVazio() {
        vazioEl.hidden = listaEl.children.length > 0;
    }

    function definirValor(card, seletor, valor) {
        if (valor) card.querySelector(seletor).value = valor;
    }

    // metas: { series_alvo, reps_alvo_min, reps_alvo_max } (campos podem faltar/ser null)
    function criarCardExercicio(exercicioId, nome, primario, secundarios, metas) {
        const card = document.createElement('div');
        card.className = 'exercicio-treino-card';
        card.dataset.exercicioId = exercicioId;
        card.appendChild(Biblioteca.criarCabecalhoCard(nome, primario, secundarios));
        card.insertAdjacentHTML('beforeend',
            '<div class="metas-exercicio">' +
                '<label>Séries<input type="number" class="input-series" placeholder="séries" min="1" max="' + MAXIMO_TINYINT + '"></label>' +
                '<label>Reps mín.<input type="number" class="input-reps-min" placeholder="mín" min="1" max="' + MAXIMO_TINYINT + '"></label>' +
                '<label>Reps máx.<input type="number" class="input-reps-max" placeholder="máx" min="1" max="' + MAXIMO_TINYINT + '"></label>' +
            '</div>');

        definirValor(card, '.input-series', metas.series_alvo);
        definirValor(card, '.input-reps-min', metas.reps_alvo_min);
        definirValor(card, '.input-reps-max', metas.reps_alvo_max);
        return card;
    }

    function adicionarExercicio(exercicio) {
        listaEl.appendChild(criarCardExercicio(exercicio.id, exercicio.nome, exercicio.primario, exercicio.secundarios, {}));
        atualizarEstadoVazio();
    }

    // ==========================================================================
    // LEITURA E VALIDAÇÃO DO FORMULÁRIO
    // ==========================================================================
    // null = campo vazio (permitido, as metas são opcionais); undefined = valor inválido.
    function lerInteiro(input) {
        const texto = input.value.trim();
        if (texto === '') return null;
        const numero = Number(texto);
        return Number.isInteger(numero) && numero >= 1 && numero <= MAXIMO_TINYINT ? numero : undefined;
    }

    // Retorna { exercicios } ou { erro } — nunca mexe na tela, só lê.
    function lerExerciciosDoFormulario() {
        const exercicios = [];

        for (const card of listaEl.querySelectorAll('.exercicio-treino-card')) {
            const nome = card.querySelector('h3').textContent;
            const series = lerInteiro(card.querySelector('.input-series'));
            const repsMin = lerInteiro(card.querySelector('.input-reps-min'));
            const repsMax = lerInteiro(card.querySelector('.input-reps-max'));

            if (series === undefined || repsMin === undefined || repsMax === undefined) {
                return { erro: 'Em "' + nome + '", use números inteiros de 1 a ' + MAXIMO_TINYINT + '.' };
            }
            if (repsMin !== null && repsMax !== null && repsMin > repsMax) {
                return { erro: 'Em "' + nome + '", as reps mínimas não podem ser maiores que as máximas.' };
            }

            exercicios.push({
                exercicio_id: Number(card.dataset.exercicioId),
                series_alvo: series,
                reps_alvo_min: repsMin,
                reps_alvo_max: repsMax
            });
        }

        return { exercicios: exercicios };
    }

    // ==========================================================================
    // API
    // ==========================================================================
    async function carregarRotina() {
        try {
            const resposta = await fetch('/api/rotinas/' + rotinaId);
            if (resposta.status === 401) {
                window.location.href = 'login.html';
                return;
            }
            if (!resposta.ok) {
                alert('Rotina não encontrada.');
                window.location.href = 'usuario.html';
                return;
            }
            const rotina = await resposta.json();

            tituloEl.textContent = 'Editar Rotina';
            nomeInput.value = rotina.nome;
            descricaoInput.value = rotina.descricao || '';

            rotina.exercicios.forEach(function (re) {
                // Exercício desativado some do catálogo (ativo = 0) mas pode continuar
                // numa rotina antiga: nesse caso mostra o nome sem as badges.
                const info = Biblioteca.obterExercicio(re.exercicio_id);
                const primario = info ? info.primario : { chave: '', rotulo: '' };
                const secundarios = info ? info.secundarios : [];
                listaEl.appendChild(criarCardExercicio(re.exercicio_id, re.nome, primario, secundarios, re));
            });
        } catch (erro) {
            console.error(erro);
            alert('Não foi possível carregar a rotina.');
        }
    }

    async function salvarRotina() {
        erroEl.textContent = '';

        const nome = nomeInput.value.trim();
        if (!nome) {
            erroEl.textContent = 'Informe o nome da rotina.';
            nomeInput.focus();
            return;
        }

        const leitura = lerExerciciosDoFormulario();
        if (leitura.erro) {
            erroEl.textContent = leitura.erro;
            return;
        }
        if (leitura.exercicios.length === 0) {
            erroEl.textContent = 'Adicione pelo menos um exercício.';
            return;
        }

        btnSalvar.disabled = true; // evita duplo clique criar duas rotinas iguais
        try {
            const resposta = await fetch(rotinaId ? '/api/rotinas/' + rotinaId : '/api/rotinas', {
                method: rotinaId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: nome,
                    descricao: descricaoInput.value.trim(),
                    exercicios: leitura.exercicios
                })
            });
            if (resposta.status === 401) {
                window.location.href = 'login.html';
                return;
            }
            if (!resposta.ok) {
                const dados = await resposta.json();
                erroEl.textContent = dados.erro || 'Não foi possível salvar a rotina.';
                return;
            }
            window.location.href = 'usuario.html';
        } catch (erro) {
            console.error(erro);
            erroEl.textContent = 'Não foi possível conectar ao servidor.';
        } finally {
            btnSalvar.disabled = false;
        }
    }

    // ==========================================================================
    // EVENTOS
    // ==========================================================================
    listaEl.addEventListener('click', function (e) {
        if (!e.target.classList.contains('btn-remover-exercicio')) return;
        e.target.closest('.exercicio-treino-card').remove();
        atualizarEstadoVazio();
    });

    btnSalvar.addEventListener('click', salvarRotina);

    document.getElementById('btn-cancelar-rotina').addEventListener('click', function () {
        if (confirm('Sair sem salvar? O que foi alterado aqui será perdido.')) {
            window.location.href = 'usuario.html';
        }
    });

    // ==========================================================================
    // INICIALIZAÇÃO — só aqui as funções acima são chamadas
    // ==========================================================================
    const autenticado = await Biblioteca.iniciar({ aoSelecionar: adicionarExercicio });
    if (!autenticado) return;

    if (rotinaId) await carregarRotina();
    atualizarEstadoVazio();
});
