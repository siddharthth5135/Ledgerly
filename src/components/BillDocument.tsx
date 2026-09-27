"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  EMPTY_ITEM,
  amountInWordsINR,
  computeTotals,
  fillTemplate,
  fmtMoney,
  fmtQty,
  isItemEmpty,
  itemAmount,
  taxRowLabel,
  professionalAlign,
  getDesignPartLayout,
  patchDesignPart,
  type Align,
  type BillItem,
  type BillSpec,
  type DesignAnchor,
  type DesignZone,
  type FieldPart,
  type FreeBox,
  type MetaRow,
} from "@/lib/bill-spec";
import { moveFieldTo, type FieldDrop } from "@/lib/bill-design";

type DropZone = "meta" | "footer" | "receiver";

export type BillMode = "fill" | "design" | "print";

export type CustomerSuggestion = {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
};

type Props = {
  spec: BillSpec;
  values: Record<string, string>;
  items: BillItem[];
  mode: BillMode;
  onValuesChange?: (next: Record<string, string>) => void;
  onItemsChange?: (next: BillItem[]) => void;
  onSpecChange?: (next: BillSpec) => void;
  /** Fill mode: customer autocomplete rendered inside the name cell */
  suggestions?: CustomerSuggestion[];
  onPickSuggestion?: (s: CustomerSuggestion) => void;
  /** Fallbacks shown in print when user left blank */
  fallbackInvoiceNo?: string;
  fallbackInvoiceDate?: string;
  className?: string;
  /** Design mode: the element selected in the editor (null = nothing) */
  designAnchor?: DesignAnchor | null;
  onDesignAnchor?: (anchor: DesignAnchor | null) => void;
  /** Design mode: a placement tool is armed; the next click on the page drops the item there */
  placing?: "text" | "field" | null;
  onPlace?: (xPct: number, yPct: number) => void;
  /** Free box to focus for typing right after it was placed */
  focusId?: string | null;
};

/* ---------------------------- design context ---------------------------- */

type DesignCtxValue = {
  spec: BillSpec;
  design: boolean;
  anchor?: DesignAnchor | null;
  pick: (a: DesignAnchor | null) => void;
  onSpecChange?: (next: BillSpec) => void;
};

const DesignCtx = createContext<DesignCtxValue | null>(null);

function useDesign() {
  const ctx = useContext(DesignCtx);
  if (!ctx) throw new Error("BillDocument parts must render inside BillDocument");
  return ctx;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Pointer drag helper; reports the offset from the start point in screen px. */
function startDrag(e: ReactPointerEvent, onMove: (dx: number, dy: number) => void, onEnd?: () => void) {
  e.preventDefault();
  e.stopPropagation();
  const x0 = e.clientX;
  const y0 = e.clientY;
  const move = (ev: PointerEvent) => onMove(ev.clientX - x0, ev.clientY - y0);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.style.userSelect = "";
    onEnd?.();
  };
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/* ----------------------------- primitives ----------------------------- */

const seamless =
  "w-full min-w-0 bg-transparent border-0 outline-none p-0 m-0 rounded-[2px] " +
  "placeholder:text-black/30 placeholder:font-normal placeholder:italic focus:bg-[#eef5ff]";

/**
 * Word-like inline text editing: a contentEditable span that is exactly as wide as its text and
 * wraps when the cell is narrow — nothing is ever clipped (unlike an <input>). Uncontrolled DOM;
 * React state is synced on input.
 */
function EditableText({
  text,
  onChange,
  className = "",
  style,
  placeholder = "…",
  autoFocus,
}: {
  text: string;
  onChange: (v: string) => void;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  /** Focus and select all on mount (freshly placed boxes) */
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== text && document.activeElement !== el) el.textContent = text;
  }, [text]);
  useEffect(() => {
    const el = ref.current;
    if (!autoFocus || !el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [autoFocus]);
  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      spellCheck={false}
      data-placeholder={placeholder}
      onInput={(e) => onChange((e.currentTarget.textContent || "").replace(/\n+/g, " "))}
      onBlur={(e) => {
        const t = (e.currentTarget.textContent || "").replace(/\n+/g, " ").trim();
        if (t !== text) onChange(t);
        e.currentTarget.textContent = t;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain").replace(/\s+/g, " ");
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        sel.deleteFromDocument();
        sel.getRangeAt(0).insertNode(document.createTextNode(t));
        sel.collapseToEnd();
        onChange((e.currentTarget.textContent || "").replace(/\n+/g, " "));
      }}
      className={`bill-editable inline min-w-[1ch] cursor-text whitespace-pre-wrap break-words rounded-[1px] outline-none focus:bg-sky-50 ${className}`}
      style={{ color: "#000", ...style }}
      // text is written by the effect above (not as React children) so typing never fights the caret
    />
  );
}

