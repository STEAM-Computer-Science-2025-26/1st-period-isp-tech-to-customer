import { FastifyInstance } from "fastify";

export async function realtimeRoutes(fastify: FastifyInstance) {
  fastify.get("/ws/jobs", { websocket: true }, (socket, req) => {
    socket.on("message", (msg) => {
      // broadcast to all connected clients
      fastify.websocketServer.clients.forEach((client) => {
        if (client.readyState === 1) client.send(msg.toString());
      });
    });
  });
}