const minimist = require('minimist');
const args = minimist(process.argv.slice(2));

const SERVER_URL = args.server || 'http://localhost';
const TARGET_URL = args.target || 'http://localhost:3000/webhook';
const TIMEOUT = args.timeout || 5000;
const RETRIES = args.retries || 5;

const WebSocket = require('ws');
const axios = require('axios');
const chalk = require('chalk');

const httpUrl = SERVER_URL.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
const wsUrl = SERVER_URL.replace(/^http(s?):\/\//, 'ws$1://');

let ws = null;
let retryCount = 0;

console.log(chalk.green(`[Webhook Tunnel] - Cliente`));
console.log(chalk.magenta(`${httpUrl}/webhook`) + ' => ' + chalk.cyan(TARGET_URL));
console.log('');

async function connect() {
    try {
        await axios.get(`${httpUrl}/ping`);
    } catch(error) {
        if(retryCount >= RETRIES) {
            console.log(chalk.red(`[${new Date().toISOString()}] Não foi possível conectar ao servidor.`));
            process.exit(1);
        }

        console.log(chalk.red(`[${new Date().toISOString()}] Erro na conexão com o servidor. Tentando novamente em ${TIMEOUT / 1000}s...`));
        retryCount++;
        setTimeout(connect, TIMEOUT);
        return;
    }

    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log(chalk.yellow(`[${new Date().toISOString()}] Conectado ao servidor em ${SERVER_URL}`));
        retryCount = 0;
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
            } catch(error) {
                console.log(chalk.red(`[${new Date().toISOString()}] Falha ao encaminhar webhook:`, error.message));
            }
        }
    });

    ws.on('close', () => {
        console.log(chalk.red(`[${new Date().toISOString()}] Conexão encerrada. Tentando reconectar em ${TIMEOUT / 1000}s...`));
        retryCount++;
        setTimeout(connect, TIMEOUT);
    });

    ws.on('error', (err) => {
        console.log(chalk.red(`[${new Date().toISOString()}] Erro na conexão: ${err.message}`));
        ws.terminate();
    });
}

connect();