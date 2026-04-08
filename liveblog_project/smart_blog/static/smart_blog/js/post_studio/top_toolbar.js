/**
 * CKEditor-style top toolbar for Post Studio (Editor.js playground).
 */
function getInsertIndex(editor) {
  const idx = editor.blocks.getCurrentBlockIndex();
  if (typeof idx !== "number" || idx < 0) {
    return editor.blocks.getBlocksCount();
  }
  return idx + 1;
}

function listPayload(style) {
  const item = { content: "", items: [], meta: {} };
  if (style === "checklist") {
    item.meta = { checked: false };
  }
  return {
    style,
    meta: {},
    items: [item],
  };
}

function wrapSelection(holder, tagName, className) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    return;
  }
  const range = sel.getRangeAt(0);
  let n = range.commonAncestorContainer;
  if (n.nodeType === Node.TEXT_NODE) {
    n = n.parentElement;
  }
  if (!n || !holder.contains(n)) {
    return;
  }
  const el = document.createElement(tagName);
  if (className) {
    el.className = className;
  }
  try {
    el.appendChild(range.extractContents());
    range.insertNode(el);
    sel.removeAllRanges();
    const nr = document.createRange();
    nr.selectNodeContents(el);
    nr.collapse(false);
    sel.addRange(nr);
  } catch (e) {
    console.warn("wrapSelection", e);
  }
}

function promptLinkAndApply() {
  const url = window.prompt("URL");
  if (url == null || !String(url).trim()) {
    return;
  }
  document.execCommand("createLink", false, String(url).trim());
}

function syncFormatButtons(toolbarRoot) {
  const tryQ = (cmd) => {
    try {
      return document.queryCommandState(cmd);
    } catch {
      return false;
    }
  };
  const bold = toolbarRoot.querySelector('[data-ps-cmd="bold"]');
  const italic = toolbarRoot.querySelector('[data-ps-cmd="italic"]');
  const underline = toolbarRoot.querySelector('[data-ps-cmd="underline"]');
  if (bold) {
    bold.classList.toggle("is-active", tryQ("bold"));
  }
  if (italic) {
    italic.classList.toggle("is-active", tryQ("italic"));
  }
  if (underline) {
    underline.classList.toggle("is-active", tryQ("underline"));
  }
}

function syncUndoRedo(toolbarRoot, undo) {
  if (!undo) {
    return;
  }
  const u = toolbarRoot.querySelector('[data-ps-action="undo"]');
  const r = toolbarRoot.querySelector('[data-ps-action="redo"]');
  if (u) {
    u.disabled = !undo.canUndo();
  }
  if (r) {
    r.disabled = !undo.canRedo();
  }
}

async function insertHeader(editor, level) {
  const idx = editor.blocks.getCurrentBlockIndex();
  const block = idx >= 0 ? editor.blocks.getBlockByIndex(idx) : null;
  if (block?.id) {
    try {
      await editor.blocks.convert(block.id, "header", { level });
      return;
    } catch {
      /* fallback: insert */
    }
  }
  editor.blocks.insert("header", { text: "", level }, {}, getInsertIndex(editor), true);
}

/**
 * @param {object} opts
 * @param {*} opts.editor - Editor.js instance
 * @param {{ undo: Function, redo: Function, canUndo: Function, canRedo: Function } | null} opts.undo
 * @param {HTMLElement} opts.holder
 * @param {HTMLElement} opts.toolbarRoot
 * @param {(file: File) => Promise<{ success: number; file?: { url: string } }>} opts.uploadByFile
 */
export function initPostStudioTopToolbar({ editor, undo, holder, toolbarRoot, uploadByFile }) {
  if (!toolbarRoot || !editor || !holder) {
    return;
  }

  const refreshChrome = () => {
    syncUndoRedo(toolbarRoot, undo);
    syncFormatButtons(toolbarRoot);
  };

  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    const n = sel?.focusNode;
    if (n && holder.contains(n.nodeType === Node.TEXT_NODE ? n.parentElement : n)) {
      syncFormatButtons(toolbarRoot);
    }
  });

  /** Keep text selection when pressing toolbar buttons (same pattern as classic RTE toolbars). */
  toolbarRoot.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) {
      return;
    }
    if (ev.target.closest("button,a[role=button]")) {
      ev.preventDefault();
    }
  });

  toolbarRoot.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-ps-action],[data-ps-cmd],[data-ps-block],[data-ps-header]");
    if (!btn || !toolbarRoot.contains(btn)) {
      return;
    }
    ev.preventDefault();

    const action = btn.getAttribute("data-ps-action");
    const cmd = btn.getAttribute("data-ps-cmd");
    const block = btn.getAttribute("data-ps-block");
    const headerLv = btn.getAttribute("data-ps-header");

    if (action === "undo" && undo?.canUndo?.()) {
      undo.undo();
      refreshChrome();
      return;
    }
    if (action === "redo" && undo?.canRedo?.()) {
      undo.redo();
      refreshChrome();
      return;
    }

    if (cmd === "bold") {
      document.execCommand("bold");
      refreshChrome();
      return;
    }
    if (cmd === "italic") {
      document.execCommand("italic");
      refreshChrome();
      return;
    }
    if (cmd === "underline") {
      document.execCommand("underline");
      refreshChrome();
      return;
    }
    if (cmd === "link") {
      holder.focus();
      promptLinkAndApply();
      return;
    }
    if (cmd === "unlink") {
      document.execCommand("unlink");
      return;
    }
    if (cmd === "marker") {
      wrapSelection(holder, "mark", "cdx-marker");
      return;
    }
    if (cmd === "inlineCode") {
      wrapSelection(holder, "code", "inline-code");
      return;
    }

    const idx = getInsertIndex(editor);

    if (headerLv) {
      const level = parseInt(headerLv, 10) || 2;
      insertHeader(editor, level).then(refreshChrome).catch(() => {});
      return;
    }

    if (block === "list-unordered") {
      editor.blocks.insert("list", listPayload("unordered"), {}, idx, true);
      return;
    }
    if (block === "list-ordered") {
      editor.blocks.insert("list", listPayload("ordered"), {}, idx, true);
      return;
    }
    if (block === "list-checklist") {
      editor.blocks.insert("list", listPayload("checklist"), {}, idx, true);
      return;
    }
    if (block === "quote") {
      editor.blocks.insert("quote", { text: "", caption: "" }, {}, idx, true);
      return;
    }
    if (block === "warning") {
      editor.blocks.insert("warning", { title: "", message: "" }, {}, idx, true);
      return;
    }
    if (block === "delimiter") {
      editor.blocks.insert("delimiter", {}, {}, idx, true);
      return;
    }
    if (block === "image-pick") {
      const input = toolbarRoot.querySelector('input[data-ps-image-input="1"]');
      input?.click();
    }
  });

  const fileInput = toolbarRoot.querySelector('input[data-ps-image-input="1"]');
  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files?.[0];
      fileInput.value = "";
      if (!f || !uploadByFile) {
        return;
      }
      try {
        const uploaded = await uploadByFile(f);
        const url = uploaded?.file?.url;
        if (!url) {
          return;
        }
        const idx = getInsertIndex(editor);
        editor.blocks.insert("image", { file: { url }, caption: "" }, {}, idx, true);
      } catch (e) {
        console.error(e);
      }
    });
  }

  refreshChrome();
  return refreshChrome;
}
