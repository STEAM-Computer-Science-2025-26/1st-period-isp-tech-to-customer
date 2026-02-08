import { calculateDistance, areValidCoordinates } from '../algo/distance';

interface Coord {
  latitude: number;
  longitude: number;
}

describe('Distance Calculator — Edge Cases', () => {
  test('E1: Identical points (different objects) = 0', () => {
    const p1 = { latitude: 40, longitude: 40 };
    const p2 = { latitude: 40, longitude: 40 };
    expect(calculateDistance(p1, p2)).toBe(0);
  });

  test('E2: Near-antipodes stress test', () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 0, longitude: 179.999 };
    expect(calculateDistance(a, b)).toBeGreaterThan(12000);
  });

  test('E3: North Pole distance', () => {
    const northPole = { latitude: 90, longitude: 0 };
    const nyc = { latitude: 40.7128, longitude: -74.006 };
    expect(calculateDistance(northPole, nyc)).toBeGreaterThan(2000);
  });

  test('E4: Date line crossing', () => {
    const west = { latitude: 10, longitude: 179 };
    const east = { latitude: 10, longitude: -179 };
    expect(calculateDistance(west, east)).toBeLessThan(200);
  });

  test('E5: Tiny movement', () => {
    const c1 = { latitude: 40.0000001, longitude: -74.0000001 };
    const c2 = { latitude: 40.0000002, longitude: -74.0000002 };
    expect(calculateDistance(c1, c2)).toBeGreaterThan(0);
  });

  test('V1: Boundary coordinates', () => {
    expect(areValidCoordinates({ latitude: 90, longitude: 180 })).toBe(true);
    expect(areValidCoordinates({ latitude: -90, longitude: -180 })).toBe(true);
    expect(areValidCoordinates({ latitude: 90.0001, longitude: 0 })).toBe(false);
  });

  test('V2: NaN and Infinity', () => {
    expect(areValidCoordinates({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(areValidCoordinates({ latitude: Infinity, longitude: 0 })).toBe(false);
  });

  test('V3: Wrong shapes', () => {
    expect(areValidCoordinates({ lat: 32, lon: -96 } as unknown as Coord)).toBe(false);
    expect(areValidCoordinates({} as unknown as Coord)).toBe(false);
  });

  test('V4: null vs undefined', () => {
    expect(areValidCoordinates(null)).toBe(false);
    expect(areValidCoordinates(undefined as unknown as Coord)).toBe(false);
  });
});
