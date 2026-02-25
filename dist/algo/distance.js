/*
converts degrees to radians
haversine needs radians to work
*/
export function degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
}
export function calculateDistance(point1, point2) {
    const R = 6371; // Earth radius in km
    const lat1Rad = degreesToRadians(point1.latitude);
    const lat2Rad = degreesToRadians(point2.latitude);
    const dLat = degreesToRadians(point2.latitude - point1.latitude);
    const dLon = degreesToRadians(point2.longitude - point1.longitude);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    const distanceMiles = distanceKm * 0.621371;
    return distanceMiles;
}
/*
 validates GPS coordinates
1. coordinates exist
2. values are numbers
3. values are finite
4. latitude is between -90 and 90
5. longitude is between -180 and 180
*/
export function areValidCoordinates(coords) {
    if (!coords)
        return false;
    const { latitude, longitude } = coords;
    if (typeof latitude !== "number" || typeof longitude !== "number")
        return false;
    if (!isFinite(latitude) || !isFinite(longitude))
        return false;
    if (latitude < -90 || latitude > 90)
        return false;
    if (longitude < -180 || longitude > 180)
        return false;
    return true;
}
