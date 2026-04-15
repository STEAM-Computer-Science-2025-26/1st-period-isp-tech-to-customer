"use client";

import { useEffect, useRef } from "react";

type WindFieldBackgroundProps = {
	className?: string;
	flowActive?: boolean;
	spawnZoneSelector?: string;
	intakeSelector?: string;
	outletSelector?: string;
	// Multiplier for how strongly the cursor bends particle angles.
	interactionCoefficient?: number;
	// Cursor influence radius in pixels.
	interactionRadius?: number;
};

type ParticleKind = "hero" | "acHot" | "acCool";

type Vec2 = {
	x: number;
	y: number;
};

type CubicPath = {
	p0: Vec2;
	p1: Vec2;
	p2: Vec2;
	p3: Vec2;
	length: number;
};

type ZoneRect = {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
};

type IntakeGuides = {
	left: CubicPath;
	right: CubicPath;
	center: CubicPath;
};

type GuidePreference = "auto" | "left" | "right" | "center";

type Particle = {
	kind: ParticleKind;
	x: number;
	y: number;
	baseAngle: number;
	angle: number;
	radius: number;
	speed: number;
	path?: CubicPath;
	pathProgress?: number;
	guidePreference?: Exclude<GuidePreference, "auto">;
	intakeTargetX?: number;
	jitterPhase?: number;
};

// Particle count per viewport area. Higher values create a denser stream.
const BASE_DENSITY = 0.0002;
// Hard lower bound for particle count on very small screens.
const MIN_PARTICLES = 700;
// Hard upper bound for particle count to protect performance.
const MAX_PARTICLES = 2800;
// Cap device pixel ratio so high-DPI screens do not overdraw too much.
const MAX_DPR = 2;
// Base hero-stream speed in pixels per millisecond.
const HERO_FLOW_SPEED_PX_PER_MS = 0.204;
// AC intake speed in pixels per millisecond.
const HOT_FLOW_SPEED_PX_PER_MS = 0.204;
// Cooled stream speed in pixels per millisecond.
const COOL_FLOW_SPEED_PX_PER_MS = 0.242;
// Random spawn angle range (radians). Higher = more chaotic initial headings.
const SPAWN_ANGLE_SPREAD_RAD = 0.16;
// How quickly particle heading rotates toward desired angle each frame.
const HERO_TURN_RESPONSE = 0.2;
const COOL_TURN_RESPONSE = 0.2;
// Overall strength of local "flow around cursor" angular deflection.
const FLOW_AROUND_BLEND = 3;
// Fraction of interaction radius treated as the obstacle core.
const OBSTACLE_RADIUS_FACTOR = 0.22;
// Curve for influence falloff: lower = influence stays stronger farther out.
const INTERACTION_FALLOFF_POWER = 0.2;
// Multiplier for how much cursor swirl rotates a desired heading.
const CURSOR_SWIRL_SCALE = 0.34;
// Drawn particle size (canvas circle radius in px).
const PARTICLE_RADIUS = 2.9;
// Offscreen distance used before respawning particles at the left edge.
const RESPAWN_MARGIN = 36;
// Hero speed variance prevents synchronized "wave" despawn/respawn loops.
const HERO_SPEED_MIN_FACTOR = 0.84;
const HERO_SPEED_MAX_FACTOR = 1.22;
// Warmup duration for gradual hero particle fill on load and return transition.
const HERO_FILL_DURATION_MS = 1700;
// Limit how quickly hero population refills after leaving AC mode.
const MAX_HERO_CREATE_PER_FRAME = 18;
// When AC mode is active, cap hot spawns to avoid frame bursts.
const MAX_HOT_SPAWNS_PER_FRAME = 36;
// Extra pickup margin around intake bounds.
const INTAKE_CAPTURE_PADDING = 14;
// Pull top/side capture inward so particles are not removed too early.
const INTAKE_CAPTURE_INSET_PX = 12;
// Capture only near top lip so particles cannot enter from bottom/sides.
const INTAKE_TOP_CAPTURE_DEPTH = 11;
// Start hard top-entry shaping near the end of intake travel.
const TOP_ENTRY_ENFORCE_PROGRESS = 0.68;
// Duration for fading legacy hero particles when AC mode starts.
const HERO_PARTICLE_FADE_OUT_MS = 420;
// Duration for AC particle fade-out when scrolling back up.
const AC_PARTICLE_FADE_OUT_MS = 420;
// Particles at/under this offset from intake top are forced to arc above first.
const INTAKE_FORCE_OVER_TOP_BUFFER_PX = 16;
// Vertical overshoot range used for top-entry arcs.
const INTAKE_OVER_TOP_MIN_PX = 34;
const INTAKE_OVER_TOP_MAX_PX = 86;
// Draw helper curves so the intake envelope is visible while tuning.
const SHOW_GUIDE_CURVES = false;
// Minimum useful path length to keep guidance stable.
const MIN_PATH_LENGTH = 120;
// Left-side "hot" color (dusty orange) before particles cool.
const HOT_STREAM_COLOR = "rgba(219, 20, 20, 1)";
// Right-side cooled color (accent teal).
const COOL_STREAM_COLOR = "rgba(83, 171, 177, 0.9)";

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function normalizeAngle(angle: number): number {
	if (angle > Math.PI) return ((angle + Math.PI) % (Math.PI * 2)) - Math.PI;
	if (angle < -Math.PI) return ((angle - Math.PI) % (Math.PI * 2)) + Math.PI;
	return angle;
}

