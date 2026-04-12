"use client";

import { useEffect, useRef } from "react";

type WindFieldBackgroundProps = {
	className?: string;
	// Multiplier for how strongly the cursor bends particle angles.
	interactionCoefficient?: number;
	// Cursor influence radius in pixels.
	interactionRadius?: number;
};

type Particle = {
	x: number;
	y: number;
	baseAngle: number;
	angle: number;
	radius: number;
};

// Particle count per viewport area. Higher values create a denser stream.
const BASE_DENSITY = 0.0002;
// Hard lower bound for particle count on very small screens.
const MIN_PARTICLES = 700;
// Hard upper bound for particle count to protect performance.
const MAX_PARTICLES = 2800;
// Cap device pixel ratio so high-DPI screens do not overdraw too much.
const MAX_DPR = 2;
// Base particle speed in pixels per millisecond.
const FLOW_SPEED_PX_PER_MS = 0.204;
// Random spawn angle range (radians). Higher = more chaotic initial headings.
const SPAWN_ANGLE_SPREAD_RAD = 0.16;
// How quickly particle heading rotates toward desired angle each frame.
const TURN_RESPONSE = 0.2;
// Overall strength of local "flow around cursor" angular deflection.
const FLOW_AROUND_BLEND = 3;
// Fraction of interaction radius treated as the obstacle core.
const OBSTACLE_RADIUS_FACTOR = 0.22;
// Curve for influence falloff: lower = influence stays stronger farther out.
const INTERACTION_FALLOFF_POWER = 0.2;
// Drawn particle size (canvas circle radius in px).
const PARTICLE_RADIUS = 2.9;
// Offscreen distance used before respawning particles at the left edge.
const RESPAWN_MARGIN = 36;
// Left-side "hot" color (dusty orange) before particles cool.
const HOT_STREAM_COLOR = "rgba(172, 122, 86, 0.74)";
// Right-side cooled color (accent teal).
const COOL_STREAM_COLOR = "rgba(83, 171, 177, 0.62)";

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export default function WindFieldBackground({
	className,
	interactionCoefficient = 1,
	interactionRadius = 170
}: WindFieldBackgroundProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const particlesRef = useRef<Particle[]>([]);
	const rafIdRef = useRef<number | null>(null);
	const lastTsRef = useRef<number>(0);
	const sizeRef = useRef({ width: 0, height: 0 });
	const mouseRef = useRef({
		x: -9999,
		y: -9999,
		active: false
	});
	const smoothedMouseRef = useRef({ x: -9999, y: -9999 });
	const cachedGradientRef = useRef<CanvasGradient | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const context = canvas.getContext("2d", { alpha: true });
		if (!context) return;

		const createParticle = (
			width: number,
			height: number,
			seedAcrossViewport: boolean
		): Particle => {
			const baseAngle = (Math.random() - 0.5) * SPAWN_ANGLE_SPREAD_RAD;
			const historyOffset = seedAcrossViewport ? Math.random() * width : 0;
			return {
				x: -RESPAWN_MARGIN - historyOffset,
				y: Math.random() * height,
				baseAngle,
				angle: baseAngle,
				radius: PARTICLE_RADIUS
			};
		};

		const respawnParticle = (particle: Particle, height: number) => {
			const baseAngle = (Math.random() - 0.5) * SPAWN_ANGLE_SPREAD_RAD;
			particle.x = -RESPAWN_MARGIN - Math.random() * 24;
			particle.y = Math.random() * height;
			particle.baseAngle = baseAngle;
			particle.angle = baseAngle;
		};

		const syncParticleCount = (width: number, height: number) => {
			const targetCount = clamp(
				Math.floor(width * height * BASE_DENSITY),
				MIN_PARTICLES,
				MAX_PARTICLES
			);
			const particles = particlesRef.current;

			if (particles.length < targetCount) {
				const toCreate = targetCount - particles.length;
				for (let index = 0; index < toCreate; index += 1) {
					particles.push(createParticle(width, height, true));
				}
			} else if (particles.length > targetCount) {
				particles.length = targetCount;
			}
		};

		const resizeCanvas = () => {
			const width = window.innerWidth;
			const height = window.innerHeight;
			const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

			sizeRef.current.width = width;
			sizeRef.current.height = height;

			canvas.width = Math.floor(width * dpr);
			canvas.height = Math.floor(height * dpr);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;

			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			cachedGradientRef.current = null;
			particlesRef.current = [];
			syncParticleCount(width, height);
		};

		const onPointerMove = (event: PointerEvent) => {
			mouseRef.current.x = event.clientX;
			mouseRef.current.y = event.clientY;
			mouseRef.current.active = true;
		};

		const onPointerEnter = (event: PointerEvent) => {
			mouseRef.current.x = event.clientX;
			mouseRef.current.y = event.clientY;
			mouseRef.current.active = true;
		};

		const onPointerLeave = () => {
			mouseRef.current.active = false;
		};

		resizeCanvas();

		const drawFrame = (timestamp: number) => {
			const width = sizeRef.current.width;
			const height = sizeRef.current.height;
			if (width === 0 || height === 0) {
				rafIdRef.current = window.requestAnimationFrame(drawFrame);
				return;
			}

			const previousTs = lastTsRef.current || timestamp;
			const dtMs = clamp(timestamp - previousTs, 8, 34);
			const dt = dtMs / 16.6667;
			lastTsRef.current = timestamp;

			smoothedMouseRef.current.x +=
				(mouseRef.current.x - smoothedMouseRef.current.x) * 0.16;
			smoothedMouseRef.current.y +=
				(mouseRef.current.y - smoothedMouseRef.current.y) * 0.16;

			context.clearRect(0, 0, width, height);

			const particles = particlesRef.current;
			const radius = interactionRadius;
			const radiusSq = radius * radius;
			const coefficient = Math.max(0, interactionCoefficient);

			context.beginPath();
			for (let index = 0; index < particles.length; index += 1) {
				const particle = particles[index];
				let desiredAngle = particle.baseAngle;

				if (mouseRef.current.active) {
					const dx = particle.x - smoothedMouseRef.current.x;
					const dy = particle.y - smoothedMouseRef.current.y;
					const distSq = dx * dx + dy * dy;

					if (distSq < radiusSq) {
						const dist = Math.sqrt(distSq) + 0.0001;
						const theta = Math.atan2(dy, dx);
						const obstacleRadius = radius * OBSTACLE_RADIUS_FACTOR;
						const safeDist = Math.max(dist, obstacleRadius * 1.02);
						const safeDistSq = safeDist * safeDist;
						const ratio =
							(obstacleRadius * obstacleRadius) / Math.max(1, safeDistSq);
						const localFlowX = 1 - ratio * Math.cos(2 * theta);
						const localFlowY = -ratio * Math.sin(2 * theta);
						const aroundAngle = Math.atan2(localFlowY, localFlowX);

						const falloff = Math.pow(
							1 - dist / radius,
							INTERACTION_FALLOFF_POWER
						);
						const blend = falloff * FLOW_AROUND_BLEND * coefficient;

						desiredAngle = particle.baseAngle + aroundAngle * blend;
					}
				}

				particle.angle += (desiredAngle - particle.angle) * TURN_RESPONSE * dt;

				const step = FLOW_SPEED_PX_PER_MS * dtMs;
				particle.x += Math.cos(particle.angle) * step;
				particle.y += Math.sin(particle.angle) * step;

				if (
					particle.x > width + RESPAWN_MARGIN ||
					particle.y < -RESPAWN_MARGIN ||
					particle.y > height + RESPAWN_MARGIN
				) {
					respawnParticle(particle, height);
				}

				context.moveTo(particle.x + particle.radius, particle.y);
				context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
			}

			if (cachedGradientRef.current === null) {
				const thermalGradient = context.createLinearGradient(
					-RESPAWN_MARGIN,
					0,
					width + RESPAWN_MARGIN,
					0
				);
				thermalGradient.addColorStop(0, HOT_STREAM_COLOR);
				thermalGradient.addColorStop(0.3, "rgba(146, 140, 121, 0.7)");
				thermalGradient.addColorStop(0.5, COOL_STREAM_COLOR);
				thermalGradient.addColorStop(1, COOL_STREAM_COLOR);
				cachedGradientRef.current = thermalGradient;
			}

			context.fillStyle = cachedGradientRef.current;
			context.fill();

			rafIdRef.current = window.requestAnimationFrame(drawFrame);
		};

		const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

		const onMotionChange = (event: MediaQueryListEvent) => {
			if (event.matches) {
				if (rafIdRef.current !== null) {
					window.cancelAnimationFrame(rafIdRef.current);
					rafIdRef.current = null;
				}
			} else {
				if (rafIdRef.current === null) {
					rafIdRef.current = window.requestAnimationFrame(drawFrame);
				}
			}
		};

		if (!motionQuery.matches) {
			rafIdRef.current = window.requestAnimationFrame(drawFrame);
		}

		motionQuery.addEventListener("change", onMotionChange);
		window.addEventListener("resize", resizeCanvas);
		window.addEventListener("pointerenter", onPointerEnter);
		window.addEventListener("pointermove", onPointerMove, { passive: true });
		window.addEventListener("pointerleave", onPointerLeave);
		window.addEventListener("blur", onPointerLeave);

		return () => {
			if (rafIdRef.current !== null) {
				window.cancelAnimationFrame(rafIdRef.current);
			}
			motionQuery.removeEventListener("change", onMotionChange);
			window.removeEventListener("resize", resizeCanvas);
			window.removeEventListener("pointerenter", onPointerEnter);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerleave", onPointerLeave);
			window.removeEventListener("blur", onPointerLeave);
		};
	}, [interactionCoefficient, interactionRadius]);

	return (
		<div
			aria-hidden="true"
			className={`pointer-events-none fixed inset-0 z-0 ${className ?? ""}`}
		>
			<canvas ref={canvasRef} className="h-full w-full" />
		</div>
	);
}
