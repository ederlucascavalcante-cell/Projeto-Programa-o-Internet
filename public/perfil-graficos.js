// perfil-graficos.js
// Dois gráficos em SVG puro (linha e barras). Escolha deliberada: o projeto
// não tem nenhuma biblioteca de front-end, e dois gráficos simples não
// justificam trazer Chart.js inteiro (KISS). Só desenha — não busca dado
// nem sabe de onde ele vem (separação de interesses).
// Todo texto que entra no SVG vem de número ou de data já formatada pelo
// chamador, nunca de texto digitado pelo usuário.

const GRAFICO = {
    largura: 600, altura: 220,
    margem: { esq: 48, dir: 16, topo: 16, base: 28 },
    cor: '#25C696', grade: '#182A3A', texto: '#718096'
};

function svgEixoY(valores, formatar) {
    const { largura, margem, grade, texto } = GRAFICO;
    return valores.map(function (v) {
        return '<line x1="' + margem.esq + '" x2="' + (largura - margem.dir) + '" y1="' + v.y + '" y2="' + v.y + '" stroke="' + grade + '"/>' +
               '<text x="' + (margem.esq - 6) + '" y="' + (v.y + 4) + '" fill="' + texto + '" font-size="11" text-anchor="end">' + formatar(v.valor) + '</text>';
    }).join('');
}

function svgRotuloX(x, rotulo, ancora) {
    const { altura, margem, texto } = GRAFICO;
    return '<text x="' + x + '" y="' + (altura - margem.base + 18) + '" fill="' + texto + '" font-size="11" text-anchor="' + (ancora || 'middle') + '">' + rotulo + '</text>';
}

function abrirSvg(descricao) {
    return '<svg viewBox="0 0 ' + GRAFICO.largura + ' ' + GRAFICO.altura + '" role="img" aria-label="' + descricao + '" style="width:100%;height:auto;display:block">';
}

// pontos: [{ x: timestamp, valor: número, rotulo: 'dd/mm', dica: 'texto do tooltip' }],
// em ordem de x. formatarValor formata só os números do eixo Y (sem unidade,
// pra caber na margem); a unidade vai em `dica`.
// O eixo X é proporcional ao TEMPO (não ao índice): pesagens espaçadas de
// forma irregular não podem parecer igualmente espaçadas.
function desenharGraficoLinha(el, pontos, formatarValor) {
    if (pontos.length === 0) {
        el.innerHTML = '<p class="rotinas-vazio">Nenhum peso registrado ainda.</p>';
        return;
    }
    const { largura, altura, margem, cor } = GRAFICO;
    const areaW = largura - margem.esq - margem.dir;
    const areaH = altura - margem.topo - margem.base;

    const xs = pontos.map(function (p) { return p.x; });
    const ys = pontos.map(function (p) { return p.valor; });
    const xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    const amplitude = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    const folga = amplitude < 1 ? 1 : amplitude * 0.15; // evita eixo achatado quando o peso quase não mudou
    const yMin = Math.min.apply(null, ys) - folga, yMax = Math.max.apply(null, ys) + folga;

    const posX = function (x) { return xMax === xMin ? margem.esq + areaW / 2 : margem.esq + ((x - xMin) / (xMax - xMin)) * areaW; };
    const posY = function (v) { return margem.topo + (1 - (v - yMin) / (yMax - yMin)) * areaH; };

    const grade = [yMin, (yMin + yMax) / 2, yMax].map(function (v) { return { valor: v, y: posY(v) }; });
    const coordenadas = pontos.map(function (p) { return posX(p.x).toFixed(1) + ',' + posY(p.valor).toFixed(1); });

    let svg = abrirSvg('Gráfico de linha do histórico de peso') + svgEixoY(grade, formatarValor);
    svg += '<polyline points="' + coordenadas.join(' ') + '" fill="none" stroke="' + cor + '" stroke-width="2"/>';
    pontos.forEach(function (p) {
        svg += '<circle cx="' + posX(p.x).toFixed(1) + '" cy="' + posY(p.valor).toFixed(1) + '" r="4" fill="' + cor + '">' +
               '<title>' + p.dica + '</title></circle>';
    });
    svg += svgRotuloX(posX(xs[0]), pontos[0].rotulo, pontos.length > 1 ? 'start' : 'middle');
    if (pontos.length > 1) svg += svgRotuloX(posX(xs[xs.length - 1]), pontos[pontos.length - 1].rotulo, 'end');
    el.innerHTML = svg + '</svg>';
}

// itens: [{ valor: número, rotulo: 'dd/mm', dica: 'texto do tooltip' }]. Barras partem do zero (barra
// que não começa em zero engana na comparação entre semanas).
function desenharGraficoBarras(el, itens, formatarValor) {
    const { largura, altura, margem, cor } = GRAFICO;
    const areaW = largura - margem.esq - margem.dir;
    const areaH = altura - margem.topo - margem.base;
    const max = Math.max.apply(null, itens.map(function (i) { return i.valor; })) || 1;
    const fatia = areaW / itens.length;
    const larguraBarra = fatia * 0.6;

    const posY = function (v) { return margem.topo + (1 - v / max) * areaH; };
    const grade = [0, max / 2, max].map(function (v) { return { valor: v, y: posY(v) }; });

    let svg = abrirSvg('Gráfico de barras por semana') + svgEixoY(grade, formatarValor);
    itens.forEach(function (item, i) {
        const x = margem.esq + fatia * i + (fatia - larguraBarra) / 2;
        const y = posY(item.valor);
        svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + larguraBarra.toFixed(1) + '" height="' + (margem.topo + areaH - y).toFixed(1) + '" rx="3" fill="' + cor + '">' +
               '<title>' + item.dica + '</title></rect>';
        svg += svgRotuloX(x + larguraBarra / 2, item.rotulo);
    });
    el.innerHTML = svg + '</svg>';
}
