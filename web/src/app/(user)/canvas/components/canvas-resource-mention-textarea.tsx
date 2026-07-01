"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

type MentionState = {
    query: string;
};

type Props = Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "value"> & {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onSubmit?: () => void;
    containerClassName?: string;
    highlightLabels?: boolean;
    placeholder?: string;
};

export type CanvasResourceMentionTextareaHandle = {
    insertReferenceLabel: (label: string) => void;
    focusEditor: () => void;
};

export const CanvasResourceMentionTextarea = forwardRef<CanvasResourceMentionTextareaHandle, Props>(function CanvasResourceMentionTextarea({ value, references, onChange, onSubmit, onKeyDown, className, containerClassName, style, highlightLabels = true, placeholder, ...props }, forwardedRef) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const editorRef = useRef<HTMLDivElement | null>(null);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isEmpty, setIsEmpty] = useState(!value.trim());

    const activeReferences = useMemo(() => references.filter((item) => item.active), [references]);
    const activeLabels = useMemo(
        () => (highlightLabels ? Array.from(new Set(activeReferences.map((item) => item.label))).sort((a, b) => b.length - a.length) : []),
        [activeReferences, highlightLabels],
    );
    const referenceByLabel = useMemo(() => new Map(activeReferences.map((item) => [item.label, item])), [activeReferences]);

    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        if (!query) return activeReferences;
        return activeReferences.filter((item) => `${item.label} ${item.title} ${item.kind} ${item.text || ""}`.toLowerCase().includes(query));
    }, [activeReferences, mention]);

    const syncEditorFromValue = (nextValue: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        renderValueToEditor(editor, nextValue, activeLabels, referenceByLabel, theme);
        setIsEmpty(!nextValue.trim());
    };

    const emitChange = () => {
        const editor = editorRef.current;
        if (!editor) return;
        const next = serializeEditor(editor);
        setIsEmpty(!next.trim());
        if (next !== value) onChange(next);
        syncMentionFromEditor();
    };

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const current = serializeEditor(editor);
        if (current === value) return;
        syncEditorFromValue(value);
        if (editor === document.activeElement) placeCaretAtEnd(editor);
    }, [activeLabels, referenceByLabel, theme, value]);

    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };

    const syncMentionFromEditor = () => {
        const editor = editorRef.current;
        if (!editor || !activeReferences.length) {
            closeMention();
            return;
        }
        const prefix = getTextBeforeCaret(editor);
        const match = /(^|\s)@([^\s@]*)$/.exec(prefix);
        if (!match) {
            closeMention();
            return;
        }
        setMention({ query: match[2] });
        setActiveIndex(0);
    };

    const insertReferenceLabelAtCaret = (label: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        const prefix = getTextBeforeCaret(editor);
        const suffixStart = prefix.length;
        const full = serializeEditor(editor);
        const suffix = full.slice(suffixStart);
        const mentionMatch = /(^|\s)@([^\s@]*)$/.exec(prefix);
        const nextPrefix = mentionMatch ? `${prefix.slice(0, prefix.length - mentionMatch[0].length)}${label} ` : `${prefix}${prefix && !/\s$/.test(prefix) ? " " : ""}${label} `;
        const next = `${nextPrefix}${suffix}`;
        renderValueToEditor(editor, next, activeLabels, referenceByLabel, theme);
        setCaretAtTextOffset(editor, nextPrefix.length);
        setIsEmpty(!next.trim());
        onChange(next);
        closeMention();
        editor.focus();
    };

    useImperativeHandle(
        forwardedRef,
        () => ({
            insertReferenceLabel: insertReferenceLabelAtCaret,
            focusEditor: () => editorRef.current?.focus(),
        }),
        [activeLabels, referenceByLabel, theme, onChange],
    );

    const insertReference = (reference: CanvasResourceReference) => {
        insertReferenceLabelAtCaret(reference.label);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (mention && candidates.length) {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => (index + 1) % candidates.length);
                return;
            }
            if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                insertReference(candidates[Math.min(activeIndex, candidates.length - 1)]);
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                closeMention();
                return;
            }
        }

        if (event.key === "Backspace" || event.key === "Delete") {
            const removed = removeAdjacentMentionChip(editorRef.current, event.key === "Backspace");
            if (removed) {
                event.preventDefault();
                emitChange();
                return;
            }
        }

        if (event.key === "Enter" && onSubmit && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
            return;
        }

        onKeyDown?.(event);
    };

    const menu = mention && candidates.length && editorRef.current ? <MentionMenu anchor={editorRef.current} references={candidates} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} onSelect={insertReference} /> : null;

    return (
        <div
            className={`relative w-full cursor-text ${containerClassName || ""}`}
            onMouseDown={(event) => {
                event.stopPropagation();
                if (editorRef.current?.contains(event.target as Node)) return;
                event.preventDefault();
                editorRef.current?.focus();
                placeCaretAtEnd(editorRef.current);
            }}
        >
            {isEmpty && placeholder ? (
                <div className={`${className || ""} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words opacity-45`} style={{ ...style, color: theme.node.text }}>
                    {placeholder}
                </div>
            ) : null}
            <div
                {...props}
                ref={(node) => {
                    editorRef.current = node;
                }}
                role="textbox"
                aria-multiline="true"
                contentEditable
                suppressContentEditableWarning
                className={`${className || ""} relative z-10 cursor-text outline-none`}
                style={style as CSSProperties}
                onInput={() => emitChange()}
                onKeyDown={handleKeyDown}
                onKeyUp={() => syncMentionFromEditor()}
                onPointerUp={() => syncMentionFromEditor()}
                onBlur={(event) => {
                    window.setTimeout(closeMention, 120);
                    props.onBlur?.(event);
                }}
                onFocus={(event) => props.onFocus?.(event)}
            />
            {menu}
        </div>
    );
});

