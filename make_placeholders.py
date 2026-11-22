"""Генератор placeholder-фотографий для сайта.

Создаёт мягкие «световые» абстракции в тёплой нейтральной палитре с плёночным
зерном. Каждое изображение подписано номером слота — чтобы потом было понятно,
какой файл на что заменить.

Запуск:  python tools/make_placeholders.py
"""

from __future__ import annotations

import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "images")

IVORY = (247, 244, 238)
SAND = (206, 186, 162)
WARM_GREY = (176, 168, 158)
SAGE = (150, 163, 141)
DUST = (146, 163, 178)
BLUSH = (198, 168, 158)
CLAY = (168, 128, 102)
INK = (58, 52, 46)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\calibri.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def linear_gradient(w: int, h: int, top: tuple, bottom: tuple, tilt: float = 0.3) -> np.ndarray:
    """Диагональный градиент между двумя цветами."""
    xs = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :, None]
    ys = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    t = np.clip((1.0 - tilt) * ys + tilt * xs, 0.0, 1.0)
    top_arr = np.array(top, dtype=np.float32)[None, None, :]
    bottom_arr = np.array(bottom, dtype=np.float32)[None, None, :]
    return top_arr * (1.0 - t) + bottom_arr * t


def shapes(w: int, h: int, palette: list, rng: random.Random) -> tuple[Image.Image, Image.Image]:
    """Возвращает (слой света, слой тени) — оба на чёрном фоне.

    Композиция как у расфокусированного кадра: крупные световые пятна,
    полоса света от окна и мягкая тёмная масса «объекта».
    """
    unit = max(w, h)

    lights = Image.new("RGB", (w, h), (0, 0, 0))
    ld = ImageDraw.Draw(lights, "RGBA")
    for _ in range(rng.randint(3, 5)):
        cx = rng.uniform(-0.05, 1.05) * w
        cy = rng.uniform(-0.1, 1.0) * h
        rx = rng.uniform(0.18, 0.45) * w
        ry = rng.uniform(0.18, 0.45) * h
        tint = rng.choice([IVORY, IVORY, palette[0], palette[1], palette[3]])
        ld.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=tint + (rng.randint(170, 235),))

    # полоса света — намёк на окно или отражение
    if rng.random() < 0.85:
        bx = rng.uniform(0.02, 0.8) * w
        bw = rng.uniform(0.1, 0.26) * w
        skew = rng.uniform(-0.18, 0.18) * w
        ld.polygon(
            [
                (bx, -10),
                (bx + bw, -10),
                (bx + bw + skew, h + 10),
                (bx + skew, h + 10),
            ],
            fill=IVORY + (rng.randint(110, 175),),
        )

    # мелкие блики-боке
    for _ in range(rng.randint(3, 6)):
        r = rng.uniform(0.02, 0.07) * unit
        cx = rng.uniform(0.0, 1.0) * w
        cy = rng.uniform(0.0, 1.0) * h
        ld.ellipse([cx - r, cy - r, cx + r, cy + r], fill=IVORY + (rng.randint(120, 200),))

    lights = lights.filter(ImageFilter.GaussianBlur(radius=unit / 34))

    shadows = Image.new("RGB", (w, h), (0, 0, 0))
    sd = ImageDraw.Draw(shadows, "RGBA")
    for _ in range(rng.randint(2, 3)):
        cx = rng.uniform(-0.1, 1.1) * w
        cy = rng.uniform(0.15, 1.15) * h
        rx = rng.uniform(0.18, 0.42) * w
        ry = rng.uniform(0.18, 0.42) * h
        sd.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=INK + (rng.randint(80, 130),))
    shadows = shadows.filter(ImageFilter.GaussianBlur(radius=unit / 22))
    return lights, shadows


def screen(base: np.ndarray, layer: np.ndarray, amount: float) -> np.ndarray:
    lit = 255.0 - (255.0 - base) * (255.0 - layer) / 255.0
    return base + (lit - base) * amount


