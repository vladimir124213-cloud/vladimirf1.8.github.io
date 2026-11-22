/* ==========================================================================
   Анна Соколова — фотограф
   Небольшой скрипт: шапка при скролле, мобильное меню, мягкое появление
   блоков, активный пункт навигации и просмотр фотографий (лайтбокс).
   Всё написано без зависимостей — сайт открывается двойным кликом.
   ========================================================================== */

document.documentElement.classList.add("js");

(function () {
  "use strict";

  var header = document.getElementById("header");
  var burger = document.getElementById("burger");
  var nav = document.getElementById("nav");
  var gallery = document.getElementById("gallery");
  var lightbox = document.getElementById("lightbox");
  var lbImage = document.getElementById("lb-image");
  var lbCaption = document.getElementById("lb-caption");
  var lbClose = lightbox ? lightbox.querySelector(".lb-close") : null;
  var lbPrev = lightbox ? lightbox.querySelector(".lb-prev") : null;
  var lbNext = lightbox ? lightbox.querySelector(".lb-next") : null;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Текущий год в подвале ---------- */
  var year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  /* ---------- Шапка: фон и тень после прокрутки ---------- */
  function updateHeader() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  }

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  /* ---------- Мобильное меню ---------- */
  function setMenu(open) {
    if (!burger || !nav) return;
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    nav.classList.toggle("is-open", open);
    if (header) header.classList.toggle("menu-open", open);
    document.body.classList.toggle("is-locked", open);
  }

  if (burger && nav) {
    burger.addEventListener("click", function () {
      setMenu(burger.getAttribute("aria-expanded") !== "true");
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        setMenu(false);
        burger.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) setMenu(false);
    });
  }

  /* ---------- Активный пункт навигации ---------- */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav a[href^="#"]')
  );
  var sections = navLinks
    .map(function (link) {
      return document.querySelector(link.getAttribute("href"));
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var navObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          navLinks.forEach(function (link) {
            link.classList.toggle(
              "is-active",
              link.getAttribute("href") === "#" + entry.target.id
            );
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach(function (section) {
      navObserver.observe(section);
    });
  }

  /* ---------- Появление блоков при скролле ---------- */
  var revealItems = Array.prototype.slice.call(document.querySelectorAll(".reveal"));

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach(function (item) {
      item.classList.add("is-visible");
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 }
    );

    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  }

  /* ---------- Лайтбокс ---------- */
  if (!lightbox || !gallery) return;

  var triggers = Array.prototype.slice.call(gallery.querySelectorAll(".work-btn"));
  var current = 0;
  var lastFocused = null;

  function render(index) {
    if (!triggers.length) return;
    current = (index + triggers.length) % triggers.length;
    var trigger = triggers[current];
    var img = trigger.querySelector("img");
    var full = trigger.getAttribute("data-full") || (img ? img.src : "");
    var caption = trigger.getAttribute("data-caption") || (img ? img.alt : "");

    lbImage.src = full;
    lbImage.alt = img ? img.alt : caption;
    lbCaption.textContent = caption;
  }

  function openLightbox(index, trigger) {
    lastFocused = trigger || document.activeElement;
    render(index);
    lightbox.hidden = false;
    document.body.classList.add("is-locked");
    if (lbClose) lbClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove("is-locked");
    lbImage.removeAttribute("src");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  triggers.forEach(function (trigger, index) {
    trigger.addEventListener("click", function () {
      openLightbox(index, trigger);
    });
  });

  if (lbClose) lbClose.addEventListener("click", closeLightbox);
  if (lbPrev)
    lbPrev.addEventListener("click", function () {
      render(current - 1);
    });
  if (lbNext)
    lbNext.addEventListener("click", function () {
      render(current + 1);
    });

  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", function (event) {
    if (lightbox.hidden) return;

    if (event.key === "Escape") {
      closeLightbox();
    } else if (event.key === "ArrowRight") {
      render(current + 1);
    } else if (event.key === "ArrowLeft") {
      render(current - 1);
    } else if (event.key === "Tab") {
      // держим фокус внутри окна просмотра
      var focusable = [lbClose, lbPrev, lbNext].filter(Boolean);
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  /* ---------- Свайпы на телефоне ---------- */
  var touchStartX = 0;
  var touchStartY = 0;

  lightbox.addEventListener(
    "touchstart",
    function (event) {
      touchStartX = event.changedTouches[0].clientX;
      touchStartY = event.changedTouches[0].clientY;
    },
    { passive: true }
  );

  lightbox.addEventListener(
    "touchend",
    function (event) {
      var dx = event.changedTouches[0].clientX - touchStartX;
      var dy = event.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      render(dx < 0 ? current + 1 : current - 1);
    },
    { passive: true }
  );
})();
