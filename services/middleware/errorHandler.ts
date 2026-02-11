import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { getPublicError } from "../publicErrors";
import { randomBytes } from "crypto";

export function errorHandler(
	error: FastifyError,
	request: FastifyRequest,
	reply: FastifyReply
) {
	// Generate request ID for tracing
	const requestId = randomBytes(8).toString("hex");

	// Log full error internally (for debugging)
	request.log.error(
		{
			requestId,
			error: {
				message: error.message,
				stack: error.stack,
				code: error.code,
				statusCode: error.statusCode
			},
			request: {
				method: request.method,
				url: request.url,
				params: request.params,
				query: request.query,
				// Don't log request body (might contain passwords)
				headers: {
					"user-agent": request.headers["user-agent"],
					"content-type": request.headers["content-type"]
				}
			}
		},
		"Request failed"
	);

	// Determine error type and status code
	let statusCode = error.statusCode || 500;
	let errorCode = "INTERNAL_ERROR";

	// Map common errors to appropriate codes
	if (error.validation) {
		errorCode = "VALIDATION_ERROR";
		statusCode = 400;
	} else if (error.statusCode === 401) {
		errorCode = "AUTH_ERROR";
	} else if (error.statusCode === 403) {
		errorCode = "FORBIDDEN";
	} else if (error.statusCode === 404) {
		errorCode = "NOT_FOUND";
	} else if (error.statusCode === 429) {
		errorCode = "RATE_LIMIT";
	}

	// Get sanitized error message
	const publicError = getPublicError(errorCode);

	// Return safe error response
	return reply.code(statusCode).send({
		error: publicError.message,
		code: errorCode,
		action: publicError.action,
		requestId,
		// Include validation details if available
		...(error.validation && { details: error.validation })
	});
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
	return reply.code(404).send({
		error: "Endpoint not found",
		path: request.url,
		method: request.method,
		message: "The requested endpoint does not exist"
	});
}