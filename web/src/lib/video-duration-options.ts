export const canvasVideoDurationOptions = () => {
    const options: Array<{ value: string; label: string }> = [{ value: "-1", label: "智能" }];
    for (let seconds = 4; seconds <= 15; seconds += 1) {
        options.push({ value: String(seconds), label: `${seconds}s` });
    }
    return options;
};
