// perfil.js
// Lógica da tela de perfil. Só orquestra: busca na API (/api/perfil e
// /api/estatisticas), entrega pros desenhistas (perfil-graficos.js) ou monta
// o DOM. Nenhuma regra de negócio aqui — o cálculo do volume músculo-série
// (1,0 primário / 0,5 secundário) vive no servidor, em estatisticas.routes.js.

document.addEventListener('DOMContentLoaded', async function () {

    const usuario = await exigirSessao();
    if (!usuario) return;
    ligarLogout();

    // ---------- Utilitários ----------

    async function buscarJson(url, opcoes) {
        const resposta = await fetch(url, opcoes);
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || 'Erro inesperado.');
        return dados;
    }

    function enviarJson(url, metodo, corpo) {
        return buscarJson(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo)
        });
    }

    function numero(valor, casas) {
        return Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: casas });
    }

    // As datas da API chegam como "YYYY-MM-DD" (dateStrings: true em src/db.js).
    // Tratadas como texto/UTC de propósito: new Date('YYYY-MM-DD') + fuso local
    // poderia empurrar o dia pra trás.
    function dataCurta(iso, comAno) {
        const partes = iso.split('-');
        return partes[2] + '/' + partes[1] + (comAno ? '/' + partes[0].slice(2) : '');
    }

    function paraTimestamp(iso) {
        return Date.parse(iso + 'T00:00:00Z');
    }

    function mostrarMensagem(el, mensagem) {
        el.innerHTML = '<p class="rotinas-vazio"></p>';
        el.firstChild.textContent = mensagem;
    }

    // Dois grupos de botões (métrica e período) se comportam igual: um ativo
    // por vez, avisando quem chamou. Uma função só em vez de dois listeners
    // quase idênticos (DRY).
    function ligarSeletor(el, aoMudar) {
        el.addEventListener('click', function (e) {
            const botao = e.target.closest('button');
            if (!botao || botao.classList.contains('ativo')) return;
            el.querySelector('.ativo').classList.remove('ativo');
            botao.classList.add('ativo');
            aoMudar(botao.dataset.valor);
        });
    }

    // ---------- Hero: nome, e-mail, total de treinos ----------

    let perfilAtual = { nome: usuario.nome, email: '', total_treinos: 0 };

    function renderizarPerfil() {
        document.getElementById('perfil-nome').textContent = perfilAtual.nome;
        document.getElementById('perfil-email').textContent = perfilAtual.email;
        document.getElementById('perfil-total-treinos').textContent = numero(perfilAtual.total_treinos, 0);
        document.getElementById('perfil-avatar').textContent = perfilAtual.nome.trim().charAt(0).toUpperCase() || '?';
    }

    async function carregarPerfil() {
        try {
            perfilAtual = await buscarJson('/api/perfil');
            renderizarPerfil();
        } catch (erro) {
            console.error(erro);
        }
    }

    // ---------- Modal: editar perfil ----------

    const modalOverlay = document.getElementById('modal-perfil-overlay');
    const inputNome = document.getElementById('perfil-input-nome');
    const inputEmail = document.getElementById('perfil-input-email');
    const perfilErroEl = document.getElementById('perfil-erro');

    document.getElementById('btn-editar-perfil').addEventListener('click', function () {
        inputNome.value = perfilAtual.nome;
        inputEmail.value = perfilAtual.email;
        perfilErroEl.textContent = '';
        modalOverlay.hidden = false;
    });

    function fecharModal() { modalOverlay.hidden = true; }

    document.getElementById('btn-fechar-modal-perfil').addEventListener('click', fecharModal);
    modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) fecharModal(); // só o fundo escuro, não cliques dentro do modal
    });

    document.getElementById('form-perfil').addEventListener('submit', async function (e) {
        e.preventDefault();
        perfilErroEl.textContent = '';
        try {
            const salvo = await enviarJson('/api/perfil', 'PUT', {
                nome: inputNome.value,
                email: inputEmail.value
            });
            perfilAtual = Object.assign({}, perfilAtual, salvo);
            renderizarPerfil();
            fecharModal();
        } catch (erro) {
            perfilErroEl.textContent = erro.message;
        }
    });

    // ---------- Peso corporal ----------

    const pesoAtualEl = document.getElementById('peso-atual');
    const graficoPesoEl = document.getElementById('grafico-peso');
    const inputPeso = document.getElementById('input-peso');
    const pesoErroEl = document.getElementById('peso-erro');

    async function carregarPeso() {
        try {
            const registros = await buscarJson('/api/perfil/peso');
            const ultimo = registros[registros.length - 1];
            pesoAtualEl.textContent = ultimo ? numero(ultimo.peso_kg, 2) + ' kg' : '—';

            const pontos = registros.map(function (r) {
                return {
                    x: paraTimestamp(r.registrado_em),
                    valor: r.peso_kg,
                    rotulo: dataCurta(r.registrado_em, true),
                    dica: dataCurta(r.registrado_em, true) + ': ' + numero(r.peso_kg, 2) + ' kg'
                };
            });
            desenharGraficoLinha(graficoPesoEl, pontos, function (v) { return numero(v, 1); });
        } catch (erro) {
            console.error(erro);
            mostrarMensagem(graficoPesoEl, 'Não foi possível carregar o histórico de peso.');
        }
    }

    document.getElementById('form-peso').addEventListener('submit', async function (e) {
        e.preventDefault();
        pesoErroEl.textContent = '';
        try {
            await enviarJson('/api/perfil/peso', 'POST', { peso_kg: inputPeso.value });
            inputPeso.value = '';
            carregarPeso();
        } catch (erro) {
            pesoErroEl.textContent = erro.message;
        }
    });

    // ---------- Estatísticas por semana (volume ou duração) ----------

    const graficoSemanalEl = document.getElementById('grafico-semanal');
    let semanas = [];
    let metrica = 'volume';

    function desenharSemanal() {
        const ehVolume = metrica === 'volume';
        const unidade = ehVolume ? ' kg' : ' min';
        const itens = semanas.map(function (s) {
            const valor = ehVolume ? s.volume_kg : s.duracao_min;
            return {
                valor: valor,
                rotulo: dataCurta(s.inicio),
                dica: 'Semana de ' + dataCurta(s.inicio) + ': ' + numero(valor, 0) + unidade
            };
        });
        desenharGraficoBarras(graficoSemanalEl, itens, function (v) { return numero(v, 0); });
    }

    async function carregarSemanal() {
        try {
            semanas = await buscarJson('/api/estatisticas/semanal');
            desenharSemanal();
        } catch (erro) {
            console.error(erro);
            mostrarMensagem(graficoSemanalEl, 'Não foi possível carregar as estatísticas.');
        }
    }

    ligarSeletor(document.getElementById('seletor-metrica'), function (valor) {
        metrica = valor;
        desenharSemanal(); // dados já em memória: trocar de métrica não precisa de nova chamada
    });

    // ---------- Volume músculo-série ----------

    const listaVolumeEl = document.getElementById('lista-volume-muscular');
    let requisicaoVolume = 0; // descarta resposta antiga se o usuário clicar em outro período antes de ela chegar

    function criarLinhaVolume(grupo, maximo) {
        const linha = document.createElement('div');
        linha.className = 'volume-linha';
        linha.innerHTML =
            '<div class="progress-info"><span></span><strong></strong></div>' +
            '<div class="barra-progresso-bg"><div class="barra-progresso-fill"></div></div>';
        linha.querySelector('span').textContent = grupo.rotulo;
        linha.querySelector('strong').textContent = numero(grupo.series, 1) + (grupo.series === 1 ? ' série' : ' séries');
        linha.querySelector('.barra-progresso-fill').style.width = (grupo.series / maximo * 100) + '%';
        return linha;
    }

    async function carregarVolumeMuscular(periodo) {
        const minha = ++requisicaoVolume;
        try {
            const grupos = await buscarJson('/api/estatisticas/volume-muscular?periodo=' + periodo);
            if (minha !== requisicaoVolume) return;

            if (grupos.length === 0) {
                mostrarMensagem(listaVolumeEl, 'Nenhuma série concluída neste período.');
                return;
            }
            listaVolumeEl.innerHTML = '';
            grupos.forEach(function (grupo) {
                // a API já devolve em ordem decrescente: o primeiro é o maior
                listaVolumeEl.appendChild(criarLinhaVolume(grupo, grupos[0].series));
            });
        } catch (erro) {
            if (minha !== requisicaoVolume) return;
            console.error(erro);
            mostrarMensagem(listaVolumeEl, 'Não foi possível carregar o volume por agrupamento.');
        }
    }

    ligarSeletor(document.getElementById('seletor-periodo'), carregarVolumeMuscular);

    // ---------- Calendário mensal ----------

    const calendarioGridEl = document.getElementById('calendario-grid');
    const calendarioTituloEl = document.getElementById('calendario-titulo');
    const calendarioDetalheEl = document.getElementById('calendario-detalhe');
    const btnMesSeguinte = document.getElementById('btn-mes-seguinte');

    const hoje = new Date();
    const mesAtual = { ano: hoje.getFullYear(), mes: hoje.getMonth() }; // mes: 0 a 11
    let mesExibido = { ano: mesAtual.ano, mes: mesAtual.mes };
    let treinosPorDia = {};
    let requisicaoCalendario = 0;

    function doisDigitos(n) { return String(n).padStart(2, '0'); }
    function chaveMes(m) { return m.ano + '-' + doisDigitos(m.mes + 1); }

    function mostrarDetalheDia(chave, treinos) {
        calendarioDetalheEl.hidden = false;
        calendarioDetalheEl.innerHTML = '<strong></strong><ul></ul>';
        calendarioDetalheEl.querySelector('strong').textContent = dataCurta(chave, true);
        const lista = calendarioDetalheEl.querySelector('ul');
        treinos.forEach(function (t) {
            const item = document.createElement('li');
            item.textContent = t.nome_treino + ' — ' + numero(t.volume_total_kg, 0) + ' kg';
            lista.appendChild(item);
        });
    }

    function desenharCalendario() {
        const prefixo = chaveMes(mesExibido);
        const hojeChave = hoje.getFullYear() + '-' + doisDigitos(hoje.getMonth() + 1) + '-' + doisDigitos(hoje.getDate());
        const diaDaSemanaDoDia1 = new Date(mesExibido.ano, mesExibido.mes, 1).getDay(); // 0 = domingo, igual ao widget de usuario.html
        const diasNoMes = new Date(mesExibido.ano, mesExibido.mes + 1, 0).getDate();

        calendarioGridEl.innerHTML = '';
        for (let i = 0; i < diaDaSemanaDoDia1; i++) calendarioGridEl.appendChild(document.createElement('div'));

        for (let dia = 1; dia <= diasNoMes; dia++) {
            const chave = prefixo + '-' + doisDigitos(dia);
            const treinos = treinosPorDia[chave];
            // Só dia com treino é <button>: dia vazio não faz nada ao clicar,
            // então não deve parecer nem se comportar como botão.
            const celula = document.createElement(treinos ? 'button' : 'div');
            celula.className = 'dia-item' + (treinos ? ' concluido' : '') + (chave === hojeChave ? ' hoje' : '');
            celula.innerHTML = '<span>' + dia + '</span><small>' + (treinos ? '✓' : '&nbsp;') + '</small>';
            if (treinos) {
                celula.type = 'button';
                celula.addEventListener('click', function () { mostrarDetalheDia(chave, treinos); });
            }
            calendarioGridEl.appendChild(celula);
        }
    }

    async function carregarCalendario() {
        const minha = ++requisicaoCalendario;
        calendarioTituloEl.textContent = new Date(mesExibido.ano, mesExibido.mes, 1)
            .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        btnMesSeguinte.disabled = mesExibido.ano === mesAtual.ano && mesExibido.mes === mesAtual.mes;
        calendarioDetalheEl.hidden = true;

        try {
            const treinos = await buscarJson('/api/estatisticas/calendario?mes=' + chaveMes(mesExibido));
            if (minha !== requisicaoCalendario) return;
            treinosPorDia = {};
            treinos.forEach(function (t) {
                (treinosPorDia[t.dia] = treinosPorDia[t.dia] || []).push(t);
            });
        } catch (erro) {
            if (minha !== requisicaoCalendario) return;
            console.error(erro);
            treinosPorDia = {};
            calendarioDetalheEl.hidden = false;
            calendarioDetalheEl.textContent = 'Não foi possível carregar os treinos do mês.';
        }
        desenharCalendario();
    }

    function mudarMes(delta) {
        const data = new Date(mesExibido.ano, mesExibido.mes + delta, 1);
        mesExibido = { ano: data.getFullYear(), mes: data.getMonth() };
        carregarCalendario();
    }

    document.getElementById('btn-mes-anterior').addEventListener('click', function () { mudarMes(-1); });
    btnMesSeguinte.addEventListener('click', function () { mudarMes(1); });

    // ---------- Início ----------
    renderizarPerfil();
    carregarPerfil();
    carregarPeso();
    carregarSemanal();
    carregarVolumeMuscular('semana');
    carregarCalendario();
});
