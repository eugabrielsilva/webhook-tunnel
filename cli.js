#!/usr/bin/env node
const minimist = require('minimist');
const args = minimist(process.argv.slice(2));
const chalk = require('chalk');

const type = args?._?.[0] ?? '';

if(type === 'client') {
    require('./src/client');
} else if(type === 'server') {
    require('./src/server');
} else {
    console.log(chalk.green('[Webhook Tunnel] - Usage:'));
    console.log('');
    console.log(chalk.blue('  - Start server:'));
    console.log(chalk.yellow('      webhook-tunnel server ') + chalk.magenta('<port> ') + chalk.gray('[--timeout --verbose]'));
    console.log('');
    console.log(chalk.blue('  - Start client:'));
    console.log(chalk.yellow('      webhook-tunnel client ') + chalk.magenta('<server> <target> ') + chalk.gray('[--timeout --retry --ping --keep-alive --verbose]'));
    console.log('');
}