function serializeEditor(root: HTMLElement) {
    let result = "";
    root.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) result += child.textContent || "";
        else if (child instanceof HTMLElement) {
            const label = child.dataset.mentionLabel;
            if (label) result += label;
            else result += serializeEditor(child);
        }
    });
    return result.replace(/\u00a0/g, " ");
}

function serializeFragment(fragment: DocumentFragment) {
    let result = "";
    fragment.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) result += child.textContent || "";
        else if (child instanceof HTMLElement) {
            const label = child.dataset.mentionLabel;
            if (label) result += label;
            else result += child.textContent || "";
        }
    });
    return result.replace(/\u00a0/g, " ");
}

function renderValueToEditor(root: HTMLElement, value: string, labels: string[], referenceByLabel: Map<string, CanvasResourceReference>, theme: (typeof canvasThemes)[keyof typeof canvasThemes]) {
    root.innerHTML = "";
    if (!value) return;
    if (!labels.length) {
        root.appendChild(document.createTextNode(value));
        return;
    }
    const pattern = new RegExp(`(${labels.map(escapeRegExp).join("|")})`, "g");
    value.split(pattern).forEach((part) => {
        if (!part) return;
        if (labels.includes(part)) root.appendChild(createChipElement(part, referenceByLabel.get(part), theme));
        else root.appendChild(document.createTextNode(part));
    });
}

function createChipElement(label: string, reference: CanvasResourceReference | undefined, theme: (typeof canvasThemes)[keyof typeof canvasThemes]) {
    const chip = document.createElement("span");
    chip.contentEditable = "false";
    chip.dataset.mentionLabel = label;
    chip.className = "mx-0.5 inline-flex max-w-[132px] translate-y-[1px] items-center gap-1.5 rounded-lg border px-1.5 py-0.5 align-middle shadow-sm select-none";
    chip.style.borderColor = `${theme.node.stroke}aa`;
    chip.style.background = theme.toolbar.activeBg;
    chip.style.color = theme.node.text;

    const preview = document.createElement("span");
    preview.className = "grid size-5 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10";
    if (reference?.kind === "image" && reference.previewUrl) {
        const img = document.createElement("img");
        img.src = reference.previewUrl;
        img.alt = "";
        img.className = "size-full object-cover";
        preview.appendChild(img);
    } else if (reference?.kind === "video" && reference.previewUrl) {
        const video = document.createElement("video");
        video.src = reference.previewUrl;
        video.muted = true;
        video.preload = "metadata";
        video.className = "size-full bg-black object-cover";
        preview.appendChild(video);
    } else {
        preview.className = "grid size-5 shrink-0 place-items-center rounded-md bg-black/20 ring-1 ring-black/10";
        preview.textContent = reference?.kind === "audio" ? "♪" : reference?.kind === "video" ? "▶" : "图";
    }

    const text = document.createElement("span");
    text.className = "truncate text-[12px] font-medium leading-4";
    text.textContent = label;

    chip.appendChild(preview);
    chip.appendChild(text);
    return chip;
}

