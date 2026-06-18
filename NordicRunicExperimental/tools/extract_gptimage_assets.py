from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "gptimage"
OUT_DIR = ROOT / "assets" / "generated-candidates" / "gptimage-crops"
CONTACT_SHEET = OUT_DIR / "contact-sheet.png"
MANIFEST_PATH = OUT_DIR / "manifest.json"


@dataclass(frozen=True)
class CropSpec:
    source: str
    name: str
    category: str
    x: int
    y: int
    width: int
    height: int
    notes: str


# First pass deliberately extracts logical UI groups rather than every tiny
# glyph. These are easier to review and safer to promote into the app while the
# generated atlases are still hand-curated.
CROPS: tuple[CropSpec, ...] = (
    CropSpec("assetpack.png", "core_left_navigation_rail", "navigation", 27, 126, 210, 605, "Full vertical navigation rail treatment."),
    CropSpec("assetpack.png", "core_title_treatment", "header", 242, 145, 405, 92, "Large title/header ornament treatment."),
    CropSpec("assetpack.png", "core_top_micro_bar", "header", 242, 253, 405, 75, "Compact status/header micro bar."),
    CropSpec("assetpack.png", "core_large_content_panel", "panels", 660, 142, 442, 198, "Large framed content panel."),
    CropSpec("assetpack.png", "core_medium_card", "panels", 660, 376, 246, 104, "Medium framed card."),
    CropSpec("assetpack.png", "core_small_card", "panels", 912, 376, 191, 104, "Small framed card."),
    CropSpec("assetpack.png", "core_modal_frame", "panels", 660, 520, 248, 102, "Modal/dialog frame crop."),
    CropSpec("assetpack.png", "core_compact_strip_frame", "panels", 913, 550, 190, 72, "Compact strip frame crop."),
    CropSpec("assetpack.png", "core_control_states", "controls", 241, 430, 408, 225, "Tabs, buttons, search, dropdown, checkbox, toggle states."),
    CropSpec("assetpack.png", "core_decorative_pieces", "ornaments", 654, 665, 438, 300, "Corner pieces, border segments, title plaques, separators."),
    CropSpec("assetpack.png", "core_line_mode_strip", "line-mode", 29, 948, 1071, 111, "Compact overlay line-mode strip concept."),
    CropSpec("assetpack.png", "core_settings_rows", "settings", 30, 1086, 622, 230, "Reusable settings row and input treatment."),
    CropSpec("assetpack.png", "core_status_dots_badges", "badges", 846, 1085, 257, 214, "Status dots and badge examples."),
    CropSpec("assetpack.png", "core_bottom_icon_row", "icons", 65, 1315, 998, 72, "Bottom icon row / compact navigation symbols."),
    CropSpec("assetpack3.png", "icons_main_nav_stack", "navigation", 31, 145, 220, 548, "Main navigation icons with labels."),
    CropSpec("assetpack3.png", "icons_utility_grid", "icons", 264, 168, 805, 190, "Utility icon button grid."),
    CropSpec("assetpack3.png", "icons_map_atlas_status_grid", "icons", 265, 408, 835, 210, "Map and atlas status icons."),
    CropSpec("assetpack3.png", "icons_profile_trade_market", "icons", 37, 688, 370, 225, "Profile, trade, and market icon examples."),
    CropSpec("assetpack3.png", "icons_element_hazard_grid", "icons", 435, 648, 360, 205, "Element and hazard icon set."),
    CropSpec("assetpack3.png", "icons_notification_badges", "badges", 812, 642, 300, 224, "Notification badges and state pills."),
    CropSpec("assetpack3.png", "icons_compact_widgets", "line-mode", 36, 918, 464, 280, "Compact widgets and market chip rows."),
    CropSpec("assetpack3.png", "icons_small_frame_assets", "ornaments", 511, 858, 580, 306, "Small frames, diamond frames, chip frames, and micro ornaments."),
    CropSpec("assetpack3.png", "icons_footer_decoratives", "ornaments", 39, 1210, 1050, 170, "Footer separators and micro corner/center pieces."),
    CropSpec("assetpack2.png", "extension_price_check", "feature-cards", 32, 141, 555, 340, "Price-check screen concept."),
    CropSpec("assetpack2.png", "extension_atlas_map_tracker", "feature-cards", 590, 141, 520, 340, "Atlas/map tracker concept."),
    CropSpec("assetpack2.png", "extension_market_board", "feature-cards", 32, 507, 515, 293, "Market board concept."),
    CropSpec("assetpack2.png", "extension_profile", "feature-cards", 555, 507, 562, 293, "Profile concept."),
    CropSpec("assetpack2.png", "extension_incursion_temple", "feature-cards", 32, 816, 640, 310, "Incursion/Atziri temple concept."),
    CropSpec("assetpack2.png", "extension_settings", "feature-cards", 682, 816, 436, 310, "Settings concept."),
    CropSpec("assetpack2.png", "extension_notifications_toasts", "notifications", 32, 1145, 190, 225, "Toast notification concept set."),
    CropSpec("assetpack2.png", "extension_modals_callouts", "panels", 226, 1145, 336, 225, "Modal, tooltip, popover, and empty-state concepts."),
    CropSpec("assetpack2.png", "extension_compact_overlay_variants", "line-mode", 570, 1145, 238, 225, "Compact overlay variants."),
    CropSpec("assetpack2.png", "extension_decorative_trims", "ornaments", 815, 1145, 300, 225, "Decorative trims and ornaments."),
    CropSpec("assetpack3.png", "micro_utility_search", "micro-icons", 264, 171, 58, 58, "Search utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_filter", "micro-icons", 354, 171, 58, 58, "Filter utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_sort_vertical", "micro-icons", 444, 171, 58, 58, "Sort/reorder utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_import_export", "micro-icons", 534, 171, 58, 58, "Import/export utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_document", "micro-icons", 624, 171, 58, 58, "Document utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_save", "micro-icons", 713, 171, 58, 58, "Save utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_pin", "micro-icons", 803, 171, 58, 58, "Pin utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_refresh", "micro-icons", 893, 171, 58, 58, "Refresh utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_close", "micro-icons", 982, 171, 58, 58, "Close utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_expand", "micro-icons", 264, 250, 58, 58, "Expand utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_check", "micro-icons", 354, 250, 58, 58, "Check utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_info", "micro-icons", 444, 250, 58, 58, "Info utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_warning", "micro-icons", 534, 250, 58, 58, "Warning utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_confirm", "micro-icons", 624, 250, 58, 58, "Confirm utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_cancel", "micro-icons", 713, 250, 58, 58, "Cancel utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_plus", "micro-icons", 803, 250, 58, 58, "Plus utility icon button."),
    CropSpec("assetpack3.png", "micro_utility_minus", "micro-icons", 893, 250, 58, 58, "Minus utility icon button."),
    CropSpec("assetpack3.png", "micro_status_waystone", "micro-icons", 270, 435, 58, 58, "Waystone status icon."),
    CropSpec("assetpack3.png", "micro_status_zone", "micro-icons", 356, 435, 58, 58, "Zone status icon."),
    CropSpec("assetpack3.png", "micro_status_timer", "micro-icons", 442, 435, 58, 58, "Timer status icon."),
    CropSpec("assetpack3.png", "micro_status_pack_size", "micro-icons", 528, 435, 58, 58, "Pack-size status icon."),
    CropSpec("assetpack3.png", "micro_status_rarity", "micro-icons", 614, 435, 58, 58, "Rarity status icon."),
    CropSpec("assetpack3.png", "micro_status_rare_chance", "micro-icons", 701, 435, 58, 58, "Rare chance status icon."),
    CropSpec("assetpack3.png", "micro_status_xp_gain", "micro-icons", 786, 435, 58, 58, "XP gain status icon."),
    CropSpec("assetpack3.png", "micro_status_mechanics", "micro-icons", 873, 435, 58, 58, "Mechanics status icon."),
    CropSpec("assetpack3.png", "micro_status_risk_red", "micro-icons", 959, 435, 58, 58, "Risk status icon."),
    CropSpec("assetpack3.png", "micro_status_death", "micro-icons", 1045, 435, 58, 58, "Death status icon."),
    CropSpec("assetpack3.png", "micro_status_progress", "micro-icons", 270, 527, 58, 58, "Map progress status icon."),
    CropSpec("assetpack3.png", "micro_status_ocr", "micro-icons", 356, 527, 58, 58, "OCR status icon."),
    CropSpec("assetpack3.png", "micro_status_hazard", "micro-icons", 442, 527, 58, 58, "Hazard status icon."),
    CropSpec("assetpack3.png", "micro_status_corruption", "micro-icons", 528, 527, 58, 58, "Corruption status icon."),
    CropSpec("assetpack3.png", "micro_status_shrine", "micro-icons", 614, 527, 58, 58, "Shrine status icon."),
    CropSpec("assetpack3.png", "micro_status_boss", "micro-icons", 700, 527, 58, 58, "Boss status icon."),
    CropSpec("assetpack3.png", "micro_status_chest", "micro-icons", 786, 527, 58, 58, "Chest status icon."),
    CropSpec("assetpack3.png", "micro_market_coin_stack", "micro-icons", 51, 703, 58, 58, "Coin stack market icon."),
    CropSpec("assetpack3.png", "micro_market_orb", "micro-icons", 136, 703, 58, 58, "Orb market icon."),
    CropSpec("assetpack3.png", "micro_market_board", "micro-icons", 221, 703, 58, 58, "Market board icon."),
    CropSpec("assetpack3.png", "micro_market_trend_up", "micro-icons", 306, 703, 58, 58, "Trend up market icon."),
    CropSpec("assetpack3.png", "micro_market_trend_down", "micro-icons", 51, 781, 58, 58, "Trend down market icon."),
    CropSpec("assetpack3.png", "micro_market_listing", "micro-icons", 136, 781, 58, 58, "Listing market icon."),
    CropSpec("assetpack3.png", "micro_market_inventory", "micro-icons", 221, 781, 58, 58, "Inventory market icon."),
    CropSpec("assetpack3.png", "micro_market_equipment", "micro-icons", 306, 781, 58, 58, "Equipment market icon."),
    CropSpec("assetpack3.png", "micro_hazard_fire", "micro-icons", 445, 673, 52, 52, "Fire hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_cold", "micro-icons", 515, 673, 52, 52, "Cold hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_lightning", "micro-icons", 584, 673, 52, 52, "Lightning hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_chaos", "micro-icons", 653, 673, 52, 52, "Chaos hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_bleed", "micro-icons", 722, 673, 52, 52, "Bleed hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_poison", "micro-icons", 790, 673, 52, 52, "Poison hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_skull", "micro-icons", 445, 759, 52, 52, "Skull hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_shield", "micro-icons", 515, 759, 52, 52, "Shield hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_life", "micro-icons", 584, 759, 52, 52, "Life hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_mana", "micro-icons", 653, 759, 52, 52, "Mana hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_resist", "micro-icons", 722, 759, 52, 52, "Resist hazard icon."),
    CropSpec("assetpack3.png", "micro_hazard_danger", "micro-icons", 790, 759, 52, 52, "Danger hazard icon."),
)


