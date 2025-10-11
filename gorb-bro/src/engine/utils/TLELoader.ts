// Utility for loading and parsing TLE files

import type { TLE } from "../types";

export interface ParsedTLE {
    name: string;
    line1: string;
    line2: string;
}

export class TLELoader {
    /**
     * Parse TLE data from text content
     * Supports both 2-line and 3-line formats
     */
    static parseTLEText(text: string): ParsedTLE[] {
        const lines = text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        const tles: ParsedTLE[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if this is a TLE line 1 (starts with "1 ")
            if (line.startsWith("1 ")) {
                const line1 = line;
                const line2 = lines[i + 1];

                // Validate line 2 exists and starts with "2 "
                if (line2 && line2.startsWith("2 ")) {
                    // Check if there's a name line before
                    let name = "Unknown";
                    if (i > 0 && !lines[i - 1].startsWith("1 ") && !lines[i - 1].startsWith("2 ")) {
                        name = lines[i - 1];
                    } else {
                        // Try to extract satellite number from line 1
                        const satNum = line1.substring(2, 7).trim();
                        name = `SAT ${satNum}`;
                    }

                    tles.push({
                        name,
                        line1,
                        line2,
                    });

                    i++; // Skip line 2
                }
            }
        }

        return tles;
    }

    /**
     * Load TLE data from a URL
     */
    static async loadTLEFromURL(url: string): Promise<ParsedTLE[]> {
        try {
            const response = await fetch(url);
            const text = await response.text();
            return TLELoader.parseTLEText(text);
        } catch (error) {
            console.error("Failed to load TLE from URL:", url, error);
            throw error;
        }
    }

    /**
     * Load TLE data from a file
     */
    static async loadTLEFromFile(file: File): Promise<ParsedTLE[]> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                try {
                    const tles = TLELoader.parseTLEText(text);
                    resolve(tles);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    /**
     * Convert ParsedTLE to TLE format
     */
    static toTLE(parsed: ParsedTLE): TLE {
        return {
            name: parsed.name,
            line1: parsed.line1,
            line2: parsed.line2,
        };
    }

    /**
     * Validate TLE checksum
     */
    static validateTLEChecksum(line: string): boolean {
        if (line.length < 69) return false;

        const checksum = parseInt(line[68], 10);
        if (isNaN(checksum)) return false;

        let sum = 0;
        for (let i = 0; i < 68; i++) {
            const char = line[i];
            if (char >= "0" && char <= "9") {
                sum += parseInt(char, 10);
            } else if (char === "-") {
                sum += 1;
            }
        }

        return sum % 10 === checksum;
    }
}
