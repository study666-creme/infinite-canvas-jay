"use client";

import { useEffect, useState } from "react";

const COMPACT_CANVAS_QUERY = "(max-width: 900px), (pointer: coarse) and (max-width: 1180px)";

export function useCompactCanvasViewport() {
    const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia(COMPACT_CANVAS_QUERY).matches);

    useEffect(() => {
        const query = window.matchMedia(COMPACT_CANVAS_QUERY);
        const update = () => setCompact(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    return compact;
}