function toZoneRect(
	rect: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">
): ZoneRect {
	return {
		left: rect.left,
		right: rect.right,
		top: rect.top,
		bottom: rect.bottom,
		width: rect.width,
		height: rect.height,
		centerX: rect.left + rect.width / 2,
		centerY: rect.top + rect.height / 2
	};
}

function cubicPoint(path: CubicPath, t: number): Vec2 {
	const u = 1 - t;
	const tt = t * t;
	const uu = u * u;
	const uuu = uu * u;
	const ttt = tt * t;

	return {
		x:
			uuu * path.p0.x +
			3 * uu * t * path.p1.x +
			3 * u * tt * path.p2.x +
			ttt * path.p3.x,
		y:
			uuu * path.p0.y +
			3 * uu * t * path.p1.y +
			3 * u * tt * path.p2.y +
			ttt * path.p3.y
	};
}

function cubicTangent(path: CubicPath, t: number): Vec2 {
	const u = 1 - t;
	return {
		x:
			3 * u * u * (path.p1.x - path.p0.x) +
			6 * u * t * (path.p2.x - path.p1.x) +
			3 * t * t * (path.p3.x - path.p2.x),
		y:
			3 * u * u * (path.p1.y - path.p0.y) +
			6 * u * t * (path.p2.y - path.p1.y) +
			3 * t * t * (path.p3.y - path.p2.y)
	};
}

function estimatePathLength(path: CubicPath): number {
	let length = 0;
	let previous = path.p0;
	for (let step = 1; step <= 14; step += 1) {
		const point = cubicPoint(path, step / 14);
		length += Math.hypot(point.x - previous.x, point.y - previous.y);
		previous = point;
	}
	return length;
}

function buildGuidedPath(start: Vec2, end: Vec2): CubicPath {
	const dx = end.x - start.x;
	const direction = Math.sign(dx) || 1;
	const horizontalLead = clamp(Math.abs(dx) * 0.4, 32, 180);
	const verticalEntryLead = clamp(Math.abs(end.y - start.y) * 0.16, 20, 56);

	const path: CubicPath = {
		p0: start,
		p1: {
			x: start.x + direction * horizontalLead + randomBetween(-18, 18),
			y: start.y + randomBetween(-6, 6)
		},
		p2: {
			x: end.x + randomBetween(-8, 8),
			y: end.y - verticalEntryLead - randomBetween(10, 34)
		},
		p3: end,
		length: 0
	};

	path.length = Math.max(MIN_PATH_LENGTH, estimatePathLength(path));
	return path;
}

function buildGuideArc(start: Vec2, end: Vec2, peakY: number): CubicPath {
	const dx = end.x - start.x;
	const direction = Math.sign(dx) || 1;
	const horizontalLead = clamp(Math.abs(dx) * 0.45, 36, 220);

	const path: CubicPath = {
		p0: start,
		p1: {
			x: start.x + direction * horizontalLead,
			y: start.y
		},
		p2: {
			x: end.x,
			y: peakY
		},
		p3: end,
		length: 0
	};

	path.length = Math.max(MIN_PATH_LENGTH, estimatePathLength(path));
	return path;
}

function buildIntakeGuides(spawnZone: ZoneRect, intakeZone: ZoneRect): IntakeGuides {
	const startY = spawnZone.bottom;
	const startLeft: Vec2 = { x: spawnZone.left, y: startY };
	const startRight: Vec2 = { x: spawnZone.right, y: startY };
	const startCenter: Vec2 = { x: spawnZone.centerX, y: startY };

	const intakeInset = clamp(intakeZone.width * 0.28, 18, 56);
	const endLeft: Vec2 = { x: intakeZone.left + intakeInset, y: intakeZone.top };
	const endRight: Vec2 = { x: intakeZone.right - intakeInset, y: intakeZone.top };
	const endCenter: Vec2 = { x: intakeZone.centerX, y: intakeZone.top };

	const peakY =
		intakeZone.top -
		clamp(Math.abs(startY - intakeZone.top) * 0.36, INTAKE_OVER_TOP_MIN_PX, 190);

	return {
		left: buildGuideArc(startLeft, endLeft, peakY),
		right: buildGuideArc(startRight, endRight, peakY),
		center: buildGuideArc(startCenter, endCenter, peakY)
	};
}

