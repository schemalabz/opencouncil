import { InMemoryTransport, LATEST_PROTOCOL_VERSION, type JSONRPCMessage, type McpServer } from '@modelcontextprotocol/server';

export type JsonRpcResponse = { id: number; result?: Record<string, unknown>; error?: { code: number; message: string } };
export type CallResult = { isError?: boolean; content: { text: string }[] };
export type ListedTool = {
    name: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
};

/**
 * Connect a client end that sends raw JSON-RPC to a real McpServer, and
 * initialize the session. The server converts the tool schemas and validates
 * the calls exactly as it does behind the route.
 */
export async function connectInMemory(server: McpServer) {
    const [client, serverEnd] = InMemoryTransport.createLinkedPair();
    const pending = new Map<number, (response: JsonRpcResponse) => void>();
    client.onmessage = (message: JSONRPCMessage) => {
        const response = message as unknown as JsonRpcResponse;
        pending.get(response.id)?.(response);
    };
    await server.connect(serverEnd);
    await client.start();

    let nextId = 1;
    const request = (method: string, params: Record<string, unknown>) => new Promise<JsonRpcResponse>(resolve => {
        const id = nextId++;
        pending.set(id, resolve);
        void client.send({ jsonrpc: '2.0', id, method, params });
    });
    await request('initialize', {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'jest', version: '0.0.0' },
    });
    await client.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    const call = async (name: string, args: Record<string, unknown>) =>
        (await request('tools/call', { name, arguments: args })).result as CallResult;
    const listTools = async () =>
        (await request('tools/list', {})).result?.tools as ListedTool[];
    return { request, call, listTools, close: () => server.close() };
}
