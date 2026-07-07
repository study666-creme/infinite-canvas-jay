"use client";

import { useEffect, useState } from "react";

export function useCompactCanvasViewport() {
    const [compact, setCompact] = useState(false);

    useEffect(() => {
        const query = window.matchMedia("(max-width: 900px), (pointer: coarse) and (max-width: 1180px)");
        const update = () => setCompact(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    return compact;
}