function traceCubicPath(
	context: CanvasRenderingContext2D,
	path: CubicPath
): void {
	context.moveTo(path.p0.x, path.p0.y);
	context.bezierCurveTo(
		path.p1.x,
		path.p1.y,
		path.p2.x,
		path.p2.y,
		path.p3.x,
		path.p3.y
	);
}

function getGuideForX(
	guides: IntakeGuides | undefined,
	intakeZone: ZoneRect,
	x: number,
	preference: GuidePreference
): CubicPath | undefined {
	if (!guides) return undefined;
	if (preference === "left") return guides.left;
	if (preference === "right") return guides.right;
	if (preference === "center") return guides.center;
	return x <= intakeZone.centerX ? guides.left : guides.right;
}

function buildIntakeTransitionPath(
	start: Vec2,
	end: Vec2,
	intakeZone: ZoneRect,
	_guides?: IntakeGuides,
	_guidePreference: GuidePreference = "auto"
): CubicPath {
	const shouldArcOverTop = start.y > intakeZone.top - INTAKE_FORCE_OVER_TOP_BUFFER_PX;
	if (!shouldArcOverTop) {
		return buildGuidedPath(start, end);
	}

	const dx = end.x - start.x;
	const direction = Math.sign(dx) || 1;
	const horizontalLead = clamp(Math.abs(dx) * 0.42, 34, 210);
	const overTopY =
		intakeZone.top - randomBetween(INTAKE_OVER_TOP_MIN_PX, INTAKE_OVER_TOP_MAX_PX);
	const p1Y = Math.min(
		start.y - randomBetween(4, 16),
		intakeZone.top - randomBetween(18, 34)
	);

	const path: CubicPath = {
		p0: start,
		p1: {
			x: start.x + direction * horizontalLead + randomBetween(-18, 18),
			y: p1Y
		},
		p2: {
			x: end.x + randomBetween(-10, 10),
			y: overTopY + randomBetween(-10, 6)
		},
		p3: end,
		length: 0
	};

	path.length = Math.max(MIN_PATH_LENGTH, estimatePathLength(path));
	return path;
}

function isOffscreen(
	x: number,
	y: number,
	width: number,
	height: number,
	margin: number
): boolean {
	return x > width + margin || x < -margin || y < -margin || y > height + margin;
}

function isInsideExpandedRect(
	x: number,
	y: number,
	rect: ZoneRect,
	padding: number
): boolean {
	return (
		x >= rect.left - padding &&
		x <= rect.right + padding &&
		y >= rect.top - padding &&
		y <= rect.bottom + padding
	);
}

