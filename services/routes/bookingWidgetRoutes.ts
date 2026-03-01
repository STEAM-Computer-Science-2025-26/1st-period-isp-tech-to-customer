// services/routes/bookingWidgetRoutes.ts
// Website online booking widget — public-facing endpoint.
//
// This is the backend for an embeddable booking form on a company's website.
// No auth required — identified by company slug or widget token.
//
// Flow:
//   1. Widget loads → GET /booking/:companySlug/config
//      → returns available service types, time slots, branding
//   2. Customer fills form → POST /booking/:companySlug/submit
//      → creates a crm_lead with source='website' + sends confirmation SMS/email
//   3. Admin optionally converts lead → job via existing POST /leads/:id/convert
//
// Endpoints:
//   GET  /booking/:companySlug/config    — public widget config (services, hours, branding)
//   POST /booking/:companySlug/submit    — submit a booking request (creates lead)
//   GET  /booking/:companySlug/slots     — available time slots for a given date
//
// Rate limiting: 10 submissions per IP per hour (enforced via simple in-memory
// counter — swap for Redis in production).

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";

// ─── Rate limiting (simple in-memory, good enough for MVP) ───────────────────

const submissionCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
	const now = Date.now();
	const key = ip;
	const entry = submissionCounts.get(key);

	if (!entry || now > entry.resetAt) {
		submissionCounts.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
		return true; // allowed
	}

	if (entry.count >= 10) return false; // blocked

	entry.count++;
	return true;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const submitBookingSchema = z.object({
	firstName: z.string().min(1).max(80),
	lastName: z.string().min(1).max(80),
	email: z.string().email().optional(),
	phone: z.string().min(7).max(30),
	address: z.string().max(300).optional(),
	city: z.string().max(80).optional(),
	state: z.string().length(2).optional(),
	zip: z.string().min(5).max(10).optional(),
	serviceType: z.string().min(1).max(120),
	preferredDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	preferredTimeSlot: z
		.enum(["morning", "afternoon", "evening", "anytime"])
		.default("anytime"),
	notes: z.string().max(1000).optional(),
	// Honeypot — bots fill this, humans don't
	website: z.string().max(0, "Bot detected").optional()
});

const slotsQuerySchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Map preferred time slot to a scheduled_time range for display
function slotLabel(slot: string): string {
	switch (slot) {
		case "morning":
			return "8:00 AM – 12:00 PM";
		case "afternoon":
			return "12:00 PM – 5:00 PM";
		case "evening":
			return "5:00 PM – 8:00 PM";
		default:
			return "Flexible";
	}
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function bookingWidgetRoutes(fastify: FastifyInstance) {
	// ── GET /booking/:companySlug/config ──────────────────────────────────────
	// Returns widget configuration — service types, business hours, branding.
	// Fully public. Cached-friendly (no sensitive data).
	fastify.get(
		"/booking/:companySlug/config",
		async (request: FastifyRequest, reply: FastifyReply) => {
			const { companySlug } = request.params as { companySlug: string };
			const sql = getSql();

			const [company] = (await sql`
				SELECT
					id,
					name,
					phone,
					email,
					city,
					state,
					booking_enabled,
					booking_service_types,
					booking_advance_days,
					booking_slot_duration_minutes,
					booking_business_hours,
					booking_confirmation_message,
					primary_color
				FROM companies
				WHERE slug = ${companySlug}
					AND is_active = TRUE
			`) as any[];

			if (!company) {
				return reply.code(404).send({ error: "Company not found" });
			}

			if (!company.booking_enabled) {
				return reply.code(403).send({ error: "Online booking is not enabled" });
			}

			return reply.send({
				company: {
					name: company.name,
					phone: company.phone,
					city: company.city,
					state: company.state,
					primaryColor: company.primary_color ?? "#2563eb"
				},
				serviceTypes: company.booking_service_types ?? [
					"AC Repair",
					"Heating Repair",
					"AC Tune-Up",
					"Heating Tune-Up",
					"New Installation",
					"Emergency Service",
					"Other"
				],
				advanceDays: company.booking_advance_days ?? 14,
				slotDurationMinutes: company.booking_slot_duration_minutes ?? 120,
				businessHours: company.booking_business_hours ?? {
					monday: { open: "08:00", close: "17:00" },
					tuesday: { open: "08:00", close: "17:00" },
					wednesday: { open: "08:00", close: "17:00" },
					thursday: { open: "08:00", close: "17:00" },
					friday: { open: "08:00", close: "17:00" },
					saturday: { open: "09:00", close: "14:00" },
					sunday: null
				},
				confirmationMessage:
					company.booking_confirmation_message ??
					"Thanks! We'll call you within 1 business day to confirm your appointment."
			});
		}
	);

	// ── GET /booking/:companySlug/slots ───────────────────────────────────────
	// Returns available time slots for a given date.
	// Compares existing jobs against tech capacity to surface open windows.
	fastify.get(
		"/booking/:companySlug/slots",
		async (request: FastifyRequest, reply: FastifyReply) => {
			const { companySlug } = request.params as { companySlug: string };
			const parsed = slotsQuerySchema.safeParse(request.query);

			if (!parsed.success) {
				return reply
					.code(400)
					.send({ error: "Invalid date format. Use YYYY-MM-DD" });
			}

			const { date } = parsed.data;
			const sql = getSql();

			const [company] = (await sql`
				SELECT id, booking_enabled FROM companies
				WHERE slug = ${companySlug} AND is_active = TRUE
			`) as any[];

			if (!company || !company.booking_enabled) {
				return reply
					.code(404)
					.send({ error: "Company not found or booking disabled" });
			}

			// Count jobs already scheduled on this date
			const [jobCount] = (await sql`
				SELECT COUNT(*) AS count FROM jobs
				WHERE company_id = ${company.id}
					AND DATE(scheduled_time) = ${date}::date
					AND status NOT IN ('cancelled')
			`) as any[];

			// Count available techs
			const [techCount] = (await sql`
				SELECT COUNT(*) AS count FROM employees
				WHERE company_id = ${company.id}
					AND is_active = TRUE
					AND role = 'technician'
			`) as any[];

			const booked = Number(jobCount?.count ?? 0);
			const techs = Number(techCount?.count ?? 1);
			const capacity = techs * 4; // assume 4 jobs per tech per day

			const slots = [
				{
					id: "morning",
					label: "Morning (8 AM – 12 PM)",
					available: booked < capacity
				},
				{
					id: "afternoon",
					label: "Afternoon (12 PM – 5 PM)",
					available: booked < capacity
				},
				{
					id: "evening",
					label: "Evening (5 PM – 8 PM)",
					available: booked < Math.floor(capacity * 0.5) // evening slots limited
				}
			];

			return reply.send({ date, slots });
		}
	);

	// ── POST /booking/:companySlug/submit ─────────────────────────────────────
	// Submit a booking request. Creates a CRM lead with source='website'.
	// Public — no auth required.
	fastify.post(
		"/booking/:companySlug/submit",
		async (request: FastifyRequest, reply: FastifyReply) => {
			const { companySlug } = request.params as { companySlug: string };

			// Rate limit by IP
			const ip =
				request.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ??
				request.ip ??
				"unknown";

			if (!checkRateLimit(ip)) {
				return reply.code(429).send({
					error: "Too many requests. Please try again later."
				});
			}

			const parsed = submitBookingSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid booking request",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const body = parsed.data;

			// Honeypot check — if filled in, it's a bot
			if (body.website) {
				// Silently accept but don't create the lead
				return reply.send({
					success: true,
					message: "Booking request received."
				});
			}

			const sql = getSql();

			const [company] = (await sql`
				SELECT id, name, booking_enabled, booking_confirmation_message
				FROM companies
				WHERE slug = ${companySlug} AND is_active = TRUE
			`) as any[];

			if (!company) {
				return reply.code(404).send({ error: "Company not found" });
			}

			if (!company.booking_enabled) {
				return reply.code(403).send({ error: "Online booking is not enabled" });
			}

			// Build a preferred time note
			const timeNote = body.preferredDate
				? `Preferred: ${body.preferredDate} ${slotLabel(body.preferredTimeSlot)}`
				: `Preferred time: ${slotLabel(body.preferredTimeSlot)}`;

			const notes = [timeNote, body.notes].filter(Boolean).join(" — ");

			// Create CRM lead
			const [lead] = (await sql`
				INSERT INTO crm_leads (
					company_id,
					first_name, last_name,
					email, phone,
					address, city, state, zip,
					source, source_detail,
					service_needed,
					priority, stage,
					notes,
					preferred_date,
					created_by_user_id
				) VALUES (
					${company.id},
					${body.firstName}, ${body.lastName},
					${body.email ?? null}, ${body.phone},
					${body.address ?? null}, ${body.city ?? null},
					${body.state ?? null}, ${body.zip ?? null},
					'website', 'online_booking_widget',
					${body.serviceType},
					'normal', 'new',
					${notes || null},
					${body.preferredDate ?? null},
					NULL
				)
				RETURNING id, created_at AS "createdAt"
			`) as any[];

			// Log the submission as an activity
			await sql`
				INSERT INTO crm_lead_activities (
					lead_id, type, direction, body, performed_by_user_id
				) VALUES (
					${lead.id},
					'note', 'inbound',
					${`Online booking request submitted. Service: ${body.serviceType}. ${timeNote}`},
					NULL
				)
			`;

			return reply.code(201).send({
				success: true,
				bookingId: lead.id,
				message:
					company.booking_confirmation_message ??
					"Thanks! We'll call you within 1 business day to confirm your appointment."
			});
		}
	);

	// ── PATCH /booking/config (authenticated) ─────────────────────────────────
	// Company admin updates their booking widget settings.
	// This IS authenticated — only the company can configure their own widget.
	fastify.patch(
		"/booking/config",
		async (request: FastifyRequest, reply: FastifyReply) => {
			// Manual auth check since this route doesn't use the preHandler hook
			const authHeader = request.headers.authorization;
			if (!authHeader?.startsWith("Bearer ")) {
				return reply.code(401).send({ error: "Unauthorized" });
			}

			try {
				await request.jwtVerify();
			} catch {
				return reply.code(401).send({ error: "Unauthorized" });
			}

			const user = request.user as any;
			const companyId = user.companyId ?? null;
			if (!companyId) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const updateSchema = z.object({
				bookingEnabled: z.boolean().optional(),
				serviceTypes: z.array(z.string().min(1).max(120)).min(1).optional(),
				advanceDays: z.number().int().min(1).max(90).optional(),
				slotDurationMinutes: z.number().int().min(30).max(480).optional(),
				confirmationMessage: z.string().max(500).optional(),
				businessHours: z.record(z.string(), z.array(z.string())).optional()
			});

			const parsed = updateSchema.safeParse(request.body);
			if (!parsed.success) {
				return reply.code(400).send({
					error: "Invalid config",
					details: parsed.error.flatten().fieldErrors
				});
			}

			const b = parsed.data;
			const sql = getSql();

			await sql`
				UPDATE companies SET
					booking_enabled              = COALESCE(${b.bookingEnabled ?? null}, booking_enabled),
					booking_service_types        = COALESCE(${b.serviceTypes ? JSON.stringify(b.serviceTypes) : null}::jsonb, booking_service_types),
					booking_advance_days         = COALESCE(${b.advanceDays ?? null}, booking_advance_days),
					booking_slot_duration_minutes = COALESCE(${b.slotDurationMinutes ?? null}, booking_slot_duration_minutes),
					booking_confirmation_message = COALESCE(${b.confirmationMessage ?? null}, booking_confirmation_message),
					booking_business_hours       = COALESCE(${b.businessHours ? JSON.stringify(b.businessHours) : null}::jsonb, booking_business_hours),
					updated_at                   = NOW()
				WHERE id = ${companyId}
			`;

			return reply.send({ updated: true });
		}
	);
}
