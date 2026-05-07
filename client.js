const minimist = require('minimist');
const args = minimist(process.argv.slice(2));
const SERVER_URL = args.server || 'ws://localhost';
const TARGET_URL = args.target || 'http://localhost:3000/webhook';
const TIMEOUT = args.timeout || 5000;

const WebSocket = require('ws');
const axios = require('axios');
const chalk = require('chalk');

let ws = null;

console.log(chalk.cyan(`[${new Date().toISOString()}] Encaminhando mensagens para ${TARGET_URL}`));

function connect() {
    ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
        console.log(chalk.yellow(`[${new Date().toISOString()}] Conectado ao servidor em ${SERVER_URL}`));
    });

    ws.on('message', async (message) => {
        const data = JSON.parse(message);

        if(data.event === 'webhook') {
            console.log(chalk.cyan(`[${new Date().toISOString()}] Webhook recebido:`, JSON.stringify(data.body)));

            try {
                const response = await axios.post(
                    TARGET_URL,
                    data.body,
                    {headers: data.headers}
                );

                console.log(chalk.green(`[${new Date().toISOString()}] Webhook encaminhado para ${TARGET_URL}`));
            } catch(err) {
                console.log(chalk.red(`[${new Date().toISOString()}] Falha ao encaminhar webhook:`, err.message));
            }
        }
    });

    ws.on('close', () => {
        console.log(chalk.red(`[${new Date().toISOString()}] Conexão encerrada. Tentando reconectar em ${TIMEOUT / 1000}s`));
        setTimeout(connect, TIMEOUT);
    });

    ws.on('error', (err) => {
        console.log(chalk.red(`[${new Date().toISOString()}] Erro na conexão: ${err.message}`));
        ws.terminate();
    });
}

connect();