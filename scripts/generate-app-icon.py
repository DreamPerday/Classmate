from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "apps" / "desktop" / "build"
SIZE = 1024


def build_icon() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((32, 32, 992, 992), radius=184, fill="#285f4e")
    draw.rounded_rectangle((51, 51, 973, 973), radius=165, outline="#397661", width=18)
    draw.polygon(((512, 248), (824, 396), (512, 544), (200, 396)), fill="#f8faf7")
    draw.polygon(((302, 472), (484, 558), (512, 566), (540, 558), (722, 472), (722, 623), (700, 681), (640, 728), (568, 752), (456, 752), (384, 728), (324, 681), (302, 623)), fill="#f8faf7")
    draw.line(((824, 396), (824, 609)), fill="#f8faf7", width=30)
    draw.ellipse((782, 619, 866, 703), fill="#d39a43")
    return image


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    image = build_icon()
    image.save(BUILD / "icon.png")
    image.save(BUILD / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


if __name__ == "__main__":
    main()
