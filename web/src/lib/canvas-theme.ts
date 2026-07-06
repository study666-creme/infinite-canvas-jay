export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f3f3f1",
            dot: "rgba(64,64,67,.24)",
            line: "rgba(64,64,67,.10)",
            selectionStroke: "#8f846f",
            selectionFill: "rgba(143,132,111,.12)",
        },
        node: {
            label: "#5f5f63",
            fill: "rgba(250,250,248,.88)",
            panel: "#fbfbfa",
            stroke: "rgba(60,60,67,.18)",
            activeStroke: "#8f846f",
            placeholder: "#8d8d90",
            text: "#1d1d1f",
            muted: "#68686d",
            faint: "#a5a5aa",
        },
        toolbar: {
            panel: "rgba(248,248,246,.82)",
            border: "rgba(60,60,67,.16)",
            item: "#4f4f54",
            itemHover: "rgba(60,60,67,.08)",
            activeBg: "rgba(143,132,111,.18)",
            activeText: "#1d1d1f",
        },
        accent: {
            solid: "#8f846f",
            soft: "rgba(143,132,111,.16)",
            hover: "rgba(143,132,111,.24)",
            text: "#5f5544",
            contrast: "#ffffff",
        },
        connection: {
            base: "rgba(99,99,102,.42)",
            flow: "rgba(245,245,247,.58)",
            flowBright: "rgba(255,255,255,.82)",
            glow: "rgba(255,255,255,.10)",
        },
    },
    dark: {
        canvas: {
            background: "#151515",
            dot: "rgba(245,245,247,.18)",
            line: "rgba(245,245,247,.08)",
            selectionStroke: "#cfc6b6",
            selectionFill: "rgba(207,198,182,.13)",
        },
        node: {
            label: "#d7d7db",
            fill: "rgba(38,38,40,.88)",
            panel: "#1f1f21",
            stroke: "rgba(255,255,255,.14)",
            activeStroke: "#cfc6b6",
            placeholder: "#a9a9ad",
            text: "#f5f5f7",
            muted: "#b7b7bb",
            faint: "#737377",
        },
        toolbar: {
            panel: "rgba(35,35,37,.82)",
            border: "rgba(255,255,255,.14)",
            item: "#d7d7db",
            itemHover: "rgba(255,255,255,.10)",
            activeBg: "rgba(207,198,182,.20)",
            activeText: "#fffaf0",
        },
        accent: {
            solid: "#cfc6b6",
            soft: "rgba(207,198,182,.18)",
            hover: "rgba(207,198,182,.26)",
            text: "#eee5d6",
            contrast: "#161616",
        },
        connection: {
            base: "rgba(215,215,219,.28)",
            flow: "rgba(245,245,247,.48)",
            flowBright: "rgba(255,255,255,.84)",
            glow: "rgba(255,255,255,.07)",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
