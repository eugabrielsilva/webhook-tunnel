# Webhook Tunnel

Ferramenta para criar um **túnel HTTP** e testar webhooks localmente.

Ideal para desenvolvimento e validação de integrações com gateways de pagamento, APIs externas e qualquer serviço que envie notificações via webhook.

O **webhook-tunnel** recebe requisições em um servidor público e as encaminha diretamente para sua aplicação rodando localmente.

## Casos de uso

- Teste de webhooks de gateways de pagamento
- Desenvolvimento local de integrações
- Recebimento de callbacks externos
- Debug de notificações HTTP
- Desenvolvimento de APIs locais sem deploy público

## Como funciona

O projeto é dividido em duas partes:

- **Servidor:** recebe as requisições públicas da internet.
- **Cliente:** mantém uma conexão com o servidor e encaminha as requisições para sua aplicação local.

Fluxo:

```
Serviço Externo → Servidor Público → Cliente Local → Sua API Local
```

## Requisitos

- **Node.js versão 22** ou superior instalado
- Um servidor com acesso público à internet (VPS, cloud ou servidor próprio)
- Domínio ou IP público (opcional, mas recomendado)

## Configuração do Servidor

O servidor funciona como ponto de entrada público para os webhooks.

Ele deve estar acessível pela internet através de um IP público ou domínio configurado via DNS.

### Instalação

Clone o repositório no servidor:

```bash
git clone https://github.com/eugabrielsilva/webhook-tunnel
cd webhook-tunnel
```

Instale as dependências:

```bash
npm install
```

### Inicialização

Inicie o servidor com:

```bash
npm start
```

ou

```bash
npm run server
```

> [!NOTE]
> Por padrão, o servidor será iniciado na porta **80**.

Você pode alterar a porta informando o número desejado como primeiro parâmetro na inicialização:

```bash
npm run server 9000
```

Nesse exemplo, o servidor será iniciado na porta **9000**.

## Configuração do Cliente

O cliente deve ser executado na máquina local que receberá os webhooks.

Ele será responsável por encaminhar as requisições recebidas pelo servidor para sua aplicação local.

### Instalação

Clone o repositório na máquina local:

```bash
git clone https://github.com/eugabrielsilva/webhook-tunnel
cd webhook-tunnel
```

Instale as dependências:

```bash
npm install
```

### Inicialização

Execute o cliente com:

```bash
npm run client <IP-ou-URL-do-servidor> <URL-local>
```

O primeiro parâmetro deve ser o endereço do servidor público configurado anteriormente. Se estiver rodando numa porta diferente da padrão, é necessário informá-la.

O segundo parâmetro é a URL local que irá receber as notificações encaminhadas. Essa URL deve apontar para o endpoint da sua aplicação local responsável pelo webhook.

Exemplo:

```bash
npm run client https://meu-servidor.com http://localhost:3000/webhook
```
