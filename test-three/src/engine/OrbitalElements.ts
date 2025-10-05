import * as satellite from "satellite.js";

// Earth's gravitational parameter (km^3/s^2)
const MU_EARTH = 398600.4418;
const EARTH_RADIUS = 6371.0; // km

// Classical Orbital Elements interface
export interface ClassicalOrbitalElements {
    semiMajorAxis: number; // a (km)
    eccentricity: number; // e (0-1)
    inclination: number; // i (degrees)
    rightAscensionOfAscendingNode: number; // Ω (degrees)
    argumentOfPeriapsis: number; // ω (degrees)
    meanAnomaly: number; // M (degrees)
    epoch: Date; // Reference time
}

// TLE interface (existing)
export interface TLEData {
    name: string;
    line1: string;
    line2: string;
}

// OMM (Orbit Mean-Elements Message) interface
export interface OMMData {
    name: string;
    semiMajorAxis: number;
    eccentricity: number;
    inclination: number;
    rightAscensionOfAscendingNode: number;
    argumentOfPeriapsis: number;
    meanAnomaly: number;
    epoch: Date;
    meanMotion?: number;
    period?: number;
}

// Union type for different orbital element formats
export type OrbitalElements = ClassicalOrbitalElements | TLEData | OMMData;

// Satellite creation options
export interface SatelliteCreationOptions {
    name: string;
    orbitalElements: OrbitalElements;
    color?: number;
    size?: number;
    showTrail?: boolean;
    trailLength?: number;
    trailColor?: number;
}

/**
 * Calculate TLE checksum
 */
function calculateChecksum(line: string): number {
    let checksum = 0;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char >= "0" && char <= "9") {
            checksum += parseInt(char);
        } else if (char === "-") {
            checksum += 1;
        }
    }
    return checksum % 10;
}

/**
 * Format a number for TLE with specific width and decimal places
 */
function formatTLENumber(value: number, width: number, decimals: number, padChar: string = " "): string {
    const formatted = value.toFixed(decimals);
    return formatted.padStart(width, padChar);
}

/**
 * Format eccentricity for TLE (removes leading "0.")
 */
function formatEccentricity(eccentricity: number): string {
    const eccStr = (eccentricity * 10000000).toFixed(0);
    return eccStr.padStart(7, "0");
}

/**
 * Format a number in TLE exponential notation (e.g., 0.00012 -> " 12000-4")
 */
function formatTLEExponential(value: number): string {
    if (value === 0) return " 00000-0";

    const sign = value < 0 ? "-" : " ";
    const absValue = Math.abs(value);
    const exponent = Math.floor(Math.log10(absValue));
    const mantissa = absValue / Math.pow(10, exponent);
    const mantissaStr = Math.round(mantissa * 100000)
        .toString()
        .padStart(5, "0");
    const exponentStr = Math.abs(exponent).toString();
    const expSign = exponent < 0 ? "-" : "+";

    return `${sign}${mantissaStr}${expSign}${exponentStr}`;
}

export class OrbitalElementsGenerator {
    // Generate random Classical Orbital Elements
    public static generateRandomCOE(_name: string, altitudeRange: [number, number] = [400, 800]): ClassicalOrbitalElements {
        const altitude = altitudeRange[0] + Math.random() * (altitudeRange[1] - altitudeRange[0]);
        const semiMajorAxis = EARTH_RADIUS + altitude;

        return {
            semiMajorAxis: semiMajorAxis, // km
            eccentricity: Math.random() * 0.05, // 0 to 0.05 (mostly circular)
            inclination: Math.random() * 180, // 0 to 180 degrees
            rightAscensionOfAscendingNode: Math.random() * 360, // RAAN: 0 to 360 degrees
            argumentOfPeriapsis: Math.random() * 360, // 0 to 360 degrees
            meanAnomaly: Math.random() * 360, // 0 to 360 degrees
            epoch: new Date(),
        };
    }

    // Convert COE to satellite.js satrec object
    public static coeToSatrec(coe: ClassicalOrbitalElements, name: string = "Satellite"): any {
        // Use the improved TLE generation
        const tle = this.coeToTLE(coe, name);

        // Use satellite.js to parse the TLE
        const satrec = satellite.twoline2satrec(tle.line1, tle.line2);

        // No need to test propagation here - it will be done during first update
        // Removing this call speeds up batch loading significantly

        return satrec;
    }

    // Convert OMM to satellite.js satrec object
    public static ommToSatrec(omm: OMMData): any {
        const coe: ClassicalOrbitalElements = {
            semiMajorAxis: omm.semiMajorAxis,
            eccentricity: omm.eccentricity,
            inclination: omm.inclination,
            rightAscensionOfAscendingNode: omm.rightAscensionOfAscendingNode,
            argumentOfPeriapsis: omm.argumentOfPeriapsis,
            meanAnomaly: omm.meanAnomaly,
            epoch: omm.epoch,
        };

        return this.coeToSatrec(coe);
    }

