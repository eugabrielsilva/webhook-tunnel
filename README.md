# Webhook Tunnel

Webhook Tunnel is a small Node.js utility for testing webhooks against a local application that is not directly reachable from the internet.

It works by splitting the flow into two processes:

- A server that exposes a public HTTP endpoint and accepts WebSocket connections.
- A client that connects to that server, receives webhook payloads, forwards them to a local target URL, and sends the target response back to the server.

The original webhook caller receives the response produced by your local application, including status code, headers, and body.

## How It Works

1. An external service sends a POST request to the tunnel server at `/webhook`.
2. The server assigns a unique `requestId` and forwards the request data to the connected client over WebSocket.
3. The client sends the webhook to your local application.
4. The client captures the local application's response and sends it back to the server.
5. The server returns that response to the original webhook sender.

This makes it possible to test webhook integrations locally without exposing your application directly.

## Features

- HTTP webhook endpoint exposed by the server
- WebSocket-based delivery between server and client
- Request/response correlation using `requestId`
- Response passthrough with status, headers, and body
- Automatic client reconnection with retry support
- Optional keep-alive health checks
- Docker Compose support for local development
- Verbose logging for troubleshooting

## Requirements

- Node.js 22+ recommended
- npm

## Installation

Install dependencies:

```bash
npm install
```

## CLI Usage

The package exposes the `webhook-tunnel` CLI and also supports running through npm scripts.

### Start the server

```bash
webhook-tunnel server <port> [--timeout <ms>] [--verbose]
```

Examples:

```bash
webhook-tunnel server 5555
webhook-tunnel server 8080 --timeout 45000 --verbose
```

### Start the client

```bash
webhook-tunnel client <server> <target> [--timeout <ms>] [--retry <count>] [--ping <ms>] [--keep-alive] [--verbose]
```

Examples:

```bash
webhook-tunnel client http://localhost:5555 http://localhost:3000/webhook
webhook-tunnel client webhook.example.com:5555 http://localhost:3000/webhook --retry 10 --keep-alive --verbose
```

## Endpoints

### `GET /ping`

Health check endpoint used by the client before opening the WebSocket connection and during optional keep-alive checks.

Response:

```json
{
  "message": "pong"
}
```

### `POST /webhook`

Receives a webhook payload and forwards it to the connected client.

Request body:

- Any JSON payload supported by your webhook provider

Response:

- Mirrors the response returned by your local target URL when a client is connected
- Returns an error response when no client is available or when forwarding fails

## Configuration

Both the server and client can be configured through CLI arguments or environment variables. CLI arguments take precedence over environment variables.

### Server options

| Option      | Environment variable | Default | Description                                                |
| ----------- | -------------------- | ------- | ---------------------------------------------------------- |
| `port`      | `SERVER_PORT`        | `5555`  | HTTP and WebSocket server port                             |
| `--timeout` | `SERVER_TIMEOUT`     | `30000` | Maximum time to wait for a client response in milliseconds |
| `--verbose` | `SERVER_VERBOSE`     | `false` | Enables extra diagnostic logging                           |

### Client options

| Option         | Environment variable | Default                         | Description                                                    |
| -------------- | -------------------- | ------------------------------- | -------------------------------------------------------------- |
| `server`       | `CLIENT_SERVER_URL`  | `http://localhost:5555`         | Tunnel server URL                                              |
| `target`       | `CLIENT_TARGET_URL`  | `http://localhost:3000/webhook` | Local application endpoint that receives the forwarded webhook |
| `--timeout`    | `CLIENT_TIMEOUT`     | `5000`                          | Delay between reconnect attempts in milliseconds               |
| `--retry`      | `CLIENT_RETRY`       | `5`                             | Number of initial connection retries before exiting            |
| `--ping`       | `CLIENT_PING`        | `30000`                         | Interval between keep-alive health checks in milliseconds      |
| `--keep-alive` | `CLIENT_KEEP_ALIVE`  | `false`                         | Enables periodic `GET /ping` checks after connection           |
| `--verbose`    | `CLIENT_VERBOSE`     | `false`                         | Enables extra diagnostic logging                               |

## Example Local Workflow

### 1. Start your local webhook consumer

Example local application endpoint:

```text
http://localhost:3000/webhook
```

### 2. Start the tunnel server

```bash
webhook-tunnel server 5555
```

### 3. Start the tunnel client

```bash
webhook-tunnel client http://localhost:5555 http://localhost:3000/webhook
```

### 4. Send a test request to the server

```bash
curl -i -X POST http://localhost:5555/webhook \
	-H "Content-Type: application/json" \
	-d '{"event":"payment.created","id":"evt_123"}'
```

If the client is connected and your local endpoint is healthy, the HTTP response returned by your local application will be sent back through the tunnel.

## Docker Compose

The repository includes a `docker-compose.yml` file with two services:

- `webhook_tunnel_server`
- `webhook_tunnel_client`

Start both services:

```bash
docker compose up -d
```

Stop the stack:

```bash
docker compose down
```

### Docker environment notes

The containers load variables from a `.env` file through `env_file`.

When the client runs inside Docker, `localhost` refers to the container itself, not the server container. Because of that, the client should point to the server service name instead of `localhost`.

Example:

```env
CLIENT_SERVER_URL=http://webhook_tunnel_server:5555
CLIENT_TARGET_URL=http://host.docker.internal:3000/webhook
```

Depending on your Docker setup on Linux, `host.docker.internal` may require extra configuration. If it is unavailable, use an address that resolves from the container to your host machine.

## Response Behavior

The tunnel attempts to preserve the local target response as closely as possible:

- HTTP status code is forwarded back to the original caller
- Response headers are forwarded except hop-by-hop and invalid transport headers
- Response body is forwarded as received from the local target

Some headers are filtered on both client and server sides to avoid HTTP inconsistencies, including:

- `connection`
- `content-length`
- `keep-alive`
- `proxy-authenticate`
- `proxy-authorization`
- `te`
- `trailer`
- `transfer-encoding`
- `upgrade`

The client also removes the `host` header before forwarding a webhook to the local target.

## Logging

The application prints structured console logs with timestamps.

Typical events include:

- Server startup
- Client connection and disconnection
- Incoming webhook payloads
- Successful forwarding to the local target
- Retry attempts and connection failures
- Timeout and disconnection errors

Use `--verbose` on either process when you need additional internal details.

## Error Cases

The server returns explicit HTTP errors in the following cases:

### No client connected

Status: `503 Service Unavailable`

```json
{
  "error": "No client connected to forward the webhook."
}
```

### Client response timeout

Status: `504 Gateway Timeout`

```json
{
  "error": "Client response timeout."
}
```

### Client disconnected during processing

Status: `503 Service Unavailable`

```json
{
  "error": "Client disconnected during response."
}
```

### Generic forwarding error

Status: `502 Bad Gateway`

```json
{
  "error": "Error forwarding webhook to client."
}
```

## Notes and Limitations

- Only one client is kept active at a time. If a new client connects, the previous client connection is terminated.
