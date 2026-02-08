import { calculateDistance, areValidCoordinates } from "../algo/distance";

describe("Distance Calculator — Basic Tests", () => {
	const dallas = { latitude: 32.7767, longitude: -96.797 };
	const fortWorth = { latitude: 32.7555, longitude: -97.3308 };

	test("Dallas to Fort Worth ≈ 31 miles", () => {
		const distance = calculateDistance(dallas, fortWorth);
		expect(distance).toBeGreaterThanOrEqual(29);
		expect(distance).toBeLessThanOrEqual(33);
	});

	test("Same location = 0 miles", () => {
		expect(calculateDistance(dallas, dallas)).toBe(0);
	});

	test("Valid coordinates pass", () => {
		expect(areValidCoordinates(dallas)).toBe(true);
	});

	test("Invalid latitude (>90) fails", () => {
		expect(areValidCoordinates({ latitude: 100, longitude: 0 })).toBe(false);
	});

	test("Null coordinates fail", () => {
		expect(areValidCoordinates(null)).toBe(false);
	});
});