    // Convert TLE to satellite.js satrec object
    public static tleToSatrec(tle: TLEData): any {
        return satellite.twoline2satrec(tle.line1, tle.line2);
    }

    // Test with the exact valid TLE provided
    public static testValidTLE(): any {
        const validTLE = {
            line1: "1 56965U 23084AK  25275.39431877  .00096953  00000-0  13182-2 0  9990",
            line2: "2 56965  97.5820  54.8217 0005209 110.5093 249.6721 15.57245498128750",
        };

        const satrec = satellite.twoline2satrec(validTLE.line1, validTLE.line2);

        satellite.propagate(satrec, new Date());

        return satrec;
    }

    // Create a satellite using the exact valid TLE (for testing)
    public static createValidSatellite(): any {
        return this.testValidTLE();
    }

    // Convert COE to TLE format
    public static coeToTLE(coe: ClassicalOrbitalElements, name: string = "Satellite", options: any = {}): TLEData {
        const {
            noradId = Math.floor(Math.random() * 90000) + 10000,
            classification = "U",
            intlDesignator = "24001A",
            bstar = 0.00012,
            elementSetNumber = 999,
            revNumber = 0,
        } = options;

        // Get current epoch
        const now = new Date();
        const year = now.getFullYear();
        const epochYear = year % 100;
        const startOfYear = new Date(year, 0, 1);
        const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const timeOfDay = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000) / 86400;
        const epochDay = dayOfYear + timeOfDay;

        // Calculate mean motion (revolutions per day)
        const n = (Math.sqrt(MU_EARTH / Math.pow(coe.semiMajorAxis, 3)) * 86400) / (2 * Math.PI);

        // Format epoch (YYddd.dddddddd)
        const epochDayStr = epochDay.toFixed(8);
        const epochStr = `${String(epochYear).padStart(2, "0")}${epochDayStr.padStart(12, "0")}`;

        // Mean motion derivatives (typically very small for most satellites)
        const nDot = 0.00000001;
        const nDotDot = 0;

        // Format mean motion first derivative
        let nDotStr = nDot >= 0 ? " " : "-";
        nDotStr += ".";
        nDotStr += Math.abs(nDot).toFixed(8).split(".")[1];

        // Format B* drag term
        const bstarStr = formatTLEExponential(bstar);

        // Build Line 1 (without checksum)
        // Column positions are critical in TLE format!
        const noradIdStr = String(noradId).padStart(5, "0");
        const intlDesStr = intlDesignator.padEnd(8, " ");
        const elemSetStr = String(elementSetNumber).padStart(4, " ");

        let line1 = `1 ${noradIdStr}${classification} ${intlDesStr} ${epochStr}${nDotStr} ${formatTLEExponential(nDotDot)}${bstarStr} 0 ${elemSetStr}`;

        const checksum1 = calculateChecksum(line1);
        line1 += checksum1;

        // Build Line 2 (without checksum)
        let line2 = `2 ${String(noradId).padStart(5, "0")} `;
        line2 += `${formatTLENumber(coe.inclination, 8, 4)} `;
        line2 += `${formatTLENumber(coe.rightAscensionOfAscendingNode, 8, 4)} `;
        line2 += `${formatEccentricity(coe.eccentricity)} `;
        line2 += `${formatTLENumber(coe.argumentOfPeriapsis, 8, 4)} `;
        line2 += `${formatTLENumber(coe.meanAnomaly, 8, 4)} `;
        line2 += `${formatTLENumber(n, 11, 8)}`;
        line2 += `${String(revNumber).padStart(5)}`;

        const checksum2 = calculateChecksum(line2);
        line2 += checksum2;

        return {
            name: name || "Satellite",
            line1: line1,
            line2: line2,
        };
    }

    // Generate a random TLE from COE with nearby epoch
    public static generateRandomTLEFromCOE(name: string, altitudeRange: [number, number] = [400, 800], options: any = {}): TLEData {
        const coe = this.generateRandomCOE(name, altitudeRange);
        const tle = this.coeToTLE(coe, name, options);

        return tle;
    }

    // Convert any orbital elements to satrec
    public static toSatrec(orbitalElements: OrbitalElements): any {
        if ("line1" in orbitalElements) {
            return this.tleToSatrec(orbitalElements as TLEData);
        } else if ("semiMajorAxis" in orbitalElements) {
            return this.coeToSatrec(orbitalElements as ClassicalOrbitalElements);
        } else {
            return this.ommToSatrec(orbitalElements as OMMData);
        }
    }
}
