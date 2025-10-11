// Time Service - manages simulation time and time system conversions

import type { ITimeService, TimeConverter } from "../types";
import { TimeSystem } from "../types";

export class TimeService implements ITimeService {
    private currentTime: number;
    private rate: number = 1.0;
    private isPlaying: boolean = false;
    private converters: Map<string, TimeConverter> = new Map();
    private callbacks: Set<(time: number) => void> = new Set();

    constructor(initialTime?: number) {
        this.currentTime = initialTime ?? Date.now();
    }

    getCurrentTime(): number {
        return this.currentTime;
    }

    setTime(time: number): void {
        this.currentTime = time;
        this.notifyCallbacks();
    }

    setRate(rate: number): void {
        this.rate = rate;
    }

    getRate(): number {
        return this.rate;
    }

    addTimeSystem(name: TimeSystem, converter: TimeConverter): void {
        this.converters.set(name, converter);
    }

    convert(time: number, from: TimeSystem, to: TimeSystem): number {
        if (from === to) return time;

        // For now, simple pass-through
        // In a full implementation, this would do proper time system conversions
        const converter = this.converters.get(from);
        if (converter) {
            return converter.convert(time, from, to);
        }

        return time;
    }

    play(): void {
        this.isPlaying = true;
    }

    pause(): void {
        this.isPlaying = false;
    }

    isPaused(): boolean {
        return !this.isPlaying;
    }

    onTick(callback: (time: number) => void): () => void {
        this.callbacks.add(callback);

        // Return unsubscribe function
        return () => {
            this.callbacks.delete(callback);
        };
    }

    update(deltaTime: number): void {
        if (this.isPlaying) {
            this.currentTime += deltaTime * this.rate;
            this.notifyCallbacks();
        }
    }

    private notifyCallbacks(): void {
        this.callbacks.forEach((cb) => cb(this.currentTime));
    }
}
