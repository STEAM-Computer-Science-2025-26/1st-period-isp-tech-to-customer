import { FastifyInstance } from 'fastify';
import { query } from '../db';

export async function jobRoutes(fastify: FastifyInstance){
    // List all jobs
    fastify.get('/jobs', async (request, reply) => {
        const jobs = await query('SELECT * FROM jobs ORDER by created_at DESC')
        return{ jobs };
    });
    // Create a new job
    fastify.post('/jobs', async (request, reply) => {
        const body = request.body as { customerName: string, address: string };
        const result = await query(
            'INSERT INTO jobs (customer_name, address) VALUES ($1, $2) RETURNING *',
            [body.customerName, body.address]
        );
        return{ job: result[0] };
    });
    // Update job status
    fastify.put('/jobs/:jobId/status', async (request, reply) => {
        const { jobId } = request.params as { jobId: string };
        const body = request.body as { status: string };
        const result = await query(
            'UPDATE jobs SET status = $1 WHERE id = $2 RETURNING *',
            [body.status, jobId]
        );
        return{ job: result[0] };
    });
    //delete a job
    fastify.delete('/jobs/:jobId', async (request, reply) => {
        const { jobId } = request.params as { jobId: string };
        await query(
            'DELETE FROM jobs WHERE id = $1',
            [jobId]
        );
        return{ message: `Job ${jobId} deleted` };
    });








}