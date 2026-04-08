/**
 * Source for Editor.js playground. Build with:
 *   npm run build:editor-playground
 * Output: editor_playground.bundle.js (commit or rebuild in deploy).
 */
import EditorJS from "@editorjs/editorjs";
import Header from "@editorjs/header";
import List from "@editorjs/list";
import Quote from "@editorjs/quote";
import Delimiter from "@editorjs/delimiter";
import Image from "@editorjs/image";
import Warning from "@editorjs/warning";
import Link from "@editorjs/link";
import Marker from "@editorjs/marker";
import InlineCode from "@editorjs/inline-code";
import { StrongInlineTool, ItalicInlineTool, UnderlineInlineTool } from "editorjs-inline-tool";
import Undo from "editorjs-undo";

import { initPostStudioTopToolbar } from "./top_toolbar.js";

/** Matches server-side `sanitize_editorjs_fragment` / bleach allowlist. */
const EDITOR_INLINE_SANITIZER = {
  b: {},
  strong: {},
  i: {},
  em: {},
  u: {},
  a: { href: true, target: true, rel: true, title: true },
  mark: { class: true },
  code: { class: true },
  span: { class: true },
  br: {},
};

function uploadByFileLocal(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("Not an image"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        success: 1,
        file: { url: reader.result },
      });
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

let _a11ySeq = 0;

function patchEditorInputs(scopeEl) {
  if (!scopeEl) {
    return;
  }
  scopeEl.querySelectorAll('input:not([type="hidden"])').forEach((input) => {
    if (input.getAttribute("name") && input.getAttribute("id")) {
      return;
    }
    _a11ySeq += 1;
    const base = `editorjs-playground-${_a11ySeq}`;
    if (!input.getAttribute("id")) {
      input.id = base;
    }
    if (!input.getAttribute("name")) {
      input.setAttribute("name", base);
    }
  });
}

function setupA11yObserver(playgroundRoot) {
  if (!playgroundRoot) {
    return;
  }
  patchEditorInputs(playgroundRoot);
  const obs = new MutationObserver(() => {
    patchEditorInputs(playgroundRoot);
  });
  obs.observe(playgroundRoot, { childList: true, subtree: true });
}

function getEditorScrollRoot(editorHolder) {
  return editorHolder?.closest(".editor-playground__canvas")?.querySelector(".editor-playground__scroll") || null;
}

function isVerticallyScrollable(el) {
  if (!el) {
    return false;
  }
  const oy = window.getComputedStyle(el).overflowY;
  if (!/(auto|scroll|overlay)/.test(oy)) {
    return false;
  }
  return el.scrollHeight > el.clientHeight + 1;
}

/**
 * Keep caret in view: inner scroll (.editor-playground__scroll) when it scrolls,
 * otherwise window / visualViewport (similar to typing in a growing CKEditor area).
 */
function scrollCaretIntoEditorColumn(editorHolder) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return;
  }
  let node = sel.focusNode;
  if (!node) {
    return;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }
  if (!node || !editorHolder.contains(node)) {
    return;
  }
  const range = sel.getRangeAt(0);
  let rect = range.getBoundingClientRect();
  if ((rect.width === 0 && rect.height === 0) || (range.collapsed && rect.height === 0)) {
    const rects = range.getClientRects();
    if (rects.length) {
      rect = rects[0];
    } else {
      return;
    }
  }
  const margin = 24;
  const scrollRoot = getEditorScrollRoot(editorHolder);
  if (scrollRoot && isVerticallyScrollable(scrollRoot)) {
    const rootRect = scrollRoot.getBoundingClientRect();
    if (rect.bottom > rootRect.bottom - margin) {
      scrollRoot.scrollTop += rect.bottom - rootRect.bottom + margin;
    } else if (rect.top < rootRect.top + margin) {
      scrollRoot.scrollTop += rect.top - rootRect.top - margin;
    }
    return;
  }
  const vh = window.visualViewport?.height ?? window.innerHeight;
  if (rect.bottom > vh - margin) {
    window.scrollBy(0, rect.bottom - vh + margin);
  } else if (rect.top < margin) {
    window.scrollBy(0, rect.top - margin);
  }
}

