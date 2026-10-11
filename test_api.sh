#!/bin/bash
set -e

# Assume que "mysql -u root" conecta sem senha (autenticação por socket do
# SO, padrão em instalação local de MySQL/MariaDB no Linux). Se o seu root
# tiver senha, ajuste esses dois comandos abaixo ou rode-os manualmente antes.
cd "$(dirname "${BASH_SOURCE[0]}")"

service mariadb start
sleep 2

# Recria o banco do zero a cada execução, pra este script poder rodar
# repetidas vezes sem esbarrar em "email já cadastrado" de uma rodada
# anterior. --default-character-set=utf8mb4 aqui é OBRIGATÓRIO: sem isso
# o cliente mysql importa os acentos corrompidos (double-encoding).
mysql -u root -e "DROP DATABASE IF EXISTS if_fitness;"
mysql -u root --default-character-set=utf8mb4 < db/schema.sql

(nohup node server.js > /tmp/node.log 2>&1 &)
sleep 2

COOKIES=/tmp/cookies_teste.txt
rm -f "$COOKIES"
BASE=http://localhost:3000/api

section() { echo; echo "=== $1 ==="; }

section "cadastro com senha fraca (espera 400)"
curl -s -o /tmp/out.json -w "status: %{http_code}\n" -X POST $BASE/auth/cadastro \
    -H "Content-Type: application/json" -d '{"nome":"Teste","email":"fraco@x.com","senha":"123"}'
cat /tmp/out.json; echo

section "cadastro válido"
curl -s -c "$COOKIES" -o /tmp/out.json -w "status: %{http_code}\n" -X POST $BASE/auth/cadastro \
    -H "Content-Type: application/json" -d '{"nome":"Eder Curl","email":"eder-curl@x.com","senha":"senha1234"}'
cat /tmp/out.json; echo

section "cadastro duplicado (espera 409)"
curl -s -o /tmp/out.json -w "status: %{http_code}\n" -X POST $BASE/auth/cadastro \
    -H "Content-Type: application/json" -d '{"nome":"Outro","email":"eder-curl@x.com","senha":"senha1234"}'
cat /tmp/out.json; echo

section "/me com sessão"
curl -s $BASE/auth/me -b "$COOKIES"; echo

section "/me sem sessão (espera 401)"
curl -s -o /tmp/out.json -w "status: %{http_code}\n" $BASE/auth/me
cat /tmp/out.json; echo

section "listar exercícios (deve ter 122+ do catálogo)"
curl -s $BASE/exercicios -b "$COOKIES" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const arr = JSON.parse(d);
  console.log('total:', arr.length);
  console.log('exemplo:', JSON.stringify(arr[0]));
});"

section "criar exercício personalizado"
curl -s -c "$COOKIES" -b "$COOKIES" -o /tmp/out.json -w "status: %{http_code}\n" -X POST $BASE/exercicios \
    -H "Content-Type: application/json" \
    -d '{"nome":"Supino no Smith invertido","grupo_primario_chave":"peito","secundarios":["triceps","ombro"],"descricao":"teste via curl"}'
cat /tmp/out.json; echo

section "criar rotina com 2 exercícios"
curl -s -c "$COOKIES" -b "$COOKIES" -o /tmp/rotina.json -w "status: %{http_code}\n" -X POST $BASE/rotinas \
    -H "Content-Type: application/json" \
    -d '{"nome":"Treino A - Teste","descricao":"criado via curl","exercicios":[{"exercicio_id":1,"series_alvo":3,"reps_alvo_min":8,"reps_alvo_max":12},{"exercicio_id":2,"series_alvo":3}]}'
cat /tmp/rotina.json; echo
ROTINA_ID=$(node -e "console.log(require('/tmp/rotina.json').id)")
echo "rotina id: $ROTINA_ID"

section "listar rotinas do usuário"
curl -s $BASE/rotinas -b "$COOKIES"; echo

section "detalhe da rotina criada"
curl -s $BASE/rotinas/$ROTINA_ID -b "$COOKIES"; echo

