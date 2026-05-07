# webhook-tunnel

Túnel para testar Webhooks localmente. Ideal para validar fluxos de notificações de gateways de pagamento ou qualquer outra ferramenta online, encaminhando as requisições diretamente para sua máquina local.

## Configuração do Servidor

Um servidor online deve ser configurado inicialmente para servir como ponto de entrada público para as notificações.

O servidor precisa estar acessível publicamente pelo IP ou devidamente apontado pra uma URL usando DNS, e deve ter suporte para rodar Node.js.

### Passos para configuração

1. Clone o repositório na pasta pública do servidor.
2. Inicie o servidor através do comando `npm start` ou `npm run server`.

O servidor será iniciado automaticamente e ficará ouvindo requisições na **porta 80**. Para definir uma porta diferente, use um dos comandos na inicialização:

- `npm start -- --port=9000` ou
- `npm run server -- --port=9000`.

## Configuração do Cliente

O cliente deve rodar na máquina local onde você quer receber as notificações. Deve ter suporte para rodar Node.js.

### Passos para configuração

1. Clone o repositório na máquina local.
2. Inicie o cliente através do comando:

`npm run client -- --server=<IP ou URL do servidor> --target=<URL de destino>`.

O argumento **server** deve incluir o endereço de IP público ou URL do servidor configurado previamente. Por padrão, é usado `http://localhost`.

O argumento **target** se refere à URL de destino (na sua máquina local) para onde as notificações devem ser encaminhadas. Por padrão, é usado `http://localhost:3000/webhook`. Essa URL deve estar de acordo com sua implementação local.
