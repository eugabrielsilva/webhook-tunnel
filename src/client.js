const minimist = require('minimist');
const args = minimist(process.argv.slice(2));

const SERVER_URL = args?._?.[1] ?? args.server ?? 'http://localhost:7777'; // first argument or --server
const TARGET_URL = args?._?.[2] ?? args.target ?? 'http://localhost:3000/webhook'; // second argument or --target
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
            console.log(chalk.dim(`[${new Date().toISOString()}] Trying to request ${httpUrl}/ping...`));
        }

        const checkResponse = await axios.get(`${httpUrl}/ping`);

        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] Request successful. Status: ${checkResponse.status}. Connecting to websocket...`));
        }
    } catch(error) {
        dontPing = true;

        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] Request failed: ${error.message}`));
        }

        if(retryCount >= RETRY) {
            console.log(chalk.red(`[${new Date().toISOString()}] Failed to connect to server.`));
            process.exit(1);
        }

        console.log(chalk.red(`[${new Date().toISOString()}] Server connection failed. Retrying in ${TIMEOUT / 1000}s...`));

        retryCount++;
        setTimeout(connect, TIMEOUT);
        return;
    }

    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        dontPing = false;
        retryCount = 0;
        console.log(chalk.yellow(`[${new Date().toISOString()}] Connected to server at ${SERVER_URL}`));
    });

    ws.on('message', async (message) => {
        let data;

        try {
            data = JSON.parse(String(message));
        } catch(error) {
            if(VERBOSE) {
                console.log(chalk.dim(`[${new Date().toISOString()}] Invalid message received from server: ${error.message}`));
            }
            return;
        }

        if(data.event === 'webhook') {
            const requestId = data.requestId;
            console.log(chalk.cyan(`[${new Date().toISOString()}] Webhook received:`, JSON.stringify(data.body)));

            if(VERBOSE) {
                console.log(chalk.dim(`[${new Date().toISOString()}] Request ID ${requestId}`));
            }

            try {
                if(VERBOSE) {
                    console.log(chalk.dim(`[${new Date().toISOString()}] Trying to forward request to ${TARGET_URL}...`));
                }

                const response = await axios({
                    method: data.method || 'POST',
                    url: TARGET_URL,
                    data: data.body,
                    headers: filterForwardHeaders(data.headers),
                    validateStatus: () => true
                });

                if(VERBOSE) {
                    console.log(chalk.dim(`[${new Date().toISOString()}] Request successful. Status: ${response.status}. Returning response to server...`));
                }

                ws.send(JSON.stringify({
                    event: 'webhook_response',
                    requestId,
                    status: response.status,
                    headers: response.headers,
                    body: response.data
                }));

                console.log(chalk.green(`[${new Date().toISOString()}] Webhook forwarded to ${TARGET_URL}`));
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
                        console.log(chalk.dim(`[${new Date().toISOString()}] Failure to return response to server: ${sendError.message}`));
                    }
                }

                if(VERBOSE) {
                    console.log(chalk.dim(`[${new Date().toISOString()}] Request failed: ${error.message}`));
                }

                console.log(chalk.red(`[${new Date().toISOString()}] Failed to forward webhook: ${error.message}`));
            }
        }
    });

    ws.on('close', () => {
        dontPing = true;
        retryCount++;
        console.log(chalk.red(`[${new Date().toISOString()}] Connection closed. Trying to reconnect in ${TIMEOUT / 1000}s...`));
        setTimeout(connect, TIMEOUT);
    });

    ws.on('error', (err) => {
        dontPing = true;
        console.log(chalk.red(`[${new Date().toISOString()}] Connection error: ${err.message}`));
        ws.terminate();
    });
}

setInterval(async () => {
    if(dontPing || !KEEP_ALIVE) return;

    try {
        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] (Keep-Alive) Trying request to ${httpUrl}/ping...`));
        }

        await axios.get(`${httpUrl}/ping`);

        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] (Keep-Alive) Request successful.`));
        }
    } catch(error) {
        dontPing = true;

        if(VERBOSE) {
            console.log(chalk.dim(`[${new Date().toISOString()}] (Keep-Alive) Request failed: ${error.message}`));
        }
    }
}, PING);

console.log(chalk.green(`[Webhook Tunnel] - Client`));
console.log(chalk.magenta(`${httpUrl}/webhook`) + ' => ' + chalk.cyan(TARGET_URL));
console.log('');

connect();