export default function WindFieldBackground({
	className,
	flowActive = false,
	spawnZoneSelector,
	intakeSelector,
	outletSelector,
	interactionCoefficient = 1,
	interactionRadius = 170
}: WindFieldBackgroundProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const particlesRef = useRef<Particle[]>([]);
	const rafIdRef = useRef<number | null>(null);
	const lastTsRef = useRef<number>(0);
	const heroSpawnCarryRef = useRef<number>(0);
	const hotSpawnCarryRef = useRef<number>(0);
	const heroFadeStartTsRef = useRef<number | null>(null);
	const heroFadeOpacityRef = useRef<number>(1);
	const acFadeStartTsRef = useRef<number | null>(null);
	const acFadeOpacityRef = useRef<number>(1);
	const flowActiveRef = useRef<boolean>(flowActive);
	const wasFlowActiveRef = useRef<boolean>(flowActive);
	const sizeRef = useRef({ width: 0, height: 0 });
	const mouseRef = useRef({
		x: -9999,
		y: -9999,
		active: false
	});
	const smoothedMouseRef = useRef({ x: -9999, y: -9999 });
	const cachedGradientRef = useRef<CanvasGradient | null>(null);
	const hotTopCullMarginRef = useRef<number>(RESPAWN_MARGIN);
	const lastScrollYRef = useRef<number>(0);

	useEffect(() => {
		flowActiveRef.current = flowActive;
	}, [flowActive]);

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
			const x = seedAcrossViewport
				? randomBetween(-RESPAWN_MARGIN, width + RESPAWN_MARGIN)
				: -RESPAWN_MARGIN - Math.random() * 24;
			return {
				kind: "hero",
				x,
				y: Math.random() * height,
				baseAngle,
				angle: baseAngle,
				radius: PARTICLE_RADIUS,
				speed:
					HERO_FLOW_SPEED_PX_PER_MS *
					randomBetween(HERO_SPEED_MIN_FACTOR, HERO_SPEED_MAX_FACTOR)
			};
		};

		const respawnParticle = (particle: Particle, height: number, width: number) => {
			const baseAngle = (Math.random() - 0.5) * SPAWN_ANGLE_SPREAD_RAD;
			particle.kind = "hero";
			particle.x =
				-RESPAWN_MARGIN - Math.random() * Math.max(26, width * 0.58);
			particle.y = Math.random() * height;
			particle.baseAngle = baseAngle;
			particle.angle = baseAngle;
			particle.speed =
				HERO_FLOW_SPEED_PX_PER_MS *
				randomBetween(HERO_SPEED_MIN_FACTOR, HERO_SPEED_MAX_FACTOR);
			particle.path = undefined;
			particle.pathProgress = undefined;
		};

		const getZoneFromSelector = (selector?: string): ZoneRect | null => {
			if (!selector) return null;
			const element = document.querySelector<HTMLElement>(selector);
			if (!element) return null;
			return toZoneRect(element.getBoundingClientRect());
		};

		const getSpawnZone = (width: number, height: number): ZoneRect => {
			const zone = getZoneFromSelector(spawnZoneSelector);
			if (zone) return zone;

			const fallbackWidth = Math.max(56, width * 0.22);
			const fallbackHeight = Math.max(96, height * 0.3);
			const pageTop = -window.scrollY;
			return {
				left: 0,
				right: fallbackWidth,
				top: pageTop,
				bottom: pageTop + fallbackHeight,
				width: fallbackWidth,
				height: fallbackHeight,
				centerX: fallbackWidth / 2,
				centerY: pageTop + fallbackHeight / 2
			};
		};

		const getIntakeZone = (width: number, height: number): ZoneRect => {
			const zone = getZoneFromSelector(intakeSelector);
			if (zone) return zone;
			const fallbackWidth = Math.max(160, width * 0.18);
			const fallbackHeight = 52;
			const left = width / 2 - fallbackWidth / 2;
			const top = height * 0.54;
			return {
				left,
				right: left + fallbackWidth,
				top,
				bottom: top + fallbackHeight,
				width: fallbackWidth,
				height: fallbackHeight,
				centerX: left + fallbackWidth / 2,
				centerY: top + fallbackHeight / 2
			};
		};

		const getOutletZone = (
			width: number,
			height: number,
			intakeZone: ZoneRect
		): ZoneRect => {
			const zone = getZoneFromSelector(outletSelector);
			if (zone) return zone;

			const fallbackWidth = Math.max(120, intakeZone.width * 0.72);
			const fallbackHeight = 10;
			const left = clamp(
				intakeZone.centerX - fallbackWidth / 2,
				0,
				Math.max(0, width - fallbackWidth)
			);
			const top = clamp(intakeZone.bottom + 8, 0, Math.max(0, height - fallbackHeight));
			return {
				left,
				right: left + fallbackWidth,
				top,
				bottom: top + fallbackHeight,
				width: fallbackWidth,
				height: fallbackHeight,
				centerX: left + fallbackWidth / 2,
				centerY: top + fallbackHeight / 2
			};
		};

		const toIntakeTarget = (
			intakeZone: ZoneRect,
			_guides?: IntakeGuides,
			preference: GuidePreference = "auto",
			sourceX: number = intakeZone.centerX
		): Vec2 => {
			const lanePreference: Exclude<GuidePreference, "auto"> =
				preference === "auto"
					? sourceX <= intakeZone.centerX
						? "left"
						: "right"
					: preference;

			const edgePadding = clamp(intakeZone.width * 0.14, 14, 44);
			const centerGap = clamp(intakeZone.width * 0.08, 10, 30);

			if (lanePreference === "left") {
				return {
					x: randomBetween(
						intakeZone.left + edgePadding,
						intakeZone.centerX - centerGap
					),
					y: intakeZone.top + randomBetween(2, 8)
				};
			}

			if (lanePreference === "right") {
				return {
					x: randomBetween(
						intakeZone.centerX + centerGap,
						intakeZone.right - edgePadding
					),
					y: intakeZone.top + randomBetween(2, 8)
				};
			}

			return {
				x:
					intakeZone.centerX +
					randomBetween(-intakeZone.width * 0.14, intakeZone.width * 0.14),
				y: intakeZone.top + randomBetween(2, 8)
			};
		};

		const spawnHotParticle = (
			spawnZone: ZoneRect,
			intakeZone: ZoneRect,
			guides: IntakeGuides
		) => {
			const startX = randomBetween(spawnZone.left, spawnZone.right);
			const guidePreference: Exclude<GuidePreference, "auto"> =
				startX <= spawnZone.centerX ? "left" : "right";
			const start: Vec2 = {
				x: startX,
				y: randomBetween(spawnZone.top, spawnZone.bottom)
			};
			const end = toIntakeTarget(
				intakeZone,
				guides,
				guidePreference,
				start.x
			);
			const path = buildIntakeTransitionPath(
				start,
				end,
				intakeZone,
				guides,
				guidePreference
			);
			const tangent = cubicTangent(path, 0);
			const startAngle = Math.atan2(tangent.y, tangent.x);

			particlesRef.current.push({
				kind: "acHot",
				x: start.x,
				y: start.y,
				baseAngle: startAngle,
				angle: startAngle,
				radius: PARTICLE_RADIUS,
				speed: HOT_FLOW_SPEED_PX_PER_MS * randomBetween(0.9, 1.2),
				path,
				pathProgress: 0,
				guidePreference,
				intakeTargetX: end.x,
				jitterPhase: randomBetween(0, Math.PI * 2)
			});
		};

		const spawnCoolParticle = (outletZone: ZoneRect) => {
			particlesRef.current.push({
				kind: "acCool",
				x: randomBetween(outletZone.left, outletZone.right),
				y: randomBetween(outletZone.top, outletZone.bottom),
				baseAngle: Math.PI / 2,
				angle: Math.PI / 2,
				radius: PARTICLE_RADIUS,
				speed: COOL_FLOW_SPEED_PX_PER_MS
			});
		};

		const syncParticleCount = (
			width: number,
			height: number,
			dtMs: number
		) => {
			if (flowActiveRef.current) return;

			const targetCount = clamp(
				Math.floor(width * height * BASE_DENSITY),
				MIN_PARTICLES,
				MAX_PARTICLES
			);
			const particles = particlesRef.current;
			let heroCount = 0;
			for (let index = 0; index < particles.length; index += 1) {
				if (particles[index]?.kind === "hero") {
					heroCount += 1;
				}
			}

			if (heroCount < targetCount) {
				const spawnRatePerMs = targetCount / HERO_FILL_DURATION_MS;
				heroSpawnCarryRef.current += spawnRatePerMs * dtMs;
				let toCreate = Math.floor(heroSpawnCarryRef.current);
				toCreate = Math.min(
					toCreate,
					MAX_HERO_CREATE_PER_FRAME,
					targetCount - heroCount
				);
				if (toCreate <= 0) return;
				heroSpawnCarryRef.current -= toCreate;
				for (let index = 0; index < toCreate; index += 1) {
					particles.push(createParticle(width, height, true));
				}
			} else if (heroCount > targetCount) {
				let toRemove = heroCount - targetCount;
				for (let index = particles.length - 1; index >= 0; index -= 1) {
					if (toRemove <= 0) break;
					if (particles[index]?.kind !== "hero") continue;
					particles.splice(index, 1);
					toRemove -= 1;
				}
			}
		};

		const applyCursorField = (
			desiredAngle: number,
			x: number,
			y: number
		): number => {
			if (!mouseRef.current.active) return desiredAngle;

			const radius = interactionRadius;
			const radiusSq = radius * radius;
			const coefficient = Math.max(0, interactionCoefficient);
			if (coefficient === 0) return desiredAngle;

			const dx = x - smoothedMouseRef.current.x;
			const dy = y - smoothedMouseRef.current.y;
			const distSq = dx * dx + dy * dy;

			if (distSq >= radiusSq) {
				return desiredAngle;
			}

			const dist = Math.sqrt(distSq) + 0.0001;
			const theta = Math.atan2(dy, dx);
			const obstacleRadius = radius * OBSTACLE_RADIUS_FACTOR;
			const safeDist = Math.max(dist, obstacleRadius * 1.02);
			const safeDistSq = safeDist * safeDist;
			const ratio = (obstacleRadius * obstacleRadius) / Math.max(1, safeDistSq);
			const localFlowX = 1 - ratio * Math.cos(2 * theta);
			const localFlowY = -ratio * Math.sin(2 * theta);
			const aroundAngle = Math.atan2(localFlowY, localFlowX);
			const falloff = Math.pow(1 - dist / radius, INTERACTION_FALLOFF_POWER);
			const blend = falloff * FLOW_AROUND_BLEND * coefficient;

			return desiredAngle + normalizeAngle(aroundAngle) * blend * CURSOR_SWIRL_SCALE;
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
			lastScrollYRef.current = window.scrollY;
			heroSpawnCarryRef.current = 0;
			hotSpawnCarryRef.current = 0;
			hotTopCullMarginRef.current = RESPAWN_MARGIN;
			heroFadeStartTsRef.current = null;
			heroFadeOpacityRef.current = 1;
			acFadeStartTsRef.current = null;
			acFadeOpacityRef.current = 1;
			syncParticleCount(width, height, 16.6667);
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

			const currentScrollY = window.scrollY;
			const scrollDelta = currentScrollY - lastScrollYRef.current;
			if (scrollDelta !== 0) {
				const shiftY = -scrollDelta;
				const anchoredParticles = particlesRef.current;
				for (let index = 0; index < anchoredParticles.length; index += 1) {
					const particle = anchoredParticles[index];
					if (!particle || particle.kind === "hero") continue;

					particle.y += shiftY;
					if (particle.path) {
						particle.path.p0.y += shiftY;
						particle.path.p1.y += shiftY;
						particle.path.p2.y += shiftY;
						particle.path.p3.y += shiftY;
					}
				}
			}
			lastScrollYRef.current = currentScrollY;

			smoothedMouseRef.current.x +=
				(mouseRef.current.x - smoothedMouseRef.current.x) * 0.16;
			smoothedMouseRef.current.y +=
				(mouseRef.current.y - smoothedMouseRef.current.y) * 0.16;

			const spawnZone = getSpawnZone(width, height);
			const intakeZone = getIntakeZone(width, height);
			const outletZone = getOutletZone(width, height, intakeZone);
			const intakeGuides = buildIntakeGuides(spawnZone, intakeZone);

			const flowActiveNow = flowActiveRef.current;
			if (flowActiveNow !== wasFlowActiveRef.current) {
				if (flowActiveNow) {
					heroFadeStartTsRef.current = timestamp;
					heroFadeOpacityRef.current = 1;
					hotSpawnCarryRef.current = 0;
					acFadeStartTsRef.current = null;
					acFadeOpacityRef.current = 1;
				} else {
					heroSpawnCarryRef.current = 0;
					heroFadeStartTsRef.current = null;
					heroFadeOpacityRef.current = 1;
					acFadeStartTsRef.current = timestamp;
					acFadeOpacityRef.current = 1;
				}
				wasFlowActiveRef.current = flowActiveNow;
			}

			if (heroFadeStartTsRef.current !== null) {
				const fadeElapsed = timestamp - heroFadeStartTsRef.current;
				const fadeProgress = clamp(fadeElapsed / HERO_PARTICLE_FADE_OUT_MS, 0, 1);
				heroFadeOpacityRef.current = 1 - fadeProgress;

				if (fadeProgress >= 1) {
					const allParticles = particlesRef.current;
					for (let index = allParticles.length - 1; index >= 0; index -= 1) {
						if (allParticles[index]?.kind === "hero") {
							allParticles.splice(index, 1);
						}
					}
					heroFadeStartTsRef.current = null;
					heroFadeOpacityRef.current = 0;
				}
			} else {
				heroFadeOpacityRef.current = flowActiveNow ? 0 : 1;
			}

			if (acFadeStartTsRef.current !== null) {
				const fadeElapsed = timestamp - acFadeStartTsRef.current;
				const fadeProgress = clamp(fadeElapsed / AC_PARTICLE_FADE_OUT_MS, 0, 1);
				acFadeOpacityRef.current = 1 - fadeProgress;

				if (fadeProgress >= 1) {
					const allParticles = particlesRef.current;
					for (let index = allParticles.length - 1; index >= 0; index -= 1) {
						const particle = allParticles[index];
						if (!particle) continue;
						if (particle.kind === "acHot" || particle.kind === "acCool") {
							allParticles.splice(index, 1);
						}
					}
					acFadeStartTsRef.current = null;
					acFadeOpacityRef.current = 1;
				}
			} else {
				acFadeOpacityRef.current = 1;
			}

			if (!flowActiveNow) {
				hotSpawnCarryRef.current = 0;
				hotTopCullMarginRef.current = RESPAWN_MARGIN;
				syncParticleCount(width, height, dtMs);
			}

			if (flowActiveNow) {
				const targetCount = clamp(
					Math.floor(width * height * BASE_DENSITY),
					MIN_PARTICLES,
					MAX_PARTICLES
				);

				// Keep a stable visible flow even when the anchored spawn zone is far above the viewport.
				const effectiveSpawnY = Math.max(spawnZone.centerY, -height * 0.45);

				const travelDistance = Math.max(
					360,
					Math.hypot(
						intakeZone.centerX - (spawnZone.left - RESPAWN_MARGIN),
						intakeZone.centerY - effectiveSpawnY
					)
				);
				const averageLifetimeMs = travelDistance / HOT_FLOW_SPEED_PX_PER_MS;
				const spawnRatePerMs =
					(targetCount * 0.95) / Math.max(900, averageLifetimeMs);

				hotSpawnCarryRef.current += spawnRatePerMs * dtMs;
				let spawnCount = Math.floor(hotSpawnCarryRef.current);
				spawnCount = Math.min(spawnCount, MAX_HOT_SPAWNS_PER_FRAME);
				hotSpawnCarryRef.current -= spawnCount;

				for (let index = 0; index < spawnCount; index += 1) {
					spawnHotParticle(spawnZone, intakeZone, intakeGuides);
				}
			}

			context.clearRect(0, 0, width, height);

			if (SHOW_GUIDE_CURVES) {
				context.save();
				context.beginPath();
				traceCubicPath(context, intakeGuides.left);
				traceCubicPath(context, intakeGuides.right);
				traceCubicPath(context, intakeGuides.center);
				context.setLineDash([8, 6]);
				context.lineWidth = 1.25;
				context.strokeStyle = flowActiveNow
					? "rgba(83, 171, 177, 0.56)"
					: "rgba(98, 133, 141, 0.48)";
				context.stroke();
				context.setLineDash([]);
				context.restore();
			}

			const particles = particlesRef.current;
			const heroPath = new Path2D();
			const hotPath = new Path2D();
			const coolPath = new Path2D();
			if (flowActiveNow) {
				const dynamicHotTopMargin = Math.max(
					RESPAWN_MARGIN * 2,
					Math.abs(Math.min(0, spawnZone.top)) + RESPAWN_MARGIN,
					height * 1.1
				);
				hotTopCullMarginRef.current = Math.max(
					hotTopCullMarginRef.current,
					dynamicHotTopMargin
				);
			}
			const hotTopOffscreenMargin = hotTopCullMarginRef.current;
			const hotSideOffscreenMargin = Math.max(RESPAWN_MARGIN * 2, width * 0.38);
			const hotBottomOffscreenMargin = Math.max(RESPAWN_MARGIN * 2, height * 0.62);
			let hasHeroParticles = false;
			let hasHotParticles = false;
			let hasCoolParticles = false;

			for (let index = particles.length - 1; index >= 0; index -= 1) {
				const particle = particles[index];
				if (!particle) continue;

				if (particle.kind === "hero") {
					let desiredAngle = particle.baseAngle;
					desiredAngle = applyCursorField(desiredAngle, particle.x, particle.y);
					particle.angle +=
						normalizeAngle(desiredAngle - particle.angle) * HERO_TURN_RESPONSE * dt;

					const step = particle.speed * dtMs;
					particle.x += Math.cos(particle.angle) * step;
					particle.y += Math.sin(particle.angle) * step;

					if (isOffscreen(particle.x, particle.y, width, height, RESPAWN_MARGIN)) {
						if (flowActiveNow) {
							particles.splice(index, 1);
							continue;
						}
						respawnParticle(particle, height, width);
					}

					heroPath.moveTo(particle.x + particle.radius, particle.y);
					heroPath.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
					hasHeroParticles = true;
					continue;
				}

				if (particle.kind === "acHot") {
					if (!particle.path) {
						const guidePreference =
							particle.guidePreference ??
							(particle.x <= intakeZone.centerX ? "left" : "right");
						const targetX =
							particle.intakeTargetX ??
							toIntakeTarget(
								intakeZone,
								intakeGuides,
								guidePreference,
								particle.x
							).x;
						const target: Vec2 = {
							x: targetX,
							y: intakeZone.top + randomBetween(2, 8)
						};
						particle.path = buildIntakeTransitionPath(
							{ x: particle.x, y: particle.y },
							target,
							intakeZone,
							intakeGuides,
							guidePreference
						);
						particle.pathProgress = 0;
						particle.guidePreference = guidePreference;
						particle.intakeTargetX = targetX;
						particle.jitterPhase ??= randomBetween(0, Math.PI * 2);
					}

					const path = particle.path;
					const progressDelta = (particle.speed * dtMs) / path.length;
					const nextProgress = clamp(
						(particle.pathProgress ?? 0) + progressDelta,
						0,
						1
					);
					particle.pathProgress = nextProgress;

					if (nextProgress >= 0.995) {
						spawnCoolParticle(outletZone);
						particles.splice(index, 1);
						continue;
					}

					const guidePoint = cubicPoint(path, nextProgress);
					const tangent = cubicTangent(path, Math.min(1, nextProgress + 0.02));
					const tangentAngle = Math.atan2(tangent.y, tangent.x);
					const entryX = particle.intakeTargetX ?? intakeZone.centerX;
					const tangentMagnitude = Math.max(0.0001, Math.hypot(tangent.x, tangent.y));
					const normalX = -tangent.y / tangentMagnitude;
					const normalY = tangent.x / tangentMagnitude;
					const jitterPhase = particle.jitterPhase ?? 0;
					const jitterBlend = clamp(1 - nextProgress, 0, 1);
					const jitterAmount =
						Math.sin(jitterPhase + nextProgress * 10) *
						(0.6 + jitterBlend * 2.2);

					let followX = guidePoint.x + normalX * jitterAmount;
					let followY = guidePoint.y + normalY * jitterAmount;

					if (nextProgress > TOP_ENTRY_ENFORCE_PROGRESS) {
						const alignBlend = clamp(
							(nextProgress - TOP_ENTRY_ENFORCE_PROGRESS) /
								(1 - TOP_ENTRY_ENFORCE_PROGRESS),
							0,
							1
						);
						followX += (entryX - followX) * (0.12 + alignBlend * 0.3);
						followY += (intakeZone.top + 3 - followY) * (0.16 + alignBlend * 0.4);
					}

					const deltaX = followX - particle.x;
					const deltaY = followY - particle.y;
					const deltaDistance = Math.hypot(deltaX, deltaY);
					const maxStep = Math.max(0.35, particle.speed * dtMs * 1.18);

					if (deltaDistance > maxStep && deltaDistance > 0.0001) {
						const blend = maxStep / deltaDistance;
						particle.x += deltaX * blend;
						particle.y += deltaY * blend;
					} else {
						particle.x = followX;
						particle.y = followY;
					}

					if (deltaDistance > 0.0001) {
						const motionAngle = Math.atan2(deltaY, deltaX);
						particle.baseAngle = tangentAngle;
						particle.angle +=
							normalizeAngle(motionAngle - particle.angle) * 0.44;
					} else {
						particle.baseAngle = tangentAngle;
						particle.angle = tangentAngle;
					}

					const topCaptureMinX =
						intakeZone.left - INTAKE_CAPTURE_PADDING + INTAKE_CAPTURE_INSET_PX;
					const topCaptureMaxX =
						intakeZone.right + INTAKE_CAPTURE_PADDING - INTAKE_CAPTURE_INSET_PX;
					const topCaptureMinY =
						intakeZone.top - INTAKE_CAPTURE_PADDING + INTAKE_CAPTURE_INSET_PX;
					const topCaptureMaxY =
						intakeZone.top + Math.max(INTAKE_TOP_CAPTURE_DEPTH, intakeZone.height * 0.55);
					if (
						particle.x >= topCaptureMinX &&
						particle.x <= topCaptureMaxX &&
						particle.y >= topCaptureMinY &&
						particle.y <= topCaptureMaxY
					) {
						spawnCoolParticle(outletZone);
						particles.splice(index, 1);
						continue;
					}

					if (
						particle.x > width + hotSideOffscreenMargin ||
						particle.x < -hotSideOffscreenMargin ||
						particle.y > height + hotBottomOffscreenMargin ||
						particle.y < -hotTopOffscreenMargin
					) {
						particles.splice(index, 1);
						continue;
					}

					hotPath.moveTo(particle.x + particle.radius, particle.y);
					hotPath.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
					hasHotParticles = true;
					continue;
				}

				let desiredAngle = particle.baseAngle;
				desiredAngle = applyCursorField(desiredAngle, particle.x, particle.y);
				particle.angle +=
					normalizeAngle(desiredAngle - particle.angle) * COOL_TURN_RESPONSE * dt;

				const step = particle.speed * dtMs;
				particle.x += Math.cos(particle.angle) * step;
				particle.y += Math.sin(particle.angle) * step;

				if (isOffscreen(particle.x, particle.y, width, height, RESPAWN_MARGIN)) {
					particles.splice(index, 1);
					continue;
				}

				coolPath.moveTo(particle.x + particle.radius, particle.y);
				coolPath.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
				hasCoolParticles = true;
			}

			if (hasHeroParticles) {
				if (cachedGradientRef.current === null) {
					const thermalGradient = context.createLinearGradient(
						-RESPAWN_MARGIN,
						0,
						width + RESPAWN_MARGIN,
						0
					);
					thermalGradient.addColorStop(0, HOT_STREAM_COLOR);
					thermalGradient.addColorStop(0.3, COOL_STREAM_COLOR);
					thermalGradient.addColorStop(1, COOL_STREAM_COLOR);
					cachedGradientRef.current = thermalGradient;
				}

				context.save();
				context.globalAlpha = heroFadeOpacityRef.current;
				context.fillStyle = cachedGradientRef.current;
				context.fill(heroPath);
				context.restore();
			}

			if (hasHotParticles) {
				context.save();
				context.globalAlpha = acFadeOpacityRef.current;
				context.fillStyle = HOT_STREAM_COLOR;
				context.fill(hotPath);
				context.restore();
			}

			if (hasCoolParticles) {
				context.save();
				context.globalAlpha = acFadeOpacityRef.current;
				context.fillStyle = COOL_STREAM_COLOR;
				context.fill(coolPath);
				context.restore();
			}

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
	}, [
		interactionCoefficient,
		interactionRadius,
		spawnZoneSelector,
		intakeSelector,
		outletSelector
	]);

	return (
		<div
			aria-hidden="true"
			className={`pointer-events-none fixed inset-0 z-0 ${className ?? ""}`}
		>
			<canvas ref={canvasRef} className="h-full w-full" />
		</div>
	);
}
