const minimist = require('minimist');
const args = minimist(process.argv.slice(2));
const WS_URL = args.from || 'ws://localhost';
const LOCAL_URL = args.to || 'http://localhost:3000/webhook';

const WebSocket = require('ws');
const axios = require('axios');
const chalk = require('chalk');

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
    console.log(chalk.yellow(`[${new Date().toISOString()}] Conectado ao servidor em ${WS_URL}`));
    console.log(chalk.yellow(`[${new Date().toISOString()}] Encaminhando mensagens para ${LOCAL_URL}`));
});

ws.on('message', async (message) => {
    const data = JSON.parse(message);

    if(data.event === 'webhook') {
        console.log(chalk.blue(`[${new Date().toISOString()}] Webhook recebido:`, JSON.stringify(data.body)));

        try {
            const response = await axios.post(
                LOCAL_URL,
                data.body
            );

            console.log(chalk.green(`[${new Date().toISOString()}] Webhook encaminhado para ${LOCAL_URL}`));
        } catch(err) {
            console.log(chalk.red(`[${new Date().toISOString()}] Falha ao encaminhar webhook:`, err.message));
        }
    }
});