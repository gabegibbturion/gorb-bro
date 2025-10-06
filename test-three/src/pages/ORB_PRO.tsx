import * as OrbPro from "orbpro";
const {
    Cartesian3,
    Color,
    NearFarScalar,
    SpaceEntity,
    Cartesian2,
    SpaceCatalogDataSource,
    viewerReferenceFrameMixin,
    Viewer,
    VerticalOrigin,
    DynamicTimeline,
    Entity,
    SampledPositionProperty,
    JulianDate,
    Math: CesiumMath
} = OrbPro;

// Function to detect if the user is on a mobile browser
function isMobileBrowser() {
    return /Mobi|Android/i.test(navigator.userAgent);
}

// Function to generate a random orbital position at a given time
function generateOrbitalPosition(time, semiMajorAxis, eccentricity, inclination, argOfPeriapsis, raan, meanAnomalyAtEpoch, timeOffset) {
    const earthRadius = 6371000; // meters
    const mu = 3.986004418e14; // Earth's gravitational parameter (m^3/s^2)

    // Calculate mean motion
    const n = Math.sqrt(mu / Math.pow(semiMajorAxis, 3));

    // Calculate mean anomaly at current time
    const meanAnomaly = meanAnomalyAtEpoch + n * timeOffset;

    // Solve Kepler's equation for eccentric anomaly (simplified)
    let eccentricAnomaly = meanAnomaly;
    for (let i = 0; i < 10; i++) {
        eccentricAnomaly = meanAnomaly + eccentricity * Math.sin(eccentricAnomaly);
    }

    // Calculate true anomaly
    const trueAnomaly = 2 * Math.atan2(
        Math.sqrt(1 + eccentricity) * Math.sin(eccentricAnomaly / 2),
        Math.sqrt(1 - eccentricity) * Math.cos(eccentricAnomaly / 2)
    );

    // Calculate distance from Earth center
    const r = semiMajorAxis * (1 - eccentricity * Math.cos(eccentricAnomaly));

    // Position in orbital plane
    const xOrbital = r * Math.cos(trueAnomaly);
    const yOrbital = r * Math.sin(trueAnomaly);

    // Rotate to inertial frame
    const cosI = Math.cos(inclination);
    const sinI = Math.sin(inclination);
    const cosRaan = Math.cos(raan);
    const sinRaan = Math.sin(raan);
    const cosArg = Math.cos(argOfPeriapsis);
    const sinArg = Math.sin(argOfPeriapsis);

    const x = (cosRaan * cosArg - sinRaan * sinArg * cosI) * xOrbital +
        (-cosRaan * sinArg - sinRaan * cosArg * cosI) * yOrbital;
    const y = (sinRaan * cosArg + cosRaan * sinArg * cosI) * xOrbital +
        (-sinRaan * sinArg + cosRaan * cosArg * cosI) * yOrbital;
    const z = (sinArg * sinI) * xOrbital + (cosArg * sinI) * yOrbital;

    return new Cartesian3(x, y, z);
}

window.onload = async () => {
    // Create the Cesium Viewer in the specified container
    const viewer = new Viewer("cesiumContainer", {
        timeline: false,
        timelineContainer: true
    });
    const timeline = new DynamicTimeline(viewer.timeline.container, viewer);

    viewer.extend(viewerReferenceFrameMixin);
    viewer.referenceFrame = 1;

    const startTime = JulianDate.fromDate(new Date());
    const stopTime = JulianDate.addSeconds(startTime, 86400, new JulianDate()); // 24 hours

    for (let i = 0; i < 1000; i++) {
        // Generate random orbital elements
        const semiMajorAxis = 6371000 + Math.random() * 30000000 + 500000; // 500km to ~30,000km altitude
        const eccentricity = Math.random() * 0.3; // 0 to 0.3 (mostly circular to slightly elliptical)
        const inclination = Math.random() * Math.PI; // 0 to 180 degrees
        const argOfPeriapsis = Math.random() * 2 * Math.PI;
        const raan = Math.random() * 2 * Math.PI; // Right ascension of ascending node
        const meanAnomalyAtEpoch = Math.random() * 2 * Math.PI;

        // Create sampled position property for smooth orbit
        const positionProperty = new SampledPositionProperty();

        // Sample the orbit at multiple points
        for (let j = 0; j < 100; j++) {
            const timeOffset = (j / 100) * 86400; // Over 24 hours
            const time = JulianDate.addSeconds(startTime, timeOffset, new JulianDate());
            const position = generateOrbitalPosition(
                time,
                semiMajorAxis,
                eccentricity,
                inclination,
                argOfPeriapsis,
                raan,
                meanAnomalyAtEpoch,
                timeOffset
            );
            positionProperty.addSample(time, position);
        }

        const entity = new Entity({
            id: `entity-${i}`,
            name: `Entity ${i}`,
            availability: new OrbPro.TimeIntervalCollection([
                new OrbPro.TimeInterval({ start: startTime, stop: stopTime })
            ]),
            position: positionProperty,
            point: {
                pixelSize: 10,
                color: Color.WHITE
            },
            path: {
                resolution: 120,
                material: Color.WHITE.withAlpha(0.3),
                width: 1
            },
            viewFrom: new Cartesian3(-1678500.7493507154, -17680994.63403464, 24667690.486357275)
        });

        if (isMobileBrowser() && i % 10000 === 0) {
            await new Promise((r) => setTimeout(r, 5000));
        }
        viewer.entities.add(entity);
    }

    // Set the viewer's clock
    viewer.clock.startTime = startTime.clone();
    viewer.clock.stopTime = stopTime.clone();
    viewer.clock.currentTime = startTime.clone();
    viewer.clock.clockRange = OrbPro.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = 10;

    viewer.scene.globe.enableLighting = true;
    viewer.scene.debugShowFramesPerSecond = true;
    globalThis.viewer = viewer; //Open console to debug app
}