import * as satellite from "satellite.js";
import type { TLEData } from "./OrbitalElements";

export interface ParsedTLE {
    name: string;
    line1: string;
    line2: string;
    satrec: any;
    noradId: string;
    epoch: Date;
    meanMotion: number;
    inclination: number;
    rightAscensionOfAscendingNode: number;
    eccentricity: number;
    argumentOfPeriapsis: number;
    meanAnomaly: number;
}

export class TLEParser {
    /**
     * Parse TLE data from text content
     * @param content Raw text content of TLE file
     * @param maxCount Maximum number of TLEs to parse (0 = all)
     * @returns Array of parsed TLE objects
     */
    public static parseTLEFile(content: string, maxCount: number = 0): ParsedTLE[] {
        const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const tles: ParsedTLE[] = [];

        // Process lines in pairs (line1 and line2)
        for (let i = 0; i < lines.length - 1; i += 2) {
            if (maxCount > 0 && tles.length >= maxCount) {
                break;
            }

            const line1 = lines[i];
            const line2 = lines[i + 1];

            // Validate TLE format
            if (this.isValidTLE(line1, line2)) {
                try {
                    const parsed = this.parseTLEData(line1, line2);
                    if (parsed) {
                        tles.push(parsed);
                    }
                } catch (error) {
                    console.warn(`Failed to parse TLE at line ${i + 1}:`, error);
                }
            }
        }

        return tles;
    }

    /**
     * Parse a single TLE pair
     */
    private static parseTLEData(line1: string, line2: string): ParsedTLE | null {
        try {
            // Extract NORAD ID from line 1
            const noradId = line1.substring(2, 7).trim();

            // Create satrec object using satellite.js
            const satrec = satellite.twoline2satrec(line1, line2);

            // Extract orbital elements from line 2
            const inclination = parseFloat(line2.substring(8, 16));
            const rightAscensionOfAscendingNode = parseFloat(line2.substring(17, 25));
            const eccentricity = parseFloat('0.' + line2.substring(26, 33));
            const argumentOfPeriapsis = parseFloat(line2.substring(34, 42));
            const meanAnomaly = parseFloat(line2.substring(43, 51));
            const meanMotion = parseFloat(line2.substring(52, 63));

            // Extract epoch from line 1
            const epochStr = line1.substring(18, 32);
            const epoch = this.parseEpoch(epochStr);

            return {
                name: `SAT-${noradId}`,
                line1,
                line2,
                satrec,
                noradId,
                epoch,
                meanMotion,
                inclination,
                rightAscensionOfAscendingNode,
                eccentricity,
                argumentOfPeriapsis,
                meanAnomaly
            };
        } catch (error) {
            console.error('Error parsing TLE:', error);
            return null;
        }
    }

    /**
     * Validate TLE format
     */
    private static isValidTLE(line1: string, line2: string): boolean {
        // Basic validation
        if (!line1 || !line2) return false;
        if (line1.length < 68 || line2.length < 68) return false;
        if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) return false;

        // Check checksums
        const checksum1 = parseInt(line1.charAt(line1.length - 1));
        const checksum2 = parseInt(line2.charAt(line2.length - 1));

        const calculatedChecksum1 = this.calculateChecksum(line1.substring(0, line1.length - 1));
        const calculatedChecksum2 = this.calculateChecksum(line2.substring(0, line2.length - 1));

        return checksum1 === calculatedChecksum1 && checksum2 === calculatedChecksum2;
    }

    /**
     * Calculate TLE checksum
     */
    private static calculateChecksum(line: string): number {
        let checksum = 0;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char >= '0' && char <= '9') {
                checksum += parseInt(char);
            } else if (char === '-') {
                checksum += 1;
            }
        }
        return checksum % 10;
    }

    /**
     * Parse TLE epoch string to Date
     */
    private static parseEpoch(epochStr: string): Date {
        const year = parseInt(epochStr.substring(0, 2));
        const dayOfYear = parseFloat(epochStr.substring(2));

        // Convert 2-digit year to 4-digit year
        const fullYear = year < 50 ? 2000 + year : 1900 + year;

        // Create date from year and day of year
        const date = new Date(fullYear, 0, 1);
        date.setDate(date.getDate() + dayOfYear - 1);

        return date;
    }

    /**
     * Convert ParsedTLE to TLEData format
     */
    public static toTLEData(parsed: ParsedTLE): TLEData {
        return {
            name: parsed.name,
            line1: parsed.line1,
            line2: parsed.line2
        };
    }

    /**
     * Get satellite position at specific time
     */
    public static getSatellitePosition(parsed: ParsedTLE, time: Date): { position: { x: number; y: number; z: number } } | null {
        try {
            const result = satellite.propagate(parsed.satrec, time);
            if (result.position) {
                return {
                    position: {
                        x: result.position.x,
                        y: result.position.y,
                        z: result.position.z
                    }
                };
            }
        } catch (error) {
            console.warn(`Failed to propagate satellite ${parsed.noradId}:`, error);
        }
        return null;
    }
}
