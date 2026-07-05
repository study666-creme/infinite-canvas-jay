import { Modal } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasShortcutsModalProps = {
    open: boolean;
    onClose: () => void;
};

type ShortcutRow = {
    keys: string[];
    value: string;
};

type ShortcutSection = {
    title: string;
    rows: ShortcutRow[];
};

export const CANVAS_SHORTCUT_SECTIONS: ShortcutSection[] = [
    {
        title: "视图",
        rows: [
            { keys: ["拖动空白"], value: "框选多个节点" },
            { keys: ["空格", "拖动"], value: "平移画布" },
            { keys: ["滚轮"], value: "缩放画布" },
            { keys: ["缩放滑杆"], value: "精确调整缩放" },
            { keys: ["重置视图"], value: "回到默认缩放与居中" },
        ],
    },
    {
        title: "选择",
        rows: [
            { keys: ["Shift", "拖动 / 点击"], value: "追加或取消选择节点" },
            { keys: ["Ctrl / Cmd", "A"], value: "全选节点" },
            { keys: ["点击组内节点"], value: "直接选中该节点并拖动" },
            { keys: ["鼠标移入组边框/空白"], value: "显示组合功能栏（与节点工具栏相同）" },
            { keys: ["组功能栏 · 名称"], value: "点击重命名组合" },
            { keys: ["组功能栏 · 解组"], value: "确认后解散组合" },
            { keys: ["Esc"], value: "取消选择并关闭浮层" },
        ],
    },
    {
        title: "节点",
        rows: [
            { keys: ["拖动节点"], value: "移动节点位置" },
            { keys: ["点击视频节点"], value: "播放 / 暂停" },
            { keys: ["右键"], value: "打开上下文菜单（成组、复制等）" },
            { keys: ["右键", "成组"], value: "将多个选中节点合并为一组" },
            { keys: ["右键", "取消成组"], value: "解散当前节点组" },
        ],
    },
    {
        title: "编辑",
        rows: [
            { keys: ["Ctrl / Cmd", "C / V"], value: "复制 / 粘贴节点，或粘贴剪切板文本/图片" },
            { keys: ["Ctrl / Cmd", "Z"], value: "撤销" },
            { keys: ["Ctrl / Cmd", "Shift", "Z"], value: "重做" },
            { keys: ["Ctrl / Cmd", "Y"], value: "重做" },
            { keys: ["Delete / Backspace"], value: "删除选中节点或连线" },
        ],
    },
    {
        title: "素材",
        rows: [{ keys: ["拖入图片/视频/音频"], value: "上传到画布" }],
    },
];

export function CanvasShortcutsModal({ open, onClose }: CanvasShortcutsModalProps) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];

    return (
        <Modal title="操作说明" open={open} onCancel={onClose} footer={null} centered width={560}>
            <div className="max-h-[70vh] space-y-5 overflow-y-auto border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                {CANVAS_SHORTCUT_SECTIONS.map((section) => (
                    <section key={section.title}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] opacity-45">{section.title}</h3>
                        <div className="space-y-1">
                            {section.rows.map((row) => (
                                <ShortcutRowItem key={`${section.title}-${row.value}`} keys={row.keys} value={row.value} />
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </Modal>
    );
}

function ShortcutRowItem({ keys, value }: ShortcutRow) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-4 rounded-lg px-1 py-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="flex items-center gap-1.5">
                        {index ? <span className="text-xs opacity-35">+</span> : null}
                        <kbd
                            className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none shadow-[inset_0_-1px_0_rgba(0,0,0,.08),0_1px_2px_rgba(0,0,0,.06)]"
                            style={{ borderColor: "rgba(120,113,108,.28)", background: "linear-gradient(#fff, rgba(245,245,244,.92))", color: "rgb(68,64,60)" }}
                        >
                            {key}
                        </kbd>
                    </span>
                ))}
            </span>
            <span className="text-right text-sm opacity-55">{value}</span>
        </div>
    );
}
