#!/bin/bash
cd "$(dirname "$0")"
# Encerra processos anteriores na porta 8080 para evitar erros
lsof -ti:8080 | xargs kill -9 2>/dev/null

# Inicia o servidor Python em background
echo "Iniciando VerdadeManaus..."
nohup python3 -m http.server 8080 >/dev/null 2>&1 &

# Aguarda 2 segundos para o servidor subir
sleep 2

# Abre o navegador
echo "Abrindo navegador..."
open "http://localhost:8080/standalone.html"

# Mantém o terminal aberto caso haja erros visíveis (opcional, aqui fechamos para ser 'simples')
# exit
