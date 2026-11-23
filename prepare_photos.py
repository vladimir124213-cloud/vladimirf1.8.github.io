"""Готовит кадры Владимира для сайта: ресайз, кроп 4:5 для «обо мне», og-картинка."""

from pathlib import Path

from PIL import Image

SRC = Path(r"C:\Users\Vova\Downloads")
OUT = Path("images")

# файл в Downloads -> имя слота на сайте
FIELD_MAP = [
    ("8c2c8aeb-0ebe-45ed-a741-e8815a98158c.jpg", "photo-01.jpg", 1200),  # ч/б ночной портрет
    ("9aacbd50-bb93-4c8f-b576-11b9edfc3af1.jpg", "photo-02.jpg", 1200),  # ч/б девушка на улице
    ("bf21ab1e-5595-4ab0-ab35-a0bd73cb028e.jpg", "photo-03.jpg", 1000),  # у стеклянной стены
    ("c4515d8b-3dc9-49e3-9c9f-02e0875f5d8a.jpg", "photo-04.jpg", 1100),  # семья
    ("ddf31a8f-4d83-4759-8e46-a748f96c8b0b.jpg", "photo-05.jpg", 1200),  # худи, серая улица
    ("ffa6ba8b-76cd-49b1-8f75-3c5b9067b785.jpg", "photo-06.jpg", 853),   # корги
]

ABOUT_SRC = "8c2c8aeb-0ebe-45ed-a741-e8815a98158c.jpg"
OG_SRC = "9aacbd50-bb93-4c8f-b576-11b9edfc3af1.jpg"


def save(img: Image.Image, name: str, quality: int = 82) -> None:
    path = OUT / name
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    print(f"{name:22s} {img.size[0]}x{img.size[1]}  {path.stat().st_size // 1024} KB")


def fit_width(img: Image.Image, width: int) -> Image.Image:
    if img.width <= width:
        return img
    height = round(img.height * width / img.width)
    return img.resize((width, height), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)

    for src_name, out_name, width in FIELD_MAP:
        img = Image.open(SRC / src_name).convert("RGB")
        save(fit_width(img, width), out_name)

    # «обо мне» — вертикальный кроп 4:5 из ночного портрета
    about = Image.open(SRC / ABOUT_SRC).convert("RGB")
    target_w = about.width
    target_h = round(target_w * 5 / 4)
    y0 = max(0, round((about.height - target_h) * 0.45))
    about = about.crop((0, y0, target_w, y0 + target_h))
    save(fit_width(about, 1000), "about-portrait.jpg", quality=84)

    # превью для мессенджеров 1200x630
    og = Image.open(SRC / OG_SRC).convert("RGB")
    w, h = 1200, 630
    x0 = max(0, (og.width - w) // 2)
    y0 = int(og.height * 0.27) - h // 2
    y0 = max(0, min(og.height - h, y0))
    og = og.crop((x0, y0, x0 + w, y0 + h))
    save(og, "og-image.jpg", quality=86)


if __name__ == "__main__":
    main()