def multiply(base: np.ndarray, shade: np.ndarray, amount: float) -> np.ndarray:
    # shade на чёрном фоне: 0 = без изменений, чем светлее, тем сильнее затемнение
    norm = shade / 255.0
    darkened = base * (1.0 - 0.55 * norm)
    return base + (darkened - base) * amount


def vignette(arr: np.ndarray, strength: float = 0.22) -> np.ndarray:
    h, w = arr.shape[:2]
    ys = np.linspace(-1.0, 1.0, h, dtype=np.float32)[:, None]
    xs = np.linspace(-1.0, 1.0, w, dtype=np.float32)[None, :]
    r = np.sqrt(xs**2 + ys**2) / np.sqrt(2.0)
    mask = 1.0 - strength * np.clip(r - 0.3, 0.0, None) ** 1.5
    return arr * mask[:, :, None]


def grain(arr: np.ndarray, rng: np.random.Generator, amount: float = 3.4) -> np.ndarray:
    noise = rng.normal(0.0, amount, arr.shape[:2])[:, :, None]
    return arr + noise


def add_label(img: Image.Image, text: str) -> Image.Image:
    """Едва заметная подпись-подсказка в левом нижнем углу."""
    scale = img.width / 1000.0
    pad = int(26 * scale)
    font = load_font(max(13, int(16 * scale)))
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.text((pad, img.height - pad - int(18 * scale)), text, font=font, fill=(26, 24, 22, 88))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


SPECS = [
    # работы в галерее: высокий + невысокий кадр в каждой колонке,
    # поэтому 6 штук выстраиваются тремя ровными колонками
    ("photo-01.jpg", 1200, 1600, [SAND, WARM_GREY, IVORY, CLAY], "01 / портрет"),
    ("photo-02.jpg", 1600, 1067, [SAGE, IVORY, WARM_GREY, SAND], "02 / свет"),
    ("photo-03.jpg", 1200, 1500, [DUST, IVORY, WARM_GREY, SAGE], "03 / портрет"),
    ("photo-04.jpg", 1600, 1000, [SAND, WARM_GREY, IVORY, CLAY], "04 / история"),
    ("photo-05.jpg", 1000, 1400, [IVORY, BLUSH, SAND, WARM_GREY], "05 / пара"),
    ("photo-06.jpg", 1600, 1067, [SAGE, DUST, IVORY, WARM_GREY], "06 / природа"),
    ("about-portrait.jpg", 1000, 1250, [WARM_GREY, IVORY, SAND, SAGE], "обо мне"),
    ("og-image.jpg", 1200, 630, [IVORY, SAND, WARM_GREY, CLAY], "photography"),
]


def build(name: str, w: int, h: int, palette: list, label: str) -> None:
    rng_py = random.Random(name)
    rng_np = np.random.default_rng(abs(hash(name)) % (2**32))

    base = linear_gradient(w, h, palette[0], palette[2])
    lights, shadows = shapes(w, h, palette, rng_py)

    arr = np.asarray(Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)), dtype=np.float32)
    arr = screen(arr, np.asarray(lights, dtype=np.float32), 0.92)
    arr = multiply(arr, np.asarray(shadows, dtype=np.float32), 0.85)
    arr = grain(arr, rng_np)
    arr = vignette(arr, 0.2)
    # «дыхание» плёнки: лёгкий сдвиг цветового баланса
    arr[:, :, 0] *= 1.014
    arr[:, :, 2] *= 0.984

    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(0.3))
    img = add_label(img, label)

    path = os.path.join(OUT_DIR, name)
    img.save(path, "JPEG", quality=86, optimize=True, progressive=True)
    print(f"{name:20s} {w}x{h}  {os.path.getsize(path) // 1024} KB")


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for spec in SPECS:
        build(*spec)


if __name__ == "__main__":
    main()