function init() {
  const holder = document.getElementById("editorjs");
  const statusEl = document.getElementById("editor-playground-status");
  const playground = document.querySelector(".editor-playground");
  const toolbarRoot = document.getElementById("editor-playground-top-toolbar");

  if (!holder) {
    return;
  }

  let saveTimer = null;

  const editor = new EditorJS({
    holder,
    /** Suppress "Block skipped because saved data is invalid" and hook deprecation noise; empty blocks are expected while editing. */
    logLevel: "ERROR",
    minHeight: 0,
    placeholder: "Start writing…",
    sanitizer: EDITOR_INLINE_SANITIZER,
    inlineToolbar: ["bold", "italic", "underline", "link", "marker", "inlineCode"],
    tools: {
      header: {
        class: Header,
        config: { placeholder: "Heading", levels: [2, 3, 4], defaultLevel: 2 },
      },
      list: { class: List, inlineToolbar: true },
      quote: {
        class: Quote,
        inlineToolbar: true,
        config: { quotePlaceholder: "Quote", captionPlaceholder: "Caption" },
      },
      delimiter: Delimiter,
      warning: {
        class: Warning,
        inlineToolbar: true,
        config: { titlePlaceholder: "Title", messagePlaceholder: "Message" },
      },
      image: {
        class: Image,
        config: {
          uploader: { uploadByFile: uploadByFileLocal },
          captionPlaceholder: "Caption",
        },
      },
      bold: StrongInlineTool,
      italic: ItalicInlineTool,
      underline: UnderlineInlineTool,
      link: {
        class: Link,
        config: { endpoint: "" },
      },
      marker: Marker,
      inlineCode: InlineCode,
    },
    onChange: () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
      saveTimer = setTimeout(async () => {
        if (statusEl) {
          statusEl.textContent = "Updating…";
        }
        try {
          await editor.save();
          if (statusEl) {
            statusEl.textContent = "Live";
          }
        } catch (e) {
          if (statusEl) {
            statusEl.textContent = "Sync failed";
          }
          console.error(e);
        }
      }, 700);
    },
  });

  function bindCaretScroll() {
    let caretScrollQueued = false;
    const queueCaretScroll = () => {
      if (caretScrollQueued) {
        return;
      }
      caretScrollQueued = true;
      requestAnimationFrame(() => {
        caretScrollQueued = false;
        scrollCaretIntoEditorColumn(holder);
      });
    };
    const scrollKeys = new Set([
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Enter",
      " ",
      "Backspace",
      "Delete",
    ]);
    holder.addEventListener(
      "keydown",
      (e) => {
        if (scrollKeys.has(e.key) || (e.key.length === 1 && !e.ctrlKey && !e.metaKey)) {
          queueCaretScroll();
        }
      },
      true
    );
    holder.addEventListener("input", queueCaretScroll, true);
    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      const n = sel?.focusNode;
      if (!n || !holder.contains(n)) {
        return;
      }
      queueCaretScroll();
    });
    window.visualViewport?.addEventListener("resize", queueCaretScroll);
  }

  editor.isReady
    .then(async () => {
      let toolbarRefresh = () => {};
      let undo = null;
      try {
        undo = new Undo({
          editor,
          onUpdate: () => toolbarRefresh(),
        });
      } catch (e) {
        console.error("editorjs-undo failed to init", e);
      }
      if (toolbarRoot) {
        toolbarRefresh =
          initPostStudioTopToolbar({
            editor,
            undo,
            holder,
            toolbarRoot,
            uploadByFile: uploadByFileLocal,
          }) || (() => {});
      }
      setupA11yObserver(playground);
      bindCaretScroll();
      try {
        await editor.save();
        if (statusEl) {
          statusEl.textContent = "Live";
        }
      } catch (e) {
        console.error(e);
      }
      toolbarRefresh();
    })
    .catch((e) => console.error(e));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
