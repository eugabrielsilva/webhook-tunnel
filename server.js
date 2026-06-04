#!/usr/bin/env node
const minimist = require('minimist');
const args = minimist(process.argv.slice(2));

const PORT = args?._?.[0] ?? args.port ?? 80; // primeiro argumento ou --port
const TIMEOUT = args['timeout'] ?? 30000; // --timeout
const VERBOSE = args.verbose ?? false; // --verbose

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const chalk = require('chalk');
const crypto = require('node:crypto');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({server});

let clientSocket = null;
let clientIp = null;
const pendingRequests = new Map();

function generateRequestId() {
    return crypto.randomUUID();
}

function filterOutgoingHeaders(headers = {}) {
    const ignoredHeaders = new Set([
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

async function dispatchWebhookToClient(payload) {
    if(!clientSocket || clientSocket.readyState !== WebSocket.OPEN) {
        throw new Error('NO_CLIENT_CONNECTED');
    }

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingRequests.delete(payload.requestId);
            reject(new Error('TIMEOUT'));
        }, TIMEOUT);

        pendingRequests.set(payload.requestId, {
            resolve: (result) => {
                clearTimeout(timeoutId);
                resolve(result);
            },
            reject: (err) => {
                clearTimeout(timeoutId);
                reject(err);
            }
        });

        try {
            if(VERBOSE) {
                console.log(chalk.dim(`[${new Date().toISOString()}] Encaminhando webhook com Request ID ${payload.requestId}`));
            }

            clientSocket.send(JSON.stringify(payload));
            console.log(chalk.green(`[${new Date().toISOString()}] Webhook encaminhado para ${clientIp}`));
        } catch(error) {
            clearTimeout(timeoutId);
            pendingRequests.delete(payload.requestId);
            reject(error);
        }
    });
}

function rejectAllPendingRequests(reason) {
    for(const [requestId, pending] of pendingRequests.entries()) {
        pending.reject(new Error(reason));
        pendingRequests.delete(requestId);
    }
}

wss.on('connection', (ws, req) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    const rawIp = Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor || req.socket.remoteAddress || 'IP Desconhecido');
    const parsedIp = String(rawIp).split(',')[0].trim().replace('::ffff:', '');

    if(clientSocket) {
        clientSocket.terminate();
    }

    clientIp = parsedIp;
    clientSocket = ws;

    console.log(chalk.green(`[${new Date().toISOString()}] Cliente conectado ${clientIp}`));

    ws.on('message', (message) => {
        let data;

        try {
            data = JSON.parse(String(message));
        } catch(error) {
            console.log(chalk.red(`[${new Date().toISOString()}] Mensagem inválida recebida do cliente: ${error.message}`));
            return;
        }

        if(data.event !== 'webhook_response' || !data.requestId) return;

        const pending = pendingRequests.get(data.requestId);
        if(!pending) return;

        pendingRequests.delete(data.requestId);
        pending.resolve(data);
    });

    ws.on('error', (error) => {
        console.log(chalk.red(`[${new Date().toISOString()}] Erro no cliente ${clientIp}: ${error.message}`));
    });

    ws.on('close', () => {
        console.log(chalk.red(`[${new Date().toISOString()}] Cliente desconectado ${clientIp}`));
        rejectAllPendingRequests('CLIENT_DISCONNECTED');
        clientSocket = null;
        clientIp = null;
    });
});

app.get('/', (req, res) => {
    res.redirect('https://gabrielsilva.dev.br');
});

app.get('/ping', (req, res) => {
    res.json({message: 'pong'});
});

app.post('/webhook', async (req, res) => {
    console.log(chalk.cyan(`[${new Date().toISOString()}] Webhook recebido:`, JSON.stringify(req.body)));

    const requestId = generateRequestId();
    const payload = {
        event: 'webhook',
        requestId,
        method: req.method,
        body: req.body,
        headers: req.headers
    };

    try {
        const clientResult = await dispatchWebhookToClient(payload);
        const status = Number(clientResult?.status) || 502;
        const responseHeaders = filterOutgoingHeaders(clientResult?.headers || {});

        for(const [headerKey, headerValue] of Object.entries(responseHeaders)) {
            if(headerValue !== undefined) {
                res.set(headerKey, String(headerValue));
            }
        }

        return res.status(status).send(clientResult?.body ?? null);
    } catch(error) {
        if(error.message === 'NO_CLIENT_CONNECTED') {
            console.log(chalk.red(`[${new Date().toISOString()}] Nenhum cliente conectado para encaminhar o webhook.`));
            return res.status(503).json({error: 'Nenhum cliente conectado para encaminhar o webhook.'});
        }

        if(error.message === 'TIMEOUT') {
            console.log(chalk.red(`[${new Date().toISOString()}] Tempo de resposta do cliente excedido.`));
            return res.status(504).json({error: 'Tempo de resposta do cliente excedido.'});
        }

        if(error.message === 'CLIENT_DISCONNECTED') {
            console.log(chalk.red(`[${new Date().toISOString()}] Cliente desconectado durante a resposta.`));
            return res.status(503).json({error: 'Cliente desconectado durante a resposta.'});
        }

        console.log(chalk.red(`[${new Date().toISOString()}] Falha ao encaminhar webhook para cliente ${clientIp}: ${error.message}`));

        return res.status(502).json({error: 'Falha ao encaminhar webhook para o destino.'});
    }
});

server.listen(PORT, () => {
    console.log(chalk.green(`[Webhook Tunnel] - Servidor`));
    console.log(chalk.yellow(`[${new Date().toISOString()}] Servidor iniciado na porta ${PORT}`));
});