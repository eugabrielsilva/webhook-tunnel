#!/usr/bin/env node
const minimist = require('minimist');
const args = minimist(process.argv.slice(2));

const SERVER_URL = args?._?.[0] ?? args.server ?? 'http://localhost'; // primeiro argumento ou --server
const TARGET_URL = args?._?.[1] ?? args.target ?? 'http://localhost:3000/webhook'; // segundo argumento ou --target
const TIMEOUT = args.timeout ?? 5000; // --timeout
const RETRY = args.retry ?? 5; // --retry
const PING = args.ping ?? 30000; // --ping
const KEEP_ALIVE = args['keep-alive'] ?? false; // --keep-alive
const VERBOSE = args.verbose ?? false; // --verbose

const WebSocket = require('ws');
const axios = require('axios');
const chalk = require('chalk');

const httpUrl = SERVER_URL.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
const wsUrl = SERVER_URL.replace(/^http(s?):\/\//, 'ws$1://');

let ws = null;
let retryCount = 0;
let dontPing = true;

function filterForwardHeaders(headers = {}) {
    const ignoredHeaders = new Set([
        'host',
        'connection',
        'content-length',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade'
    ]);

    return Object.fromEntries(
        Object.entries(headers).filter(([key]) => !ignoredHeaders.has(String(key).toLowerCase()))
    );
}

async function connect() {
    try {
        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] Tentando requisição para ${httpUrl}/ping...`));
        }

        const checkResponse = await axios.get(`${httpUrl}/ping`);

        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] Requisição bem-sucedida. Status: ${checkResponse.status}. Conectando ao websocket...`));
        }
    } catch(error) {
        dontPing = true;

        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] Falha na requisição: ${error.message}`));
        }

        if(retryCount >= RETRY) {
            console.log(chalk.red(`[${new Date().toISOString()}] Não foi possível conectar ao servidor.`));
            process.exit(1);
        }

        console.log(chalk.red(`[${new Date().toISOString()}] Falha na conexão com o servidor. Tentando novamente em ${TIMEOUT / 1000}s...`));

        retryCount++;
        setTimeout(connect, TIMEOUT);
        return;
    }

    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        dontPing = false;
        retryCount = 0;
        console.log(chalk.yellow(`[${new Date().toISOString()}] Conectado ao servidor em ${SERVER_URL}`));
    });

    ws.on('message', async (message) => {
        let data;

        try {
            data = JSON.parse(String(message));
        } catch(error) {
            if(VERBOSE) {
                console.log(chalk.dim(`[${new Date().toISOString()}] Mensagem inválida recebida do servidor: ${error.message}`));
            }
            return;
        }

        if(data.event === 'webhook') {
            const requestId = data.requestId;
            console.log(chalk.cyan(`[${new Date().toISOString()}] Webhook recebido:`, JSON.stringify(data.body)));

            if(VERBOSE) {
                console.log(chalk.dim(`[${new Date().toISOString()}] Request ID ${requestId}`));
            }

            try {
                if(VERBOSE) {
                    console.log(chalk.dim(`[${new Date().toISOString()}] Tentando encaminhar requisição para ${TARGET_URL}...`));
                }

                const response = await axios({
                    method: data.method || 'POST',
                    url: TARGET_URL,
                    data: data.body,
                    headers: filterForwardHeaders(data.headers),
                    validateStatus: () => true
                });

                if(VERBOSE) {
                    console.log(chalk.dim(`[${new Date().toISOString()}] Requisição bem-sucedida. Status: ${response.status}. Devolvendo resposta para o servidor...`));
                }

                ws.send(JSON.stringify({
                    event: 'webhook_response',
                    requestId,
                    status: response.status,
                    headers: response.headers,
                    body: response.data
                }));

                console.log(chalk.green(`[${new Date().toISOString()}] Webhook encaminhado para ${TARGET_URL}`));
            } catch(error) {
                const status = error.response?.status ?? 502;
                const headers = error.response?.headers ?? {'content-type': 'application/json'};
                const body = error.response?.data ?? {error: error.message};

                try {
                    ws.send(JSON.stringify({
                        event: 'webhook_response',
                        requestId,
                        status,
                        headers,
                        body
                    }));
                } catch(sendError) {
                    if(VERBOSE) {
                        console.log(chalk.dim(`[${new Date().toISOString()}] Falha ao devolver resposta ao servidor: ${sendError.message}`));
                    }
                }

                if(VERBOSE) {
                    console.log(chalk.dim(`[${new Date().toISOString()}] Falha na requisição: ${error.message}`));
                }

                console.log(chalk.red(`[${new Date().toISOString()}] Falha ao encaminhar webhook: ${error.message}`));
            }
        }
    });

    ws.on('close', () => {
        dontPing = true;
        retryCount++;
        console.log(chalk.red(`[${new Date().toISOString()}] Conexão encerrada. Tentando reconectar em ${TIMEOUT / 1000}s...`));
        setTimeout(connect, TIMEOUT);
    });

    ws.on('error', (err) => {
        dontPing = true;
        console.log(chalk.red(`[${new Date().toISOString()}] Erro na conexão: ${err.message}`));
        ws.terminate();
    });
}

setInterval(async () => {
    if(dontPing || !KEEP_ALIVE) return;

    try {
        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] (Keep-Alive) Tentando requisição em ${httpUrl}/ping...`));
        }

        await axios.get(`${httpUrl}/ping`);

        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] (Keep-Alive) Requisição bem-sucedida.`));
        }
    } catch(error) {
        dontPing = true;

        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] (Keep-Alive) Falha na requisição: ${error.message}`));
        }
    }
}, PING);

console.log(chalk.green(`[Webhook Tunnel] - Cliente`));
console.log(chalk.magenta(`${httpUrl}/webhook`) + ' => ' + chalk.cyan(TARGET_URL));
console.log('');

connect();