function Value({
  value,
  onChange,
  mode,
  placeholder,
  align,
  strong = true,
  size,
  className = "",
  autoFocus,
  onKeyDown,
  dataCell,
}: {
  value: string;
  onChange?: (v: string) => void;
  mode: BillMode;
  placeholder?: string;
  align?: Align;
  multiline?: boolean;
  strong?: boolean;
  size?: number;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  dataCell?: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const style: CSSProperties = {
    textAlign: align,
    fontWeight: strong ? 700 : 400,
    fontSize: size ? `${size}px` : undefined,
    fontFamily: "inherit",
    lineHeight: 1.3,
    color: "#000",
  };
  if (mode === "design") {
    if (onChange) return <EditableText text={value} onChange={onChange} placeholder={placeholder} className={className} style={style} />;
    if (!value && placeholder) {
      return (
        <span className={`block italic text-black/30 ${className}`} style={{ ...style, fontWeight: 400, color: undefined }}>
          {placeholder}
        </span>
      );
    }
  }
  if (mode !== "fill" || !onChange) {
    return (
      <span className={`block whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`} style={style}>
        {value}
      </span>
    );
  }
  return (
    <textarea
      ref={box}
      value={value}
      rows={1}
      onChange={(e) => {
        onChange(e.target.value);
        const el = e.currentTarget;
        el.style.height = "0px";
        el.style.height = `${el.scrollHeight}px`;
      }}
      placeholder={placeholder}
      data-bill-cell={dataCell}
      className={`${seamless} block min-h-[1.3em] w-full min-w-0 resize-none overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`}
      style={style}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      spellCheck={false}
    />
  );
}

/** A printed label. Editable inline only in design mode. */
function Label({
  text,
  onChange,
  mode,
  className = "",
  align,
  strong = true,
  placeholder,
}: {
  text: string;
  onChange?: (v: string) => void;
  mode: BillMode;
  className?: string;
  align?: Align;
  strong?: boolean;
  placeholder?: string;
}) {
  const cls = `bill-label whitespace-pre-line ${strong ? "font-bold" : ""} ${className}`;
  if (mode === "design" && onChange) {
    return <EditableText text={text} onChange={onChange} className={cls} style={align ? { textAlign: align } : undefined} placeholder={placeholder} />;
  }
  return (
    <span className={cls} style={align ? { textAlign: align } : undefined}>
      {text}
    </span>
  );
}

/**
 * One selectable slice of the bill (a label, a value, a date…). Auto-sized to its content by
 * default; width / alignment / weight / size set in the editor apply in every mode so the
 * printed bill matches the design exactly.
 */
function Part({
  zone,
  id,
  part = "label",
  grow,
  block,
  align,
  defaultClass = "",
  className = "",
  grip,
  children,
}: {
  zone: DesignZone;
  id: string;
  part?: FieldPart;
  /** Fill the remaining row width (values) */
  grow?: boolean;
  block?: boolean;
  align?: Align;
  /** Classes used only while the width is automatic */
  defaultClass?: string;
  className?: string;
  /** Move grip shown while the part is selected */
  grip?: { title: string; onPointerDown: (e: ReactPointerEvent) => void };
  children: ReactNode;
}) {
  const ctx = useDesign();
  const ref = useRef<HTMLSpanElement>(null);
  const layout = getDesignPartLayout(ctx.spec, { zone, id });
  const w = layout.partSizes?.[part];
  const textAlign = layout.partAlign?.[part] ?? align;
  const st = layout.partStyle?.[part];
  const selected = ctx.design && ctx.anchor?.zone === zone && ctx.anchor?.id === id && ctx.anchor?.part === part;

  // Box alignment moves this label or answer. Text alignment only moves the writing inside it.
  const boxAlign = st?.boxAlign;
  const boxShift: CSSProperties =
    boxAlign && !block && (w || !grow)
      ? boxAlign === "right"
        ? { marginLeft: "auto" }
        : boxAlign === "center"
          ? { marginLeft: "auto", marginRight: "auto" }
          : { marginRight: "auto" }
      : {};
  const style: CSSProperties = {
    textAlign: textAlign,
    ...boxShift,
    ...(w ? { flex: `0 1 ${w}ch`, width: `${w}ch`, maxWidth: "100%" } : {}),
    ...(st?.fontSize ? { fontSize: `${st.fontSize}px` } : {}),
    ...(st?.bold != null ? { fontWeight: st.bold ? 700 : 400 } : {}),
  };

  function dragWidth(e: ReactPointerEvent, dir: 1 | -1) {
    const el = ref.current;
    const onSpec = ctx.onSpecChange;
    if (!el || !onSpec) return;
    const probe = document.createElement("span");
    probe.textContent = "0000000000";
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;";
    el.appendChild(probe);
    const chPx = probe.getBoundingClientRect().width / 10 || 7;
    probe.remove();
    const start = el.getBoundingClientRect().width / chPx;
    const spec0 = ctx.spec;
    startDrag(e, (dx) =>
      onSpec(patchDesignPart(spec0, { zone, id }, part, { widthCh: clamp(Math.round((start + (dir * dx) / chPx) * 2) / 2, 2, 100) }))
    );
  }

  const sizing = w ? "min-w-0 max-w-full" : grow ? "min-w-[4ch] max-w-full flex-[1_1_0%]" : defaultClass;
  return (
    <span
      ref={ref}
      data-w={w ? "" : undefined}
      data-fs={st?.fontSize ? "" : undefined}
      data-bold={st?.bold == null ? undefined : st.bold ? "1" : "0"}
      data-selected-part={selected ? "" : undefined}
      onClick={
        ctx.design
          ? (e) => {
              e.stopPropagation();
              ctx.pick({ zone, id, part });
            }
          : undefined
      }
      className={`bill-part relative ${block ? "block" : "inline-block"} ${sizing} ${ctx.design ? "cursor-pointer" : ""} ${
        selected ? "z-[3] rounded-[1px] outline outline-2 outline-offset-1 outline-sky-500" : ""
      } ${className}`}
      style={style}
    >
      {children}
      {selected && ctx.onSpecChange && (
        <>
          <ResizeGrip side="left" onPointerDown={(e) => dragWidth(e, -1)} />
          <ResizeGrip side="right" onPointerDown={(e) => dragWidth(e, 1)} />
          {grip && (
            <span
              title={grip.title}
              onPointerDown={grip.onPointerDown}
              onClick={(e) => e.stopPropagation()}
              className="absolute -top-3 left-1/2 z-20 flex h-3.5 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-sm bg-sky-500 text-[9px] leading-none text-white shadow active:cursor-grabbing print:hidden"
            >
              ⠿
            </span>
          )}
        </>
      )}
    </span>
  );
}

function ResizeGrip({ side, onPointerDown, title = "Drag to resize" }: { side: "left" | "right"; onPointerDown: (e: ReactPointerEvent) => void; title?: string }) {
  return (
    <span
      title={title}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className={`absolute top-1/2 z-10 flex h-5 w-3 -translate-y-1/2 cursor-ew-resize items-center justify-center print:hidden ${
        side === "left" ? "-left-[7px]" : "-right-[7px]"
      }`}
    >
      <span className="h-3.5 w-[5px] rounded-full border border-white bg-sky-500 shadow" />
    </span>
  );
}

/** Design mode: a block the user can click as a whole (its parts stay individually selectable). */
function Block({
  zone,
  id,
  active,
  className = "",
  style,
  children,
}: {
  zone: DesignZone;
  id: string;
  active: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ctx = useDesign();
  return (
    <div
      onClick={
        ctx.design
          ? (e) => {
              e.stopPropagation();
              ctx.pick({ zone, id });
            }
          : undefined
      }
      className={`relative ${ctx.design && active ? "z-[1] outline outline-1 -outline-offset-1 outline-dashed outline-sky-400" : ""} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/** Design mode: a laid-out field. Handles appear only while the field is active. */
function FieldSlot({
  design,
  active,
  widthPct,
  minHeight,
  onWidth,
  onMinHeight,
  onPick,
  onDragStart,
  onRemove,
  slotZone,
  slotId,
  align,
  dragging,
  dropSide,
  children,
}: {
  design: boolean;
  active: boolean;
  widthPct: number;
  minHeight?: number;
  onWidth?: (pct: number) => void;
  onMinHeight?: (px: number) => void;
  onPick?: () => void;
  /** Grip pressed: start drag-and-drop of this field */
  onDragStart?: (e: ReactPointerEvent) => void;
  onRemove?: () => void;
  /** Drop-target identity for drag-and-drop */
  slotZone?: string;
  slotId?: string;
  /** Where the field sits in its row when narrower than the row */
  align?: Align;
  dragging?: boolean;
  dropSide?: "before" | "after";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const w = clamp(widthPct || 100, 15, 100);
  const handles = design && active;

  function dragWidth(e: ReactPointerEvent, dir: 1 | -1) {
    if (!onWidth) return;
    const parentW = ref.current?.parentElement?.getBoundingClientRect().width || 1;
    startDrag(e, (dx) => onWidth(clamp(Math.round(w + ((dir * dx) / parentW) * 100), 15, 100)));
  }

  function dragHeight(e: ReactPointerEvent) {
    if (!onMinHeight) return;
    const start = minHeight || ref.current?.offsetHeight || 22;
    const scale = (ref.current?.getBoundingClientRect().height || 1) / (ref.current?.offsetHeight || 1);
    startDrag(e, (_dx, dy) => onMinHeight(clamp(Math.round(start + dy / scale), 16, 200)));
  }

  return (
    <div
      ref={ref}
      onClick={(e) => {
        if (!design || !onPick) return;
        e.stopPropagation();
        onPick();
      }}
      data-slot-zone={slotZone}
      data-slot-id={slotId}
      className={`relative min-w-0 ${design && onPick ? "cursor-pointer" : ""} ${dragging ? "opacity-40" : ""}`}
      style={{
        flex: `0 0 ${w}%`,
        maxWidth: `${w}%`,
        minHeight: minHeight ? `${minHeight}px` : undefined,
        ...(align === "right" ? { marginLeft: "auto" } : align === "center" ? { marginLeft: "auto", marginRight: "auto" } : {}),
      }}
    >
      {handles && onDragStart && (
        <span
          title="Drag to move · drop beside another field to place them side by side"
          onPointerDown={onDragStart}
          onClick={(e) => e.stopPropagation()}
          className="absolute -left-4 top-1/2 z-20 flex h-6 w-3.5 -translate-y-1/2 cursor-grab items-center justify-center rounded-sm bg-sky-500 text-[10px] leading-none text-white shadow active:cursor-grabbing print:hidden"
        >
          ⠿
        </span>
      )}
      {dropSide && (
        <span
          className={`pointer-events-none absolute -bottom-0.5 -top-0.5 z-30 w-[3px] rounded bg-sky-500 print:hidden ${dropSide === "before" ? "-left-0.5" : "-right-0.5"}`}
        />
      )}
      {children}
      {handles && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from bill (Delete)"
          aria-label="Remove from bill"
          className="absolute -right-1.5 -top-2 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold leading-none text-white shadow print:hidden"
        >
          ×
        </button>
      )}
      {handles && onWidth && (
        <>
          <span
            title="Drag to change field width"
            onPointerDown={(e) => dragWidth(e, -1)}
            onClick={(e) => e.stopPropagation()}
            className="absolute -left-[3px] top-0 z-10 h-full w-[6px] cursor-ew-resize print:hidden"
          />
          <span
            title="Drag to change field width"
            onPointerDown={(e) => dragWidth(e, 1)}
            onClick={(e) => e.stopPropagation()}
            className="absolute -right-[3px] top-0 z-10 h-full w-[6px] cursor-ew-resize print:hidden"
          />
        </>
      )}
      {handles && onMinHeight && (
        <span
          title="Drag to change field height"
          onPointerDown={dragHeight}
          className="absolute -bottom-[3px] left-0 z-10 h-[6px] w-full cursor-ns-resize print:hidden"
        />
      )}
    </div>
  );
}

function PairRow({
  zone,
  id,
  mode,
  label,
  labelOnly,
  value,
  onLabel,
  onValue,
  valuePlaceholder,
  withDate,
  dateLabel,
  dateValue,
  onDateLabel,
  onDateValue,
  rowAlign,
  multiline,
  valueGrip,
}: {
  multiline?: boolean;
  valueGrip?: { title: string; onPointerDown: (e: ReactPointerEvent) => void };
  zone: DesignZone;
  id: string;
  mode: BillMode;
  label: string;
  labelOnly?: boolean;
  value: string;
  onLabel?: (t: string) => void;
  onValue?: (t: string) => void;
  valuePlaceholder?: string;
  withDate?: boolean;
  dateLabel?: string;
  dateValue?: string;
  onDateLabel?: (t: string) => void;
  onDateValue?: (t: string) => void;
  rowAlign?: Align;
}) {
  const ctx = useDesign();
  const layout = getDesignPartLayout(ctx.spec, { zone, id });
  const styleOf = layout.partStyle || {};
  // A box that is aligned (or a whole-field align) stops stretching, so it can actually move
  const boxMoved = Object.values(styleOf).some((s) => s?.boxAlign && s.boxAlign !== "left");
  const packed = (!!rowAlign && rowAlign !== "left") || boxMoved;
  const justify = rowAlign === "center" ? "justify-center" : rowAlign === "right" ? "justify-end" : "justify-start";
  const ph = styleOf.value?.placeholder || valuePlaceholder || (mode === "design" ? "answer" : "");
  const datePh = styleOf.dateValue?.placeholder || "DD-MM-YYYY";
  return (
    <div className={`flex min-w-0 flex-wrap items-baseline gap-x-1 ${justify}`}>
      <Part zone={zone} id={id} part="label" defaultClass="max-w-full shrink-0">
        <Label mode={mode} text={label} onChange={onLabel} className="whitespace-nowrap" placeholder="Label" />
      </Part>
      {!labelOnly && (
        <Part zone={zone} id={id} part="value" grow={!packed} defaultClass="min-w-[10ch] max-w-full" grip={valueGrip}>
          <Value mode={mode} value={value} onChange={onValue} placeholder={ph} multiline={multiline} strong={multiline ? false : undefined} />
        </Part>
      )}
      {!labelOnly && withDate && (
        <>
          <Part zone={zone} id={id} part="dateLabel" defaultClass="shrink-0">
            <Label mode={mode} text={dateLabel || "Date"} onChange={onDateLabel} className="whitespace-nowrap" placeholder="Date" />
          </Part>
          <Part zone={zone} id={id} part="dateValue" defaultClass="w-[6.6rem] shrink-0">
            <Value mode={mode} value={dateValue || ""} onChange={onDateValue} placeholder={datePh} />
          </Part>
        </>
      )}
    </div>
  );
}

/** Business logo: click to select, corner handle to resize (aspect locked), drag to move when free. */
function LogoImage({ free, defaultMaxHmm }: { free?: boolean; defaultMaxHmm: number }) {
  const ctx = useDesign();
  const ref = useRef<HTMLDivElement>(null);
  const h = ctx.spec.header;
  const selected = ctx.design && ctx.anchor?.zone === "header" && ctx.anchor?.id === "logo";

  const mmPerPx = () => {
    const doc = ref.current?.closest(".bill-document") as HTMLElement | null;
    return 210 / (doc?.getBoundingClientRect().width || 794);
  };
  const patchHeader = (spec0: BillSpec, p: Partial<BillSpec["header"]>) =>
    ctx.onSpecChange?.({ ...spec0, header: { ...spec0.header, ...p } });

  function dragResize(e: ReactPointerEvent, dir: 1 | -1) {
    const k = mmPerPx();
    const w0 = (ref.current?.getBoundingClientRect().width || 100) * k;
    const spec0 = ctx.spec;
    const docW = (ref.current?.closest(".bill-document") as HTMLElement | null)?.getBoundingClientRect().width || 794;
    const x0 = spec0.header.logoXPct ?? 4;
    startDrag(e, (dx) => {
      const w = clamp(Math.round(w0 + dir * dx * k), 8, 150);
      // Free logo grows leftwards from the left corner: keep the right edge still
      const shift = free && dir === -1 ? { logoXPct: clamp(Math.round((x0 + (((w0 - w) / k) / docW) * 100) * 10) / 10, 0, 95) } : {};
      patchHeader(spec0, { logoWidthMm: w, ...shift });
    });
  }

  function dragMove(e: ReactPointerEvent) {
    if (!free || !ctx.design) return;
    const doc = ref.current?.closest(".bill-document") as HTMLElement | null;
    const rect = doc?.getBoundingClientRect();
    if (!rect) return;
    const x0 = h.logoXPct ?? 4;
    const y0 = h.logoYPct ?? 2;
    const spec0 = ctx.spec;
    startDrag(e, (dx, dy) =>
      patchHeader(spec0, {
        logoXPct: clamp(Math.round((x0 + (dx / rect.width) * 100) * 10) / 10, 0, 95),
        logoYPct: clamp(Math.round((y0 + (dy / rect.height) * 100) * 10) / 10, 0, 97),
      })
    );
  }

  if (!h.logoUrl) return null;
  return (
    <div
      ref={ref}
      onPointerDown={free ? dragMove : undefined}
      onClick={
        ctx.design
          ? (e) => {
              e.stopPropagation();
              ctx.pick({ zone: "header", id: "logo", part: "logo" });
            }
          : undefined
      }
      className={`${free ? "absolute z-[6]" : "relative shrink-0"} inline-block ${ctx.design ? (free ? "cursor-move" : "cursor-pointer") : ""} ${
        selected ? "outline outline-2 outline-offset-2 outline-sky-500" : ""
      }`}
      style={free ? { left: `${h.logoXPct ?? 4}%`, top: `${h.logoYPct ?? 2}%` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={h.logoUrl}
        alt=""
        draggable={false}
        className="block h-auto object-contain"
        style={
          h.logoWidthMm
            ? { width: `${h.logoWidthMm}mm`, maxWidth: free ? undefined : "100%" }
            : { maxHeight: `${defaultMaxHmm}mm`, maxWidth: "60mm" }
        }
      />
      {selected && ctx.onSpecChange && (
        <>
          <span
            title="Drag to resize"
            onPointerDown={(e) => dragResize(e, -1)}
            onClick={(e) => e.stopPropagation()}
            className="absolute -bottom-2 -left-2 z-10 h-3 w-3 cursor-nesw-resize rounded-sm border-2 border-white bg-sky-500 shadow print:hidden"
          />
          <span
            title="Drag to resize"
            onPointerDown={(e) => dragResize(e, 1)}
            onClick={(e) => e.stopPropagation()}
            className="absolute -bottom-2 -right-2 z-10 h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-white bg-sky-500 shadow print:hidden"
          />
        </>
      )}
    </div>
  );
}

/** Free-placement text box. Select it, then drag the grip to move or the edge to resize. */
function FreeBoxLayer({
  box,
  design,
  selected,
  onPick,
  onChange,
  mode,
  value,
  onValue,
  autoFocus,
}: {
  box: FreeBox;
  design: boolean;
  selected: boolean;
  onPick: () => void;
  onChange: (patch: Partial<FreeBox>) => void;
  mode: BillMode;
  /** Answer typed on each bill (label + value boxes) */
  value: string;
  onValue?: (v: string) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pageRect = () => (ref.current?.offsetParent as HTMLElement | null)?.getBoundingClientRect();

  function dragMove(e: ReactPointerEvent) {
    const rect = pageRect();
    if (!rect) return;
    const x0 = box.xPct;
    const y0 = box.yPct;
    startDrag(e, (dx, dy) =>
      onChange({
        xPct: clamp(Math.round((x0 + (dx / rect.width) * 100) * 10) / 10, 0, 95),
        yPct: clamp(Math.round((y0 + (dy / rect.height) * 100) * 10) / 10, 0, 97),
      })
    );
  }

  function dragWidth(e: ReactPointerEvent, dir: 1 | -1) {
    const rect = pageRect();
    if (!rect) return;
    const w0 = box.wPct;
    const x0 = box.xPct;
    startDrag(e, (dx) => {
      const w = clamp(Math.round((w0 + ((dir * dx) / rect.width) * 100) * 10) / 10, 8, 100);
      onChange(dir === -1 ? { wPct: w, xPct: clamp(Math.round((x0 + w0 - w) * 10) / 10, 0, 95) } : { wPct: w });
    });
  }

  const text = design ? (
    <EditableText text={box.text} onChange={(t) => onChange({ text: t })} className="block w-full" placeholder="Text" autoFocus={autoFocus} />
  ) : (
    <span className="whitespace-pre-wrap break-words">{box.text}</span>
  );

  return (
    <div
      ref={ref}
      onClick={(e) => {
        if (!design) return;
        e.stopPropagation();
        onPick();
      }}
      className={`absolute z-[5] ${design ? "cursor-pointer" : ""} ${selected ? "outline outline-2 outline-offset-1 outline-sky-500" : ""}`}
      style={{
        left: `${box.xPct}%`,
        top: `${box.yPct}%`,
        width: `${box.wPct}%`,
        textAlign: box.align,
        fontSize: box.fontSize ? `${box.fontSize}px` : undefined,
        fontWeight: box.bold ? 700 : 400,
      }}
    >
      {design && selected && (
        <span
          onPointerDown={dragMove}
          className="absolute -left-5 top-1/2 z-10 flex h-5 w-3 -translate-y-1/2 cursor-grab items-center justify-center rounded-sm bg-sky-500 text-[9px] text-white shadow active:cursor-grabbing print:hidden"
          title="Drag to move"
        >
          ⠿
        </span>
      )}
      {box.valueKey ? (
        <div className="flex min-w-0 items-baseline gap-x-1" style={{ justifyContent: box.align === "right" ? "flex-end" : box.align === "center" ? "center" : "flex-start" }}>
          <span className="shrink-0 whitespace-nowrap">{design ? <EditableText text={box.text} onChange={(t) => onChange({ text: t })} placeholder="Label" autoFocus={autoFocus} /> : box.text}</span>
          <span className="min-w-[8ch] flex-1" style={{ fontWeight: 400 }}>
            <Value mode={mode} value={value} onChange={onValue} placeholder={box.placeholder || (design ? "answer on each bill" : "")} strong={false} />
          </span>
        </div>
      ) : (
        text
      )}
      {design && selected && (
        <>
          <ResizeGrip side="left" title="Drag to resize width" onPointerDown={(e) => dragWidth(e, -1)} />
          <ResizeGrip side="right" title="Drag to resize width" onPointerDown={(e) => dragWidth(e, 1)} />
        </>
      )}
    </div>
  );
}

const BILL_CSS = `
.bill-part[data-bold="1"] *{font-weight:700!important}
.bill-part[data-bold="0"] *{font-weight:400!important}
.bill-part[data-fs] *{font-size:inherit!important}
.bill-part[data-w] .bill-label{white-space:normal}
.bill-part{min-width:0}
.bill-part input,.bill-part textarea{text-align:inherit;width:100%;max-width:100%;min-width:0}
.bill-document [contenteditable]:focus-visible{outline:none}
.bill-document textarea{overflow-wrap:anywhere;white-space:pre-wrap}
`;

/* ------------------------------ document ------------------------------ */

export function BillDocument({
  spec,
  values,
  items,
  mode,
  onValuesChange,
  onItemsChange,
  onSpecChange,
  suggestions,
  onPickSuggestion,
  fallbackInvoiceNo,
  fallbackInvoiceDate,
  className = "",
  designAnchor,
  onDesignAnchor,
  placing,
  onPlace,
  focusId,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ zone: DropZone; id: string; hint: FieldDrop | null } | null>(null);

  /** Where would the dragged field land at this screen point? */
  function hitTest(zone: DropZone, id: string, x: number, y: number): FieldDrop | null {
    const root = rootRef.current;
    const el = document.elementFromPoint(x, y);
    if (!root || !el || !root.contains(el)) return null;
    const slot = el.closest<HTMLElement>(`[data-slot-zone="${zone}"]`);
    if (!slot || !slot.dataset.slotId) return null;
    const r = slot.getBoundingClientRect();
    const row = slot.closest<HTMLElement>("[data-line]");
    // Top / bottom edge of a row = own row above / below; middle = side by side
    if (zone !== "receiver" && row) {
      const rr = row.getBoundingClientRect();
      const edge = Math.min(8, rr.height * 0.3);
      if (y < rr.top + edge) return { kind: "line", beforeLine: Number(row.dataset.line) };
      if (y > rr.bottom - edge) {
        const next = row.nextElementSibling as HTMLElement | null;
        return { kind: "line", beforeLine: next?.dataset.line != null ? Number(next.dataset.line) : null };
      }
    }
    if (slot.dataset.slotId === id) return null;
    return { kind: "beside", targetId: slot.dataset.slotId, side: x < r.left + r.width / 2 ? "before" : "after" };
  }

  function beginFieldDrag(e: ReactPointerEvent, zone: DropZone, id: string) {
    const x0 = e.clientX;
    const y0 = e.clientY;
    const spec0 = spec;
    let hint: FieldDrop | null = null;
    setDrag({ zone, id, hint: null });
    startDrag(
      e,
      (dx, dy) => {
        hint = hitTest(zone, id, x0 + dx, y0 + dy);
        setDrag({ zone, id, hint });
      },
      () => {
        setDrag(null);
        if (hint && onSpecChange) onSpecChange(moveFieldTo(spec0, zone, id, hint));
      }
    );
  }
  const dropSideFor = (zone: DropZone, id: string) =>
    drag?.zone === zone && drag.hint?.kind === "beside" && drag.hint.targetId === id ? drag.hint.side : undefined;
  /** Horizontal insertion bar above a row (line) or below the last row (null) */
  const lineBar = (zone: DropZone, ln: number | null) =>
    drag?.zone === zone && drag.hint?.kind === "line" && drag.hint.beforeLine === ln ? (
      <span className={`pointer-events-none absolute inset-x-0 z-30 h-[3px] rounded bg-sky-500 print:hidden ${ln == null ? "-bottom-0.5" : "-top-0.5"}`} />
    ) : null;

  const fill = mode === "fill";
  const design = mode === "design" && !!onSpecChange;
  const setValue =
    onValuesChange && fill ? (k: string, v: string) => onValuesChange({ ...values, [k]: v }) : undefined;
  const setSpec =
    onSpecChange && design
      ? <K extends keyof BillSpec>(k: K, patch: Partial<BillSpec[K]>) =>
          onSpecChange({ ...spec, [k]: { ...(spec[k] as object), ...patch } as BillSpec[K] })
      : undefined;
  const patchSpec = (patch: Partial<BillSpec>) => onSpecChange?.({ ...spec, ...patch });
  const pick = (a: DesignAnchor | null) => onDesignAnchor?.(a);

  const cols = spec.columns
    .filter((c) => c.enabled)
    .map((c) => ({ ...c, align: c.align ?? professionalAlign(c) }));
  const totals = useMemo(() => computeTotals(spec, items, values), [spec, items, values]);

  const displayItems: BillItem[] =
    fill && onItemsChange ? [...items, { ...EMPTY_ITEM }] : items.filter((it) => !isItemEmpty(it));
  const fillerCount = Math.max(0, spec.table.minRows - displayItems.length);

  function updateItem(idx: number, patch: Partial<BillItem>) {
    if (!onItemsChange) return;
    const next = [...items];
    if (idx >= next.length) next.push({ ...EMPTY_ITEM });
    next[idx] = { ...next[idx], ...patch } as BillItem;
    onItemsChange(next);
  }
  function removeItem(idx: number) {
    onItemsChange?.(items.filter((_, i) => i !== idx));
  }

  const v = (k: string) => values[k] ?? "";
  /** Blank answers on a new bill pick up the default set in the design. A typed value, even empty, wins. */
  const entered = (k: string, zone: DesignZone, id: string, part: FieldPart = "value") => {
    if (Object.prototype.hasOwnProperty.call(values, k)) return values[k] ?? "";
    if (mode === "fill") return getDesignPartLayout(spec, { zone, id }).partStyle?.[part]?.defaultValue ?? "";
    return "";
  };
  const hint = (zone: DesignZone, id: string, part: FieldPart, fallback = "") =>
    getDesignPartLayout(spec, { zone, id }).partStyle?.[part]?.placeholder || fallback;
  const invoiceNo = v("invoice_no") || (mode === "print" ? fallbackInvoiceNo || "" : "");
  const invoiceDate = v("invoice_date") || (mode === "print" ? fallbackInvoiceDate || "" : "");
  const pct = totals.gstPercent;
  const vars = { seller: spec.seller.name };
  const words = spec.rupees.enabled ? amountInWordsINR(totals.grand) : "";
  /** Tax-row label edits keep "{pct}" in the stored template so the % stays live. */
  const taxLabelChange = (k: "cgstLabel" | "sgstLabel" | "igstLabel", half: boolean) =>
    setSpec
      ? (t: string) => {
          const shown = half ? pct / 2 : pct;
          const shownStr = Number.isInteger(shown) ? String(shown) : String(+shown.toFixed(2));
          const tpl = shownStr && t.includes(shownStr) ? t.replace(shownStr, "{pct}") : t;
          setSpec("totals", { [k]: tpl });
        }
      : undefined;

  const border = "border-black";
  const fontSize = spec.page.baseFontSize || 11;
  const gridCols = cols.map((c) => `${c.width}fr`).join(" ");
  const recvW = Math.min(75, Math.max(30, spec.layout?.receiverWidth ?? 56));
  const footW = Math.min(75, Math.max(35, spec.layout?.footerLeftWidth ?? 56));
  const isActive = (zone: DesignZone, id?: string) =>
    design && designAnchor?.zone === zone && (id == null || designAnchor.id === id);

  function colJustify(align: Align) {
    if (align === "right") return "justify-end text-right";
    if (align === "left") return "justify-start text-left";
    return "justify-center text-center";
  }

  // Page margins reproduced from the original (falls back to 10mm / 9mm)
  const PAGE_H = 297;
  const PAGE_W = 210;
  const padTop = spec.layout?.topMarginPct != null ? Math.max(6, (spec.layout.topMarginPct / 100) * PAGE_H) : 10;
  const padBottom = spec.layout?.bottomMarginPct != null ? Math.max(6, (spec.layout.bottomMarginPct / 100) * PAGE_H) : 10;
  const padSide = spec.layout?.sideMarginPct != null ? Math.min(20, Math.max(6, (spec.layout.sideMarginPct / 100) * PAGE_W)) : 9;
  const letterhead = padTop > 22; // the original leaves room for a pre-printed letterhead

  /* ---------------------------- business banner ---------------------------- */
  const h = spec.header;
  const logoOn = !!h.logoUrl && h.showLogo !== false;
  const placement = h.logoPlacement ?? "top";
  const logoInBanner = logoOn && placement !== "free";
  const showName = h.showSellerName && (!!spec.seller.name || !!spec.seller.address || design);
  const bannerAlign: Align = h.bannerAlign ?? "center";
  const titleInBanner = h.titlePlacement === "banner";
  const showBanner = showName || logoInBanner || (titleInBanner && (!!h.title || design));
  const showBand = h.showSellerGstin || !!h.copyLabel || !titleInBanner || design;
  const rowsParty = spec.layout?.partyStyle === "rows";
  const showBasicRow = spec.totals.showBasic !== false;
  const signSpread = !!spec.signature.spread && !spec.terms.enabled;
  const forLineNode = design ? (
    <>
      <Label
        mode={mode}
        text={spec.signature.forLine.replace(/\{seller\}/g, "").trim()}
        placeholder="For,"
        onChange={(t) => setSpec?.("signature", { forLine: `${t} {seller}` })}
      />{" "}
      <Label mode={mode} text={spec.seller.name} placeholder="YOUR BUSINESS NAME" onChange={(t) => setSpec?.("seller", { name: t })} />
    </>
  ) : (
    fillTemplate(spec.signature.forLine, vars)
  );
  const rupeesInFooter = spec.rupees.enabled && spec.rupees.placement === "footer";
  const rupeesNode = (
    <div className="flex flex-wrap items-baseline gap-x-2 px-2 py-1">
      <Part zone="totals" id="rupees" defaultClass="shrink-0">
        <Label mode={mode} text={spec.rupees.label} className="whitespace-nowrap" onChange={setSpec ? (t) => setSpec("rupees", { label: t }) : undefined} />
      </Part>
      <span className="font-bold">{words}</span>
    </div>
  );
  const titleNode = (
    <Part zone="header" id="title" block align={titleInBanner ? bannerAlign : "center"} className={titleInBanner ? "" : "px-4 text-[12px] tracking-wide"}>
      {titleInBanner ? (
        <span className={`inline-block border ${border} px-2 py-[1px] text-[12px]`}>
          <Label mode={mode} text={h.title} placeholder="TITLE" onChange={setSpec ? (t) => setSpec("header", { title: t }) : undefined} />
        </span>
      ) : (
        <Label mode={mode} text={h.title} placeholder="TITLE" onChange={setSpec ? (t) => setSpec("header", { title: t }) : undefined} />
      )}
    </Part>
  );

  function renderBanner(large: boolean) {
    const side = logoInBanner && (placement === "left" || placement === "right");
    const textAlign: Align = side ? (placement === "left" ? "left" : "right") : bannerAlign;
    const text = showName && (
      <div className="min-w-0" style={{ textAlign }}>
        <Part zone="header" id="seller_name" block align={textAlign}>
          <Label
            mode={mode}
            text={spec.seller.name}
            placeholder="YOUR BUSINESS NAME"
            onChange={setSpec ? (t) => setSpec("seller", { name: t }) : undefined}
            className={`uppercase tracking-wide ${large ? "text-[20px]" : "text-[15px]"}`}
          />
        </Part>
        {(spec.seller.address || design) && (
          <Part zone="header" id="seller_address" block align={textAlign} className="mt-0.5">
            <Label
              mode={mode}
              text={spec.seller.address}
              placeholder="Business address"
              strong={false}
              onChange={setSpec ? (t) => setSpec("seller", { address: t }) : undefined}
              className={large ? "text-[11px]" : "text-[10px]"}
            />
          </Part>
        )}
      </div>
    );
    const logo = logoInBanner && <LogoImage defaultMaxHmm={large ? 16 : 12} />;
    const justify = bannerAlign === "left" ? "justify-start" : bannerAlign === "right" ? "justify-end" : "justify-center";
    if (side) {
      return (
        <div className={`flex w-full items-center gap-3 ${justify}`}>
          {placement === "left" ? (
            <>
              {logo}
              {text}
            </>
          ) : (
            <>
              {text}
              {logo}
            </>
          )}
        </div>
      );
    }
    const items = bannerAlign === "left" ? "items-start" : bannerAlign === "right" ? "items-end" : "items-center";
    return (
      <div className={`flex w-full flex-col gap-1 ${items}`}>
        {titleInBanner && (h.title || design) && <div className="w-full">{titleNode}</div>}
        {logo}
        {text}
      </div>
    );
  }

  const ctx: DesignCtxValue = { spec, design, anchor: designAnchor, pick, onSpecChange: design ? onSpecChange : undefined };

  return (
    <DesignCtx.Provider value={ctx}>
      <div
        ref={rootRef}
        className={`bill-document relative mx-auto flex flex-col bg-white text-black ${className}`}
        onClick={design ? () => pick(null) : undefined}
        style={{
          width: `${PAGE_W}mm`,
          minHeight: `${PAGE_H}mm`,
          padding: `${letterhead ? 8 : padTop}mm ${padSide}mm ${padBottom}mm`,
          fontFamily: spec.page.fontFamily,
          fontSize: `${fontSize}px`,
          lineHeight: 1.3,
          boxSizing: "border-box",
        }}
      >
        <style>{BILL_CSS}</style>
        {letterhead && (
          <div className="mb-1 flex shrink-0 items-center" style={{ minHeight: `${padTop - 9}mm` }}>
            {showBanner ? (
              renderBanner(true)
            ) : (
              design && (
                <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-slate-300 py-3 text-[10px] text-slate-500 print:hidden">
                  <span>
                    Letterhead space (kept blank for pre-printed stationery) ·{" "}
                    <button
                      type="button"
                      className="font-semibold text-sky-700 underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSpec?.("header", { showSellerName: true });
                      }}
                    >
                      Print business name here
                    </button>
                  </span>
                </div>
              )
            )}
          </div>
        )}
        <div className={`flex flex-1 flex-col border ${border}`}>
          {/* ------------------------------ header ------------------------------ */}
          {showBanner && !letterhead && <div className={`border-b ${border} px-2 py-1.5`}>{renderBanner(false)}</div>}
          {showBand && (
          <div className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 border-b ${border} px-2 py-1`}>
            <div className="min-w-0">
              {h.showSellerGstin && (
                <PairRow
                  zone="header"
                  id="seller_gstin"
                  mode={mode}
                  label={h.sellerGstinLabel}
                  value={spec.seller.gstin}
                  valuePlaceholder={design ? "Your GSTIN" : ""}
                  onLabel={setSpec ? (t) => setSpec("header", { sellerGstinLabel: t }) : undefined}
                  onValue={setSpec ? (t) => setSpec("seller", { gstin: t.toUpperCase() }) : undefined}
                />
              )}
            </div>
            {titleInBanner ? <span /> : titleNode}
            <div className="min-w-0 text-right">
              <Part zone="header" id="copy" block align="right">
                <Label mode={mode} text={h.copyLabel} placeholder="Copy label" onChange={setSpec ? (t) => setSpec("header", { copyLabel: t }) : undefined} />
              </Part>
            </div>
          </div>
          )}

          {/* ------------------------- receiver / meta ------------------------- */}
          <div className="grid" style={{ gridTemplateColumns: rowsParty ? "100%" : `${recvW}% ${100 - recvW}%` }}>
            <div className={`min-w-0 ${rowsParty ? "order-2" : `border-r ${border}`}`}>
              {(spec.receiver.heading || (design && !rowsParty)) && (
              <div className={`border-b ${border} px-2 py-0.5`}>
                <Part zone="receiver" id="heading" block align="center">
                  <Label mode={mode} text={spec.receiver.heading} placeholder="Receiver heading" onChange={setSpec ? (t) => setSpec("receiver", { heading: t }) : undefined} />
                </Part>
              </div>
              )}
              <div className={`flex flex-col px-2 ${rowsParty ? "pb-1.5" : "py-1.5"}`} style={rowsParty ? undefined : { minHeight: "30mm" }}>
                <div className="relative">
                  <div className="flex items-baseline gap-x-1">
                    {spec.receiver.nameLabel && (
                      <Part zone="receiver" id="customer_name" part="label" defaultClass="shrink-0">
                        <Label mode={mode} text={spec.receiver.nameLabel} className="whitespace-nowrap" onChange={setSpec ? (t) => setSpec("receiver", { nameLabel: t }) : undefined} />
                      </Part>
                    )}
                    <Part zone="receiver" id="customer_name" part="value" block={!spec.receiver.nameLabel} grow={!!spec.receiver.nameLabel}>
                      <Value
                        mode={mode}
                        value={entered("customer_name", "receiver", "customer_name")}
                        onChange={setValue ? (t) => setValue("customer_name", t) : undefined}
                        placeholder={hint("receiver", "customer_name", "value", spec.receiver.namePlaceholder)}
                        size={spec.receiver.nameLabel ? undefined : fontSize + 1}
                      />
                    </Part>
                  </div>
                  {fill && suggestions && suggestions.length > 0 && onPickSuggestion && (
                    <ul className="absolute left-0 top-full z-30 mt-0.5 max-h-52 w-[min(100%,340px)] overflow-auto rounded-md border border-slate-200 bg-white text-[12px] shadow-xl print:hidden">
                      {suggestions.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onPickSuggestion(s)}
                          >
                            <span className="font-semibold">{s.name}</span>
                            <span className="block text-[11px] text-slate-500">
                              {[s.gstin, s.phone, s.city, s.state].filter(Boolean).join(" · ")}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-0.5 flex items-baseline gap-x-1">
                  {spec.receiver.addressLabel && (
                    <Part zone="receiver" id="address" part="label" defaultClass="shrink-0">
                      <Label mode={mode} text={spec.receiver.addressLabel} className="whitespace-nowrap" onChange={setSpec ? (t) => setSpec("receiver", { addressLabel: t }) : undefined} />
                    </Part>
                  )}
                  <Part zone="receiver" id="address" part="value" block={!spec.receiver.addressLabel} grow={!!spec.receiver.addressLabel}>
                    <Value
                      mode={mode}
                      value={entered("address", "receiver", "address")}
                      onChange={setValue ? (t) => setValue("address", t) : undefined}
                      placeholder={hint("receiver", "address", "value", spec.receiver.addressPlaceholder)}
                      multiline
                      strong={false}
                    />
                  </Part>
                </div>
                <div className={rowsParty ? "pt-0.5" : "mt-auto pt-1"}>
                  {spec.receiver.showState && (
                    <Block zone="receiver" id="state_row" active={isActive("receiver", "state_row")} className="flex flex-wrap items-baseline gap-x-1">
                      <Part zone="receiver" id="state_row" part="label" defaultClass="shrink-0">
                        <Label mode={mode} text={spec.receiver.stateLabel} className="whitespace-nowrap" onChange={setSpec ? (t) => setSpec("receiver", { stateLabel: t }) : undefined} />
                      </Part>
                      <Part zone="receiver" id="state_row" part="value" grow>
                        <Value mode={mode} value={entered("buyer_state", "receiver", "state_row")} onChange={setValue ? (t) => setValue("buyer_state", t.toUpperCase()) : undefined} placeholder={hint("receiver", "state_row", "value", "State")} />
                      </Part>
                      <Part zone="receiver" id="state_row" part="dateLabel" defaultClass="shrink-0">
                        <Label mode={mode} text={spec.receiver.codeLabel} className="whitespace-nowrap" onChange={setSpec ? (t) => setSpec("receiver", { codeLabel: t }) : undefined} />
                      </Part>
                      <Part zone="receiver" id="state_row" part="dateValue" defaultClass="w-[5ch] shrink-0">
                        <Value
                          mode={mode}
                          value={entered("buyer_code", "receiver", "state_row", "dateValue")}
                          onChange={setValue ? (t) => setValue("buyer_code", t.replace(/\D/g, "").slice(0, 2)) : undefined}
                          placeholder={hint("receiver", "state_row", "dateValue", "00")}
                        />
                      </Part>
                    </Block>
                  )}
                  <div className="flex flex-wrap">
                    {spec.receiver.showGstin && (
                      <FieldSlot
                        design={design}
                        active={!!isActive("receiver", "gstin")}
                        widthPct={spec.receiver.gstinWidthPct ?? 100}
                        onWidth={setSpec ? (w) => setSpec("receiver", { gstinWidthPct: w }) : undefined}
                        onPick={() => pick({ zone: "receiver", id: "gstin" })}
                        onRemove={setSpec ? () => setSpec("receiver", { showGstin: false }) : undefined}
                        slotZone="receiver"
                        slotId="gstin"
                        dropSide={dropSideFor("receiver", "gstin")}
                      >
                        <PairRow
                          zone="receiver"
                          id="gstin"
                          mode={mode}
                          label={spec.receiver.gstinLabel}
                          value={entered("gstin", "receiver", "gstin")}
                          onLabel={setSpec ? (t) => setSpec("receiver", { gstinLabel: t }) : undefined}
                          onValue={setValue ? (t) => setValue("gstin", t.toUpperCase()) : undefined}
                        />
                      </FieldSlot>
                    )}
                    {(spec.receiver.extraFields || [])
                      .filter((f) => f.enabled)
                      .map((f) => {
                        const setExtra = (patch: Partial<typeof f>) =>
                          setSpec?.("receiver", {
                            extraFields: (spec.receiver.extraFields || []).map((x) => (x.id === f.id ? { ...x, ...patch } : x)),
                          });
                        return (
                          <FieldSlot
                            key={f.id}
                            design={design}
                            active={!!isActive("receiver", f.id)}
                            widthPct={f.widthPct || 40}
                            minHeight={f.minHeight}
                            onWidth={setSpec ? (w) => setExtra({ widthPct: w }) : undefined}
                            onMinHeight={setSpec ? (px) => setExtra({ minHeight: px }) : undefined}
                            onPick={() => pick({ zone: "receiver", id: f.id })}
                            onRemove={setSpec ? () => setExtra({ enabled: false }) : undefined}
                            onDragStart={design ? (e) => beginFieldDrag(e, "receiver", f.id) : undefined}
                            slotZone="receiver"
                            slotId={f.id}
                            align={f.align}
                            dragging={drag?.id === f.id}
                            dropSide={dropSideFor("receiver", f.id)}
                          >
                            <PairRow
                              zone="receiver"
                              id={f.id}
                              mode={mode}
                              rowAlign={f.align}
                              label={f.label}
                              labelOnly={!!f.labelOnly}
                              value={entered(f.key, "receiver", f.id)}
                              onLabel={setSpec ? (t) => setExtra({ label: t }) : undefined}
                              onValue={setValue ? (t) => setValue(f.key, t) : undefined}
                            />
                          </FieldSlot>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>

            <div className={`min-w-0 ${rowsParty ? "order-1" : ""}`}>
              {h.showSellerState !== false && (
              <Block zone="header" id="seller_state" active={!!isActive("header", "seller_state")} className={`flex flex-wrap items-baseline gap-x-1 border-b ${border} px-2 py-0.5`}>
                <Part zone="header" id="seller_state" part="label" defaultClass="shrink-0">
                  <Label mode={mode} text={spec.seller.stateLabel} className="whitespace-nowrap" onChange={setSpec ? (t) => setSpec("seller", { stateLabel: t }) : undefined} />
                </Part>
                <Part zone="header" id="seller_state" part="value" grow align="center">
                  <Value mode={mode} value={spec.seller.state} strong={false} placeholder={design ? "STATE" : ""} onChange={setSpec ? (t) => setSpec("seller", { state: t.toUpperCase() }) : undefined} />
                </Part>
                <Part zone="header" id="seller_state" part="dateLabel" defaultClass="shrink-0">
                  <Label mode={mode} text={spec.seller.codeLabel} className="whitespace-nowrap" onChange={setSpec ? (t) => setSpec("seller", { codeLabel: t }) : undefined} />
                </Part>
                <Part zone="header" id="seller_state" part="dateValue" defaultClass="min-w-[3ch] shrink-0">
                  <Value
                    mode={mode}
                    value={spec.seller.stateCode}
                    strong={false}
                    placeholder={design ? "00" : ""}
                    onChange={setSpec ? (t) => setSpec("seller", { stateCode: t.replace(/\D/g, "").slice(0, 2) }) : undefined}
                  />
                </Part>
              </Block>
              )}
              <div className={rowsParty ? "px-1.5 pt-1" : "px-1.5 py-1"}>
                {(() => {
                  const enabled = spec.metaRows
                    .map((r, i) => ({ ...r, line: r.line ?? i, widthPct: r.widthPct ?? 100 }))
                    .filter((r) => r.enabled);
                  const byLine = new Map<number, MetaRow[]>();
                  for (const r of enabled) byLine.set(r.line ?? 0, [...(byLine.get(r.line ?? 0) || []), r]);
                  const setRow = (id: string, patch: Partial<MetaRow>) =>
                    patchSpec({ metaRows: spec.metaRows.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
                  const lines = [...byLine.keys()].sort((a, b) => a - b);
                  return lines.map((ln, li) => (
                      <div key={ln} data-line={ln} className="relative flex flex-wrap">
                        {lineBar("meta", ln)}
                        {li === lines.length - 1 && lineBar("meta", null)}
                        {byLine.get(ln)!.map((r) => {
                          const isInvoice = r.key === "invoice_no";
                          return (
                            <FieldSlot
                              key={r.id}
                              design={design}
                              active={!!isActive("meta", r.id)}
                              widthPct={r.widthPct ?? 100}
                              minHeight={r.minHeight}
                              onWidth={design ? (w) => setRow(r.id, { widthPct: w, line: r.line }) : undefined}
                              onMinHeight={design ? (px) => setRow(r.id, { minHeight: px }) : undefined}
                              onDragStart={design ? (e) => beginFieldDrag(e, "meta", r.id) : undefined}
                              onPick={() => pick({ zone: "meta", id: r.id })}
                              onRemove={design ? () => setRow(r.id, { enabled: false }) : undefined}
                              slotZone="meta"
                              slotId={r.id}
                              align={r.align}
                              dragging={drag?.id === r.id}
                              dropSide={dropSideFor("meta", r.id)}
                            >
                              <PairRow
                                zone="meta"
                                id={r.id}
                                mode={mode}
                                rowAlign={r.align}
                                label={r.label}
                                labelOnly={!!r.labelOnly}
                                value={isInvoice ? invoiceNo || entered("invoice_no", "meta", r.id) : entered(r.key, "meta", r.id)}
                                withDate={r.withDate}
                                dateLabel={r.dateLabel}
                                dateValue={isInvoice ? invoiceDate || entered("invoice_date", "meta", r.id, "dateValue") : entered(r.dateKey, "meta", r.id, "dateValue")}
                                onLabel={design ? (t) => setRow(r.id, { label: t }) : undefined}
                                onValue={setValue ? (t) => setValue(isInvoice ? "invoice_no" : r.key, t) : undefined}
                                onDateLabel={design ? (t) => setRow(r.id, { dateLabel: t }) : undefined}
                                onDateValue={setValue ? (t) => setValue(isInvoice ? "invoice_date" : r.dateKey, t) : undefined}
                              />
                            </FieldSlot>
                          );
                        })}
                      </div>
                    ));
                })()}
              </div>
            </div>
          </div>

          {/* ------------------------------- items ------------------------------- */}
          {/* CSS grid (not <table>) so the blank area stretches to the page bottom exactly like a printed bill */}
          <div className={`relative flex flex-1 flex-col border-t ${border}`}>
            <div className={`grid border-b ${border}`} style={{ gridTemplateColumns: gridCols }}>
              {cols.map((c, i) => {
                const colSel = isActive("column", c.key);
                return (
                  <div
                    key={c.key}
                    onClick={
                      design
                        ? (e) => {
                            e.stopPropagation();
                            pick({ zone: "column", id: c.key });
                          }
                        : undefined
                    }
                    className={`${i > 0 ? `border-l ${border}` : ""} relative flex min-w-0 items-center px-1 py-1 ${colJustify(c.align)} ${
                      design ? "cursor-pointer" : ""
                    } ${colSel ? "z-[2] outline outline-2 -outline-offset-2 outline-sky-500" : ""}`}
                  >
                    <Label
                      mode={mode}
                      text={c.label}
                      align={c.align}
                      className="break-words"
                      placeholder="Column"
                      onChange={design ? (t) => patchSpec({ columns: spec.columns.map((x) => (x.key === c.key ? { ...x, label: t } : x)) }) : undefined}
                    />
                    {design && i < cols.length - 1 && (
                      <span
                        title="Drag to change column width"
                        className="absolute -right-[4px] top-0 z-20 h-full w-[7px] cursor-col-resize print:hidden"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => {
                          const next = cols[i + 1];
                          const rowW = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect().width || 1;
                          const sum = cols.reduce((s, x) => s + x.width, 0);
                          const a0 = c.width;
                          const pair = a0 + next.width;
                          const spec0 = spec;
                          startDrag(e, (dx) => {
                            const a = clamp(a0 + (dx / rowW) * sum, 2, pair - 2);
                            onSpecChange?.({
                              ...spec0,
                              columns: spec0.columns.map((x) =>
                                x.key === c.key
                                  ? { ...x, width: Math.round(a * 10) / 10 }
                                  : x.key === next.key
                                    ? { ...x, width: Math.round((pair - a) * 10) / 10 }
                                    : x
                              ),
                            });
                          });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {displayItems.map((it, idx) => {
              const isGhost = fill && idx === items.length;
              const amount = itemAmount(it, spec);
              return (
                <div key={idx} className="group relative grid" style={{ gridTemplateColumns: gridCols }}>
                  {cols.map((c, ci) => {
                    const alignCls =
                      c.type === "index" || c.align === "center"
                        ? "text-center"
                        : c.type === "computed" || c.align === "right"
                          ? "text-right"
                          : "text-left";
                    const cellCls = `${ci > 0 ? `border-l ${border}` : ""} min-w-0 px-1 py-[3px] ${alignCls}`;
                    if (c.type === "index") {
                      return (
                        <div key={c.key} className={`${cellCls} text-center`}>
                          <span className={isGhost ? "text-black/25" : "font-bold"}>{idx + 1}</span>
                        </div>
                      );
                    }
                    if (c.type === "computed") {
                      return (
                        <div key={c.key} className={`${cellCls} text-right`}>
                          <span className="font-bold">{isItemEmpty(it) ? "" : fmtMoney(amount)}</span>
                        </div>
                      );
                    }
                    const val = it[c.key] ?? "";
                    const editableCols = cols.filter((x) => x.type !== "index" && x.type !== "computed");
                    const colPos = editableCols.findIndex((x) => x.key === c.key);
                    const focusCell = (row: number, key: string) =>
                      requestAnimationFrame(() => (document.querySelector(`[data-bill-cell="${row}:${key}"]`) as HTMLElement | null)?.focus());
                    return (
                      <div key={c.key} className={cellCls}>
                        <Value
                          mode={mode}
                          value={val}
                          onChange={fill && onItemsChange ? (t) => updateItem(idx, { [c.key]: t }) : undefined}
                          placeholder={isGhost && c.key === "description" ? "Type item name · Tab accepts AI · Enter next row" : ""}
                          align={c.align}
                          multiline={c.key === "description"}
                          strong
                          onKeyDown={
                            fill && onItemsChange
                              ? (e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    const nextIdx = idx + 1;
                                    if (nextIdx >= items.length) updateItem(nextIdx, { description: "" });
                                    focusCell(nextIdx, "description");
                                  } else if (e.key === "Tab" && !e.shiftKey && colPos === editableCols.length - 1) {
                                    e.preventDefault();
                                    const nextIdx = idx + 1;
                                    if (nextIdx >= items.length) updateItem(nextIdx, { description: "" });
                                    focusCell(nextIdx, editableCols[0]?.key || "description");
                                  }
                                }
                              : undefined
                          }
                          dataCell={fill ? `${idx}:${c.key}` : undefined}
                        />
                      </div>
                    );
                  })}
                  {fill && !isGhost && onItemsChange && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="absolute -left-7 top-[2px] hidden h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[11px] font-bold text-red-600 shadow-sm group-hover:flex print:hidden"
                      title="Remove this item"
                      aria-label="Remove item"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}

            {/* filler: grows to the bottom of the page, keeps vertical rules continuous */}
            <div className="grid flex-1" style={{ gridTemplateColumns: gridCols, minHeight: `${fillerCount * 6.2}mm` }}>
              {cols.map((c, ci) => (
                <div key={c.key} className={ci > 0 ? `border-l ${border}` : ""} />
              ))}
            </div>

            {spec.table.showTotalRow && (
              <div className={`grid border-t ${border}`} style={{ gridTemplateColumns: gridCols }}>
                {(() => {
                  const qtyIdx = cols.findIndex((c) => c.key === "qty");
                  const amtIdx = cols.findIndex((c) => c.key === "amount");
                  const labelIdx = qtyIdx > 0 ? qtyIdx - 1 : 0;
                  return cols.map((c, ci) => {
                    const base = `${ci > 0 ? `border-l ${border}` : ""} px-1 py-1 min-w-0`;
                    if (ci === labelIdx) {
                      return (
                        <div key={c.key} className={`${base} text-right`}>
                          <Part zone="totals" id="total_row" block align="right">
                            <Label mode={mode} text={spec.table.totalLabel} placeholder="Total" onChange={setSpec ? (t) => setSpec("table", { totalLabel: t }) : undefined} />
                          </Part>
                        </div>
                      );
                    }
                    if (ci === qtyIdx) {
                      return (
                        <div key={c.key} className={`${base} text-right font-bold`}>
                          {totals.qtyTotal ? fmtQty(totals.qtyTotal) : ""}
                        </div>
                      );
                    }
                    if (ci === amtIdx) {
                      return (
                        <div key={c.key} className={`${base} text-right font-bold`}>
                          {totals.basic ? fmtMoney(totals.basic) : ""}
                        </div>
                      );
                    }
                    return <div key={c.key} className={base} />;
                  });
                })()}
              </div>
            )}
          </div>

          {/* ------------------------------ footer ------------------------------ */}
          <div className={`grid border-t ${border}`} style={{ gridTemplateColumns: `${footW}% ${100 - footW}%` }}>
            <div className={`flex min-w-0 flex-col border-r ${border}`}>
              {(() => {
                const ff = spec.footerFields.filter((f) => f.enabled);
                const byLine = new Map<number, typeof ff>();
                ff.forEach((f, i) => {
                  const ln = f.line ?? (f.multiline ? 1000 + i : 0);
                  byLine.set(ln, [...(byLine.get(ln) || []), f]);
                });
                const lineNos = [...byLine.keys()].sort((a, b) => a - b);
                const setFF = (id: string, patch: Partial<(typeof ff)[number]>) =>
                  patchSpec({ footerFields: spec.footerFields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
                return (
                  <>
                    {lineNos.map((ln, li) => {
                      const group = byLine.get(ln)!;
                      /** Drag the answer up beside its label, or down under it */
                      const stackGrip = (f: (typeof ff)[number]) =>
                        design && f.multiline && !f.labelOnly && onSpecChange
                          ? {
                              title: f.valueBeside ? "Drag down to put the answer under the label" : "Drag up to put the answer beside the label",
                              onPointerDown: (e: ReactPointerEvent) => {
                                const spec0 = spec;
                                let beside = !!f.valueBeside;
                                startDrag(e, (dx, dy) => {
                                  const want = f.valueBeside ? dy < 10 : dy < -6 || dx > 24;
                                  if (want === beside) return;
                                  beside = want;
                                  onSpecChange({
                                    ...spec0,
                                    footerFields: spec0.footerFields.map((x) => (x.id === f.id ? { ...x, valueBeside: want } : x)),
                                  });
                                });
                              },
                            }
                          : undefined;
                      return (
                        <div
                          key={ln}
                          data-line={ln}
                          className={`relative grid gap-x-2 border-b ${border} px-2 py-0.5`}
                          style={{ gridTemplateColumns: `repeat(${group.length}, minmax(0, 1fr))` }}
                        >
                          {lineBar("footer", ln)}
                          {li === lineNos.length - 1 && lineBar("footer", null)}
                          {group.map((f) => (
                            <FieldSlot
                              key={f.id}
                              design={design}
                              active={!!isActive("footer", f.id)}
                              widthPct={100}
                              onPick={() => pick({ zone: "footer", id: f.id })}
                              onDragStart={design ? (e) => beginFieldDrag(e, "footer", f.id) : undefined}
                              onRemove={design ? () => setFF(f.id, { enabled: false }) : undefined}
                              slotZone="footer"
                              slotId={f.id}
                              dragging={drag?.id === f.id}
                              dropSide={dropSideFor("footer", f.id)}
                            >
                              {f.multiline && !f.valueBeside ? (
                                <div className="min-w-0">
                                  <Part zone="footer" id={f.id} part="label" block>
                                    <Label mode={mode} text={f.label} placeholder="Label" onChange={design ? (t) => setFF(f.id, { label: t }) : undefined} />
                                  </Part>
                                  {!f.labelOnly && (
                                    <Part zone="footer" id={f.id} part="value" block grip={stackGrip(f)}>
                                      <Value
                                        mode={mode}
                                        value={entered(f.key, "footer", f.id)}
                                        onChange={setValue ? (t) => setValue(f.key, t) : undefined}
                                        placeholder={hint("footer", f.id, "value", design ? "answer" : "")}
                                        multiline
                                        strong={false}
                                      />
                                    </Part>
                                  )}
                                </div>
                              ) : (
                                <PairRow
                                  zone="footer"
                                  id={f.id}
                                  mode={mode}
                                  label={f.label}
                                  labelOnly={!!f.labelOnly}
                                  multiline={!!f.multiline}
                                  valueGrip={stackGrip(f)}
                                  value={entered(f.key, "footer", f.id)}
                                  onLabel={design ? (t) => setFF(f.id, { label: t }) : undefined}
                                  onValue={setValue ? (t) => setValue(f.key, t) : undefined}
                                />
                              )}
                            </FieldSlot>
                          ))}
                        </div>
                      );
                    })}
                    {spec.bank.enabled && (
                      <Block
                        zone="bank"
                        id="bank"
                        active={!!isActive("bank")}
                        className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-x-3 px-2 py-1 text-[10px] leading-[1.35]"
                      >
                        {(
                          [
                            ["nameLabel", "name", "Bank name"],
                            ["acLabel", "acNo", "Account no"],
                            ["ifscLabel", "ifsc", "IFSC"],
                            ["branchLabel", "branch", "Branch"],
                          ] as const
                        ).map(([lk, vk, ph]) => (
                          <div key={vk} className="min-w-0">
                            <PairRow
                              zone="bank"
                              id={`bank_${vk}`}
                              mode={mode}
                              label={`${spec.bank[lk]} :`}
                              value={spec.bank[vk]}
                              valuePlaceholder={design ? ph : ""}
                              onLabel={setSpec ? (t) => setSpec("bank", { [lk]: t.replace(/\s*:\s*$/, "") }) : undefined}
                              onValue={setSpec ? (t) => setSpec("bank", { [vk]: vk === "ifsc" ? t.toUpperCase() : t }) : undefined}
                            />
                          </div>
                        ))}
                      </Block>
                    )}
                    {rupeesInFooter && rupeesNode}
                  </>
                );
              })()}
            </div>

            <div className="min-w-0 px-2 py-1">
              {(showBasicRow || !totals.noTax || spec.totals.showRoundOff || design) && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-[2px]">
                {showBasicRow && (
                  <>
                    <Part zone="totals" id="basic" block>
                      <Label mode={mode} text={spec.totals.basicLabel} onChange={setSpec ? (t) => setSpec("totals", { basicLabel: t }) : undefined} />
                    </Part>
                    <span className="text-right font-bold">{totals.basic ? fmtMoney(totals.basic) : ""}</span>
                  </>
                )}

                {totals.noTax ? (
                  mode === "print" ? null : (
                    <>
                      <span className="text-[10px] italic text-black/45 print:hidden">
                        {totals.taxMode === "none" ? "No GST on this bill" : "GST 0% — no tax rows will print"}
                      </span>
                      <span />
                    </>
                  )
                ) : !totals.interstate ? (
                  <>
                    <Part zone="totals" id="cgst" block>
                      <Label mode={mode} text={fillTemplate(taxRowLabel(spec.totals.cgstLabel, totals, true), vars)} strong={false} onChange={taxLabelChange("cgstLabel", true)} />
                    </Part>
                    <span className="text-right">{totals.basic ? fmtMoney(totals.cgst) : ""}</span>
                    <Part zone="totals" id="sgst" block>
                      <Label mode={mode} text={fillTemplate(taxRowLabel(spec.totals.sgstLabel, totals, true), vars)} strong={false} onChange={taxLabelChange("sgstLabel", true)} />
                    </Part>
                    <span className="text-right">{totals.basic ? fmtMoney(totals.sgst) : ""}</span>
                  </>
                ) : (
                  <>
                    <Part zone="totals" id="igst" block>
                      <Label mode={mode} text={fillTemplate(taxRowLabel(spec.totals.igstLabel, totals, false), vars)} strong={false} onChange={taxLabelChange("igstLabel", false)} />
                    </Part>
                    <span className="text-right">{totals.basic ? fmtMoney(totals.igst) : ""}</span>
                  </>
                )}
                {totals.mixedRates && !totals.noTax && (
                  <span className="col-span-2 text-[9px] leading-tight text-black/60">
                    {totals.breakup
                      .filter((b) => b.pct > 0)
                      .map((b) => `${fmtMoney(b.taxable)} @ ${b.pct}% = ${fmtMoney(b.tax)}`)
                      .join(" · ")}
                  </span>
                )}

                {spec.totals.showRoundOff && (
                  <>
                    <Part zone="totals" id="round_off" block>
                      <Label mode={mode} text={spec.totals.roundOffLabel} strong={false} onChange={setSpec ? (t) => setSpec("totals", { roundOffLabel: t }) : undefined} />
                    </Part>
                    <span className="text-right">
                      {totals.basic ? (totals.roundOff >= 0 ? "+" : "-") + fmtMoney(Math.abs(totals.roundOff)) : ""}
                    </span>
                  </>
                )}
              </div>
              )}
              <div
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 ${
                  showBasicRow || !totals.noTax || spec.totals.showRoundOff ? `mt-1 border-t ${border} pt-1` : ""
                }`}
              >
                <Part zone="totals" id="grand" block>
                  <Label mode={mode} text={spec.totals.grandLabel} onChange={setSpec ? (t) => setSpec("totals", { grandLabel: t }) : undefined} className="text-[12px]" />
                </Part>
                <span className="text-right text-[12px] font-bold">{totals.basic ? fmtMoney(totals.grand) : ""}</span>
              </div>
            </div>
          </div>

          {spec.rupees.enabled && !rupeesInFooter && <div className={`border-t ${border}`}>{rupeesNode}</div>}

          {signSpread ? (
            <div className={`grid grid-cols-3 items-end border-t ${border} px-2 py-1`} style={{ minHeight: "14mm" }}>
              <Part zone="signature" id="eoe" block align="left" className="self-start">
                <Label mode={mode} text={spec.signature.eoe} strong={false} onChange={setSpec ? (t) => setSpec("signature", { eoe: t }) : undefined} />
              </Part>
              <Part zone="signature" id="for_line" block align="center" className="self-start font-bold">
                {forLineNode}
              </Part>
              <Part zone="signature" id="signatory" block align="right">
                <Label mode={mode} text={spec.signature.signatoryLabel} strong={false} onChange={setSpec ? (t) => setSpec("signature", { signatoryLabel: t }) : undefined} />
              </Part>
            </div>
          ) : (
          <div className={`grid border-t ${border}`} style={{ gridTemplateColumns: `${footW}% ${100 - footW}%` }}>
            <div className={`min-w-0 border-r ${border} px-2 py-1 text-[10px] leading-[1.35]`}>
              {spec.terms.enabled && (
                <Block zone="terms" id="terms" active={!!isActive("terms")}>
                  <Part zone="terms" id="terms" block>
                    <Label mode={mode} text={spec.terms.heading} placeholder="Terms & Conditions" onChange={setSpec ? (t) => setSpec("terms", { heading: t }) : undefined} />
                  </Part>
                  <ol className="mt-0.5 list-none space-y-[1px] p-0">
                    {spec.terms.lines.map((line, i) => (
                      <li key={i} className="flex items-baseline gap-1">
                        <span>{i + 1})</span>
                        {design ? (
                          <>
                            <input
                              value={line}
                              size={1}
                              onChange={(e) => setSpec?.("terms", { lines: spec.terms.lines.map((l, j) => (j === i ? e.target.value : l)) })}
                              className={seamless}
                              style={{ fontFamily: "inherit", fontSize: "inherit" }}
                            />
                            {isActive("terms") && (
                              <button
                                type="button"
                                title="Remove this line"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSpec?.("terms", { lines: spec.terms.lines.filter((_, j) => j !== i) });
                                }}
                                className="shrink-0 px-1 font-bold text-rose-600 print:hidden"
                              >
                                ×
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="min-w-0 break-words">{line}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                  {design && isActive("terms") && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSpec?.("terms", { lines: [...spec.terms.lines, "New condition"] });
                      }}
                      className="mt-0.5 rounded border border-dashed border-sky-400 px-1.5 py-[1px] text-[9px] font-semibold text-sky-700 print:hidden"
                    >
                      + Add line
                    </button>
                  )}
                </Block>
              )}
            </div>
            <div className="flex min-w-0 flex-col px-2 py-1 text-right" style={{ minHeight: "22mm" }}>
              <Part zone="signature" id="eoe" block align="right">
                <Label mode={mode} text={spec.signature.eoe} strong={false} onChange={setSpec ? (t) => setSpec("signature", { eoe: t }) : undefined} />
              </Part>
              <Part zone="signature" id="for_line" block align="right" className="mt-0.5 font-bold">
                {forLineNode}
              </Part>
              <div className="mt-auto">
                <Part zone="signature" id="signatory" block align="right">
                  <Label mode={mode} text={spec.signature.signatoryLabel} strong={false} onChange={setSpec ? (t) => setSpec("signature", { signatoryLabel: t }) : undefined} />
                </Part>
              </div>
            </div>
          </div>
          )}
        </div>
        {logoOn && placement === "free" && <LogoImage free defaultMaxHmm={16} />}
        {(spec.freeBoxes || [])
          .filter((b) => b.enabled)
          .map((b) => (
            <FreeBoxLayer
              key={b.id}
              box={b}
              design={design}
              selected={!!isActive("freeBox", b.id)}
              onPick={() => pick({ zone: "freeBox", id: b.id })}
              onChange={(patch) => patchSpec({ freeBoxes: (spec.freeBoxes || []).map((x) => (x.id === b.id ? { ...x, ...patch } : x)) })}
              mode={mode}
              value={
                b.valueKey
                  ? Object.prototype.hasOwnProperty.call(values, b.valueKey)
                    ? values[b.valueKey] ?? ""
                    : mode === "fill"
                      ? b.defaultValue ?? ""
                      : ""
                  : ""
              }
              onValue={b.valueKey && setValue ? (t) => setValue(b.valueKey!, t) : undefined}
              autoFocus={design && focusId === b.id}
            />
          ))}
        {design && placing && (
          <div
            className="absolute inset-0 z-40 cursor-crosshair print:hidden"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onPlace?.(
                clamp(Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, 0, 92),
                clamp(Math.round(((e.clientY - r.top) / r.height) * 1000) / 10, 0, 97)
              );
            }}
          >
            <div className="pointer-events-none sticky top-2 mx-auto mt-2 w-max rounded-full bg-slate-900/90 px-3 py-1 text-[11px] font-medium text-white shadow-lg">
              Click anywhere on the bill to place {placing === "field" ? "a label + answer" : "a text box"} · Esc to cancel
            </div>
          </div>
        )}
      </div>
    </DesignCtx.Provider>
  );
}