function getTextBeforeCaret(root: HTMLElement) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const range = selection.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(root);
    preRange.setEnd(range.endContainer, range.endOffset);
    return serializeFragment(preRange.cloneContents());
}

export function placeCaretAtEnd(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function setCaretAtTextOffset(root: HTMLElement, targetOffset: number) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
        const length = textNode.textContent?.length || 0;
        if (offset + length >= targetOffset) {
            const range = document.createRange();
            range.setStart(textNode, targetOffset - offset);
            range.collapse(true);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            return;
        }
        offset += length;
    }
    placeCaretAtEnd(root);
}

function removeAdjacentMentionChip(editor: HTMLElement | null, backspace: boolean) {
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const { startContainer, startOffset } = range;

    if (startContainer.nodeType === Node.TEXT_NODE) {
        const text = startContainer.textContent || "";
        if (backspace) {
            const prev = startContainer.previousSibling;
            if (prev instanceof HTMLElement && prev.dataset.mentionLabel) {
                if (startOffset === 0 || (startOffset === 1 && text[0] === " ")) {
                    prev.remove();
                    if (startOffset === 1) startContainer.textContent = text.slice(1);
                    return true;
                }
            }
        } else {
            const next = startContainer.nextSibling;
            if (next instanceof HTMLElement && next.dataset.mentionLabel && startOffset === text.length) {
                next.remove();
                return true;
            }
        }
    }

    if (startContainer instanceof HTMLElement && startContainer.dataset.mentionLabel) {
        startContainer.remove();
        return true;
    }

    return false;
}

function MentionMenu({ anchor, references, activeIndex, theme, onSelect }: { anchor: HTMLElement; references: CanvasResourceReference[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSelect: (reference: CanvasResourceReference) => void }) {
    const selectedRef = useRef(false);
    const rect = anchor.getBoundingClientRect();
    const boundary = anchor.closest(".ant-modal-content")?.getBoundingClientRect() || { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    const menuWidth = 256;
    const maxMenuHeight = 224;
    const gap = 6;
    const left = clamp(rect.left, boundary.left + 8, boundary.right - menuWidth - 8);
    const showAbove = rect.bottom + gap + maxMenuHeight > boundary.bottom && rect.top - gap - maxMenuHeight >= boundary.top;
    const top = clamp(showAbove ? rect.top - gap - maxMenuHeight : rect.bottom + gap, boundary.top + 8, boundary.bottom - maxMenuHeight - 8);

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => {
        event.stopPropagation();
    };
    const selectReference = (reference: CanvasResourceReference) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        onSelect(reference);
    };

    return createPortal(
        <div
            data-canvas-resource-mention-menu="true"
            className="fixed z-[1200] max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md"
            style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={stopCanvasInteraction}
            onMouseDown={stopCanvasInteraction}
            onClick={(event) => event.stopPropagation()}
        >
            {references.map((reference, index) => (
                <button
                    key={reference.id}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                >
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{reference.label}</span>
                        <span className="block truncate opacity-65">{reference.text || reference.title}</span>
                    </span>
                </button>
            ))}
        </div>,
        document.body,
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt="" className="size-9 rounded-md object-cover" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="size-9 rounded-md bg-black object-cover" muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10">
            <Icon className="size-4" />
        </span>
    );
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
