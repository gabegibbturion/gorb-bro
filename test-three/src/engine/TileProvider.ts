export const TileProvider = {
    OPENSTREETMAP: "openstreetmap",
    CARTO: "carto",
    STAMEN: "stamen",
    ESRI: "esri",
    NASA: "nasa",
    CUSTOM: "custom",
} as const;

export type TileProvider = (typeof TileProvider)[keyof typeof TileProvider];