def clamp_box(image: Image.Image, spec: CropSpec) -> tuple[int, int, int, int]:
    left = max(0, spec.x)
    top = max(0, spec.y)
    right = min(image.width, spec.x + spec.width)
    bottom = min(image.height, spec.y + spec.height)
    if right <= left or bottom <= top:
        raise ValueError(f"Invalid crop for {spec.name}: {(left, top, right, bottom)}")
    return left, top, right, bottom


def crop_assets() -> list[dict[str, object]]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, object]] = []
    for spec in CROPS:
        source_path = SOURCE_DIR / spec.source
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        with Image.open(source_path) as source:
            crop = source.crop(clamp_box(source, spec)).convert("RGBA")
        output_path = OUT_DIR / f"{spec.name}.png"
        crop.save(output_path)
        item = asdict(spec)
        item.update(
            {
                "output": output_path.relative_to(ROOT).as_posix(),
                "source_path": source_path.relative_to(ROOT).as_posix(),
                "output_width": crop.width,
                "output_height": crop.height,
                "review_status": "candidate",
            }
        )
        manifest.append(item)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def load_font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def wrapped_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.replace("_", " ").split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines[:2]


def make_contact_sheet(manifest: Iterable[dict[str, object]]) -> None:
    items = list(manifest)
    thumb_w, thumb_h = 240, 150
    label_h = 48
    gap = 18
    cols = 4
    rows = (len(items) + cols - 1) // cols
    sheet_w = cols * thumb_w + (cols + 1) * gap
    sheet_h = rows * (thumb_h + label_h) + (rows + 1) * gap
    sheet = Image.new("RGB", (sheet_w, sheet_h), (8, 10, 12))
    draw = ImageDraw.Draw(sheet)
    label_font = load_font(14)
    meta_font = load_font(11)

    for index, item in enumerate(items):
        row, col = divmod(index, cols)
        x = gap + col * (thumb_w + gap)
        y = gap + row * (thumb_h + label_h + gap)
        crop_path = ROOT / str(item["output"])
        with Image.open(crop_path) as crop:
            crop.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            thumb_x = x + (thumb_w - crop.width) // 2
            thumb_y = y + (thumb_h - crop.height) // 2
            sheet.paste(crop.convert("RGB"), (thumb_x, thumb_y))

        draw.rectangle((x, y, x + thumb_w, y + thumb_h), outline=(59, 85, 92), width=1)
        label_y = y + thumb_h + 6
        for line in wrapped_lines(draw, str(item["name"]), label_font, thumb_w):
            draw.text((x, label_y), line, fill=(220, 210, 190), font=label_font)
            label_y += 16
        draw.text((x, y + thumb_h + 38), str(item["category"]), fill=(86, 170, 195), font=meta_font)

    sheet.save(CONTACT_SHEET)


def main() -> None:
    manifest = crop_assets()
    make_contact_sheet(manifest)
    print(f"Extracted {len(manifest)} crops")
    print(f"Manifest: {MANIFEST_PATH}")
    print(f"Contact sheet: {CONTACT_SHEET}")


if __name__ == "__main__":
    main()