section "iniciar treino a partir da rotina"
curl -s -c "$COOKIES" -b "$COOKIES" -o /tmp/treino.json -w "status: %{http_code}\n" -X POST $BASE/treinos \
    -H "Content-Type: application/json" \
    -d "{\"rotina_id\": $ROTINA_ID, \"nome_treino\": \"Treino A - Teste\"}"
cat /tmp/treino.json; echo
TREINO_ID=$(node -e "console.log(require('/tmp/treino.json').id)")
echo "treino id: $TREINO_ID"

section "detalhe do treino recém-iniciado (deve ter 2 exercícios, 3 séries cada, tudo vazio)"
curl -s $BASE/treinos/$TREINO_ID -b "$COOKIES"; echo

section "finalizar treino com séries preenchidas"
curl -s -c "$COOKIES" -b "$COOKIES" -o /tmp/out.json -w "status: %{http_code}\n" -X PUT $BASE/treinos/$TREINO_ID \
    -H "Content-Type: application/json" \
    -d '{"exercicios":[{"exercicio_id":1,"series":[{"peso_kg":40,"repeticoes":10,"concluida":true},{"peso_kg":42,"repeticoes":8,"concluida":true},{"peso_kg":0,"repeticoes":0,"concluida":false}]}],"observacoes":"bom treino"}'
cat /tmp/out.json; echo

section "histórico (deve aparecer o treino finalizado, volume = 40*10+42*8 = 736)"
curl -s $BASE/treinos -b "$COOKIES"; echo

section "tentar acessar rotina de outro usuário (autorização)"
curl -s -c /tmp/cookies_outro.txt -X POST $BASE/auth/cadastro -H "Content-Type: application/json" \
    -d '{"nome":"Intruso","email":"intruso@x.com","senha":"senha1234"}' > /dev/null
curl -s -o /tmp/out.json -w "status: %{http_code}\n" $BASE/rotinas/$ROTINA_ID -b /tmp/cookies_outro.txt
cat /tmp/out.json; echo

echo
echo "=== FIM DOS TESTES DE API ==="

section "arquivos estáticos respondem (200)"
for pagina in inicio.html login.html Pcadastro.html usuario.html treino-ativo.html meu-treino.html style.css usuario.js treino-ativo.js meu-treino.js login.js cadastro.js AbrirMenu.js; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/$pagina")
    echo "$pagina -> $status"
done

section "fluxo completo como o front-end faria: login -> iniciar treino livre -> fechar -> ver no histórico"
rm -f /tmp/cookies_fluxo.txt
curl -s -c /tmp/cookies_fluxo.txt -X POST $BASE/auth/login -H "Content-Type: application/json" \
    -d '{"email":"eder-curl@x.com","senha":"senha1234"}' -o /dev/null

curl -s -c /tmp/cookies_fluxo.txt -b /tmp/cookies_fluxo.txt -X POST $BASE/treinos \
    -H "Content-Type: application/json" -d '{"nome_treino":"Treino Livre"}' -o /tmp/treino_livre.json
TREINO_LIVRE_ID=$(node -e "console.log(require('/tmp/treino_livre.json').id)")
echo "treino livre criado, id: $TREINO_LIVRE_ID (deve ter 0 exercícios, sem rotina)"
curl -s $BASE/treinos/$TREINO_LIVRE_ID -b /tmp/cookies_fluxo.txt; echo

curl -s -b /tmp/cookies_fluxo.txt -X PUT $BASE/treinos/$TREINO_LIVRE_ID \
    -H "Content-Type: application/json" \
    -d '{"exercicios":[{"exercicio_id":45,"series":[{"peso_kg":15,"repeticoes":12,"concluida":true}]}]}' -o /tmp/out.json
cat /tmp/out.json; echo

echo "histórico agora deve ter 2 treinos (o daqui + o de antes):"
curl -s $BASE/treinos -b /tmp/cookies_fluxo.txt | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log('total no histórico:', JSON.parse(d).length))"

echo
echo "=== FIM ==="
