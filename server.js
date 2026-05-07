const minimist = require('minimist');
const args = minimist(process.argv.slice(2));
const PORT = args.port || 80;

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const chalk = require('chalk');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({server});

let clientSockets = [];

wss.on('connection', (ws, req) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    const rawIp = Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor || req.socket.remoteAddress || 'IP Desconhecido');
    const clientIp = String(rawIp).split(',')[0].trim().replace('::ffff:', '');

    console.log(chalk.green(`[${new Date().toISOString()}] Cliente conectado ${clientIp}`));

    clientSockets.push({ws, clientIp});

    ws.on('error', (error) => {
        console.log(chalk.red(`[${new Date().toISOString()}] Erro no cliente ${clientIp}:`), error.message);
    });

    ws.on('close', () => {
        clientSockets = clientSockets.filter(socket => socket.ws !== ws);
        console.log(chalk.red(`[${new Date().toISOString()}] Cliente desconectado ${clientIp}`));
    });
});

app.get('/', (req, res) => {
    res.redirect('https://gabrielsilva.dev.br');
});

app.post('/webhook', (req, res) => {
    const activeSockets = clientSockets.filter(socket => socket.ws.readyState === WebSocket.OPEN);
    clientSockets = activeSockets;

    console.log(chalk.cyan(`[${new Date().toISOString()}] Webhook recebido:`, JSON.stringify(req.body)));

    if(!activeSockets.length) {
        console.log(chalk.red(`[${new Date().toISOString()}] Nenhum cliente conectado para encaminhar o webhook.`));
        return res.status(503).json({error: 'Nenhum cliente conectado para encaminhar o webhook.'});
    }

    const payload = JSON.stringify({
        event: 'webhook',
        body: req.body,
        headers: req.headers
    });

    let delivered = 0;

    activeSockets.forEach(socket => {
        try {
            socket.ws.send(payload);
            delivered++;
            console.log(chalk.green(`[${new Date().toISOString()}] Webhook encaminhado para ${socket.clientIp}`));
        } catch(error) {
            console.log(`[${new Date().toISOString()}] Falha ao encaminhar webhook para cliente ${socket.clientIp}:`, error.message);
        }
    });

    res.json({message: `Webhook encaminhado para ${delivered} cliente(s).`});
});

server.listen(PORT, () => {
    console.log(chalk.yellow(`[${new Date().toISOString()}] Servidor iniciado na porta ${PORT}`));
});