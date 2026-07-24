/* Scouted — local wishlist.
   Stored in the visitor's own browser (localStorage). No account, no server.
   Games are keyed by their exact title as it appears in the release list. */
(function () {
  "use strict";

  var KEY = "scouted:wishlist";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m];
    });
  }

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch (e) { return []; }          // private mode / storage disabled
  }

  function write(list) {
    try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    document.dispatchEvent(new CustomEvent("wishlist:change", { detail: { list: list } }));
  }

  var Wishlist = {
    all:   read,
    count: function () { return read().length; },
    has:   function (title) { return read().indexOf(String(title)) !== -1; },

    toggle: function (title) {
      var t = String(title), list = read(), i = list.indexOf(t);
      if (i === -1) list.push(t); else list.splice(i, 1);
      write(list);
      return i === -1;                  // true = now wishlisted
    },

    remove: function (title) {
      var list = read(), i = list.indexOf(String(title));
      if (i !== -1) { list.splice(i, 1); write(list); }
    },

    clear: function () { write([]); },

    /* Heart markup to drop into a card's art container (which must be positioned). */
    button: function (title) {
      var on = Wishlist.has(title);
      var label = on ? "Remove from wishlist" : "Add to wishlist";
      return '<span class="wish-btn' + (on ? " on" : "") + '" role="button" tabindex="0"' +
             ' data-wish="' + esc(title) + '"' +
             ' aria-pressed="' + (on ? "true" : "false") + '"' +
             ' aria-label="' + label + '" title="' + label + '">' +
             '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
             '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78' +
             'l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span>';
    }
  };

  /* Repaint every heart on the page from storage. */
  function syncButtons() {
    var list = read();
    var nodes = document.querySelectorAll(".wish-btn");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var on = list.indexOf(el.getAttribute("data-wish")) !== -1;
      el.classList.toggle("on", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
      var label = on ? "Remove from wishlist" : "Add to wishlist";
      el.setAttribute("aria-label", label);
      el.setAttribute("title", label);
    }
  }

  /* Nav count badge: any element with [data-wish-count]. */
  function syncNav() {
    var n = read().length;
    var nodes = document.querySelectorAll("[data-wish-count]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = n ? String(n) : "";
      nodes[i].style.display = n ? "" : "none";
    }
  }

  function closestWish(node) {
    while (node && node !== document) {
      if (node.classList && node.classList.contains("wish-btn")) return node;
      node = node.parentNode;
    }
    return null;
  }

  /* Cards are links, so a heart click must not follow the card. */
  document.addEventListener("click", function (e) {
    var btn = closestWish(e.target);
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    Wishlist.toggle(btn.getAttribute("data-wish"));
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    var btn = closestWish(e.target);
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    Wishlist.toggle(btn.getAttribute("data-wish"));
  });

  document.addEventListener("wishlist:change", function () { syncButtons(); syncNav(); });
  window.addEventListener("storage", function (e) {   // another tab changed it
    if (e.key === KEY) { syncButtons(); syncNav(); }
  });
  document.addEventListener("DOMContentLoaded", function () { syncButtons(); syncNav(); });

  Wishlist.sync = function () { syncButtons(); syncNav(); };
  window.Wishlist = Wishlist;
